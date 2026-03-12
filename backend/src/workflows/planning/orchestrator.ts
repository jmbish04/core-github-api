import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getAgentByName } from "@/ai/agents/runtime/agents";
import { getDb, projectPlanningRequests } from "@db";
import type { PlanningApprovalInput, PlanningRequestInput, PlanningRequestStatus } from "@/lib/schemas/jules";
import { JulesService } from "@/services/jules/service";
import {
  applyJulesActivityToPlanningCapture,
  buildPlanningMarkdown,
  createEmptyPlanningCapture,
  persistPlanBreakdown,
  type PlanningCaptureState,
  type PlanningSessionResultSummary,
} from "@/services/planning/honi-babysitter";
import {
  upsertPlanningMarkdownArtifact,
  vectorizePlanningArtifact,
} from "@/services/planning/artifacts";
import { broadcastPlanningEvent } from "@/services/planning/monitor";

export type PlanningWorkflowPayload = PlanningRequestInput & {
  requestId: string;
};

function repoFromInput(input: PlanningWorkflowPayload) {
  if (!input.githubRepo) {
    return undefined;
  }

  const [owner, repo] = input.githubRepo.split("/");
  return {
    owner,
    repo,
    branch: input.baseBranch || "main",
  };
}

async function updatePlanningRequest(
  env: Env,
  requestId: string,
  values: Partial<typeof projectPlanningRequests.$inferInsert>,
): Promise<void> {
  const db = getDb(env.DB);
  await db
    .update(projectPlanningRequests)
    .set({
      ...values,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projectPlanningRequests.id, requestId));
}

async function broadcastActivity(env: Env, requestId: string, activity: any): Promise<void> {
  switch (activity?.type) {
    case "planGenerated":
      await broadcastPlanningEvent(env, requestId, {
        type: "PLAN",
        status: "awaiting_plan_approval",
        title: "Jules generated a plan",
        message: "The session is ready for approval.",
        plan: {
          steps: (activity.plan?.steps || []).map((step: any) => ({
            id: step.id,
            index: step.index,
            title: step.title,
            description: step.description,
          })),
        },
      });
      break;
    case "agentMessaged":
      await broadcastPlanningEvent(env, requestId, {
        type: "MESSAGE",
        title: "Jules message",
        message: activity.message,
      });
      break;
    case "progressUpdated": {
      await broadcastPlanningEvent(env, requestId, {
        type: "PROGRESS",
        status: "implementing",
        title: activity.title,
        message: activity.description,
      });

      const files = (activity.artifacts || [])
        .filter((artifact: any) => artifact?.type === "changeSet")
        .flatMap((artifact: any) => {
          const parsed = typeof artifact.parsed === "function" ? artifact.parsed() : null;
          return (parsed?.files || []).map((file: any) => ({
            path: file.path,
            changeType: file.changeType,
            additions: file.additions,
            deletions: file.deletions,
          }));
        });

      if (files.length > 0) {
        await broadcastPlanningEvent(env, requestId, {
          type: "DIFF_SUMMARY",
          status: "implementing",
          title: activity.title,
          files,
        });
      }
      break;
    }
    case "sessionCompleted":
      await broadcastPlanningEvent(env, requestId, {
        type: "COMPLETED",
        status: "completed",
        title: "Jules completed the session",
        message: "Implementation finished.",
      });
      break;
    case "sessionFailed":
      await broadcastPlanningEvent(env, requestId, {
        type: "ERROR",
        status: "failed",
        title: "Jules session failed",
        message: activity.reason || "Unknown Jules failure",
      });
      break;
    default:
      break;
  }
}

async function captureSnapshotActivities(
  env: Env,
  requestId: string,
  capture: PlanningCaptureState,
  activities: any[],
): Promise<PlanningCaptureState> {
  let next = capture;
  for (const activity of activities) {
    next = applyJulesActivityToPlanningCapture(next, activity);
    await broadcastActivity(env, requestId, activity);
  }
  return next;
}

export class PlanningOrchestrator extends WorkflowEntrypoint<Env, PlanningWorkflowPayload> {
  async run(event: Readonly<WorkflowEvent<PlanningWorkflowPayload>>, step: WorkflowStep) {
    const payload = event.payload;
    const requestId = payload.requestId;
    const jules = JulesService.getInstance(this.env);
    let sessionId = "";

    try {
      await step.do("mark-running", async () => {
        await updatePlanningRequest(this.env, requestId, {
          status: "running",
        });
        await broadcastPlanningEvent(this.env, requestId, {
          type: "STATUS",
          status: "running",
          title: "Planning request queued",
          message: "Workflow execution started.",
        });
        return true;
      });

      sessionId = await step.do("create-session", async () => {
        const session = await jules.startSession({
          prompt: payload.prompt,
          repo: repoFromInput(payload),
          autoPr: false,
          requireApproval: true,
          projectId: payload.projectId,
          sessionId: requestId,
        });

        await updatePlanningRequest(this.env, requestId, {
          julesSessionId: session.id,
        });
        await broadcastPlanningEvent(this.env, requestId, {
          type: "STATUS",
          status: "running",
          title: "Jules session created",
          message: `Session ${session.id} created.`,
        });

        return session.id;
      });

      const preApproval = await step.do("capture-plan", async () => {
        await jules.waitForState(sessionId, "awaitingPlanApproval");
        const info = await jules.getSessionInfo(sessionId);
        const snapshot = (await jules.getSessionSnapshot(sessionId, {
          includeActivities: true,
        })) as { activities?: any[]; state?: string };

        const capture = await captureSnapshotActivities(
          this.env,
          requestId,
          createEmptyPlanningCapture(),
          snapshot.activities || [],
        );

        return {
          state: info.state,
          capture,
        };
      });

      let capture = preApproval.capture;
      let failureMessage: string | null = null;

      if (preApproval.state === "failed" || capture.failedReason) {
        failureMessage = capture.failedReason || "Jules failed before approval.";
      } else {
        await step.do("mark-awaiting-approval", async () => {
          await updatePlanningRequest(this.env, requestId, {
            status: "awaiting_plan_approval",
          });
          await broadcastPlanningEvent(this.env, requestId, {
            type: "AWAITING_APPROVAL",
            status: "awaiting_plan_approval",
            title: "Awaiting plan approval",
            message: payload.dryRun
              ? "Dry run captured the plan and will stop before implementation."
              : "Approve the plan to continue implementation.",
          });
          return true;
        });
      }

      if (!failureMessage && !payload.dryRun) {
        const approvalEvent = await step.waitForEvent<PlanningApprovalInput>("await-plan-approval", {
          type: "planning.approve",
          timeout: "7 days",
        });

        await step.do("approve-plan", async () => {
          await jules.approveSession(sessionId);
          await updatePlanningRequest(this.env, requestId, {
            status: "approved",
            approvedBy: approvalEvent.payload.approvedBy || "user",
            approvedAt: new Date().toISOString(),
          });
          await broadcastPlanningEvent(this.env, requestId, {
            type: "APPROVED",
            status: "approved",
            title: "Plan approved",
            message: `Approved by ${approvalEvent.payload.approvedBy || "user"}.`,
            data: approvalEvent.payload.notes || null,
          });
          return true;
        });

        await step.do("mark-implementing", async () => {
          await updatePlanningRequest(this.env, requestId, {
            status: "implementing",
          });
          await broadcastPlanningEvent(this.env, requestId, {
            type: "STATUS",
            status: "implementing",
            title: "Implementation started",
            message: "Jules is executing the approved plan.",
          });
          return true;
        });

        capture = await step.do("monitor-implementation", async () => {
          let nextCapture = capture;
          const stream = await jules.streamSession(sessionId);

          for await (const activity of stream) {
            nextCapture = applyJulesActivityToPlanningCapture(nextCapture, activity);
            await broadcastActivity(this.env, requestId, activity);

            if (activity.type === "sessionCompleted" || activity.type === "sessionFailed") {
              break;
            }
          }

          return nextCapture;
        });

        failureMessage = capture.failedReason || null;
      }

      const finalStatus = await step.do("finalize", async () => {
        let result: PlanningSessionResultSummary | null = null;
        if (!payload.dryRun && !failureMessage) {
          try {
            result = await jules.getSessionResult(sessionId);
          } catch (error) {
            failureMessage =
              error instanceof Error ? error.message : "Failed to retrieve Jules result";
          }
        }

        const markdown = buildPlanningMarkdown({
          requestId,
          workstream: payload.workstream,
          prompt: payload.prompt,
          githubRepo: payload.githubRepo,
          baseBranch: payload.baseBranch,
          capture,
          result,
          failureMessage,
        });

        const artifact = await upsertPlanningMarkdownArtifact(this.env, requestId, markdown);
        const vectorizeIndexId = await vectorizePlanningArtifact(this.env, {
          requestId,
          projectId: payload.projectId,
          markdown,
        });

        await updatePlanningRequest(this.env, requestId, {
          status: failureMessage ? "failed" : "orchestrating",
          r2PlanKey: artifact.key,
          vectorizeIndexId,
          errorMessage: failureMessage || null,
        });

        await broadcastPlanningEvent(this.env, requestId, {
          type: "ARTIFACT_READY",
          status: failureMessage ? "failed" : "orchestrating",
          title: "Plan artifact stored",
          message: "Markdown artifact uploaded to R2.",
          artifact: {
            key: artifact.key,
            ...artifact.urls,
          },
        });

        if (capture.planSteps.length > 0 || payload.dryRun) {
          const plannerStub = await getAgentByName(this.env.PLANNER, `planning-${requestId}`) as {
            fetch(request: Request): Promise<Response>;
          };

          const plannerResponse = await plannerStub.fetch(
            new Request("http://planner/breakdown", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requestId,
                workstream: payload.workstream,
                markdown,
                projectId: payload.projectId,
                projectName: payload.projectName,
              }),
            }),
          );

          if (!plannerResponse.ok) {
            throw new Error(`Planner breakdown failed: ${plannerResponse.status} ${await plannerResponse.text()}`);
          }

          const plannerPayload = (await plannerResponse.json()) as {
            success: boolean;
            breakdown: unknown;
          };

          await persistPlanBreakdown(
            this.env,
            {
              requestId,
              workstream: payload.workstream,
              markdown,
              projectId: payload.projectId,
              projectName: payload.projectName,
            },
            plannerPayload.breakdown as any,
          );
        }

        const resolvedStatus: PlanningRequestStatus = failureMessage ? "failed" : "completed";
        await updatePlanningRequest(this.env, requestId, {
          status: resolvedStatus,
          completedAt: new Date().toISOString(),
          errorMessage: failureMessage || null,
        });

        await broadcastPlanningEvent(this.env, requestId, {
          type: failureMessage ? "ERROR" : "COMPLETED",
          status: resolvedStatus,
          title: failureMessage ? "Planning workflow failed" : "Planning workflow completed",
          message: failureMessage || "Artifacts and derived plans are ready.",
        });

        return resolvedStatus;
      });

      return {
        requestId,
        sessionId,
        status: finalStatus,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Planning workflow failed unexpectedly";

      await updatePlanningRequest(this.env, requestId, {
        status: "failed",
        errorMessage: message,
      });
      await broadcastPlanningEvent(this.env, requestId, {
        type: "ERROR",
        status: "failed",
        title: "Planning workflow failed",
        message,
      });
      throw error;
    }
  }
}
