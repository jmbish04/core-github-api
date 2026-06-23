import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { getAgentByName } from 'agents';
import type {
  PlanningDecisionInput,
  PlanningRequestInput,
  PlanningRequestStatus,
} from "@/lib/schemas/jules";
import { JulesService } from "@/services/jules/service";
import { JulesSessionBuilder } from "@/services/jules/builder";
import {
  applyJulesActivityToPlanningCapture,
  createEmptyPlanningCapture,
  extractFilesFromDiff,
  type PlanningCaptureState,
  type PlanningSessionResultSummary,
} from "@/services/planning/babysitter";
import {
  putPlanningTextArtifact,
  upsertPlanningMarkdownArtifact,
  vectorizePlanningArtifact,
} from "@/services/planning/artifacts";
import { broadcastPlanningEvent } from "@/services/planning/monitor";
import { buildStitchSpec } from "@/services/planning/stitch";
import {
  createPlanningArtifact,
  updatePlanningRequest,
} from "@/services/planning/store";

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

function repoFullNameFromInput(input: PlanningWorkflowPayload): string | undefined {
  if (!input.githubRepo) {
    return undefined;
  }
  return input.githubRepo;
}

async function broadcastActivity(env: Env, requestId: string, activity: any): Promise<void> {
  switch (activity?.type) {
    case "planGenerated":
      await broadcastPlanningEvent(env, requestId, {
        source: "jules",
        type: "PLAN",
        status: "awaiting_plan_approval",
        title: "Jules generated a plan",
        message: "The session is ready for plan review.",
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
        source: "jules",
        type: "MESSAGE",
        title: "Jules message",
        message: activity.message,
      });
      break;
    case "progressUpdated": {
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

      await broadcastPlanningEvent(env, requestId, {
        source: "jules",
        type: "PROGRESS",
        status: "implementing",
        title: activity.title || "Implementation progress",
        message: activity.description,
      });

      if (files.length > 0) {
        await broadcastPlanningEvent(env, requestId, {
          source: "jules",
          type: "DIFF_SUMMARY",
          status: "implementing",
          title: activity.title || "Code diff detected",
          files,
        });
      }
      break;
    }
    case "sessionCompleted":
      await broadcastPlanningEvent(env, requestId, {
        source: "jules",
        type: "COMPLETED",
        status: "completed",
        title: "Jules completed the session",
        message: "The Jules session reached a completed state.",
      });
      break;
    case "sessionFailed":
      await broadcastPlanningEvent(env, requestId, {
        source: "jules",
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

async function materializePlanningMarkdown(
  env: Env,
  input: {
    requestId: string;
    workstream: PlanningWorkflowPayload["workstream"];
    prompt: string;
    githubRepo?: string;
    baseBranch?: string;
    capture: PlanningCaptureState;
    result?: PlanningSessionResultSummary | null;
    failureMessage?: string | null;
  },
): Promise<string> {
  const agent = await getAgentByName(env.ORCHESTRATOR_AGENT as any, `planning-supervisor-${input.requestId}`);
  const result = await (agent as any).materialize(input);
  return result.markdown;
}

async function orchestrateApprovedPlan(
  env: Env,
  input: {
    requestId: string;
    workstream: PlanningWorkflowPayload["workstream"];
    markdown: string;
    projectId?: string;
    projectName?: string;
  },
) {
  const agent = await getAgentByName(env.ORCHESTRATOR_AGENT as any, `planning-orchestrator-${input.requestId}`);
  return (agent as any).orchestrate(input);
}

async function waitForDecision(
  step: WorkflowStep,
  name: string,
): Promise<PlanningDecisionInput> {
  const event = await step.waitForEvent<PlanningDecisionInput>(name, {
    type: "planning.decision",
    timeout: "7 days",
  });
  return event.payload;
}

function shouldContinueImplementation(payload: PlanningWorkflowPayload): boolean {
  return Boolean(payload.autoImplement) || payload.workstream === "stitch_implementation";
}

function shouldAutoOrchestrate(payload: PlanningWorkflowPayload): boolean {
  return Boolean(payload.autoOrchestrate) || payload.workstream !== "api_request";
}

async function storeStitchSpecArtifact(
  env: Env,
  payload: PlanningWorkflowPayload,
): Promise<{ artifactId: string; key: string; markdown: string }> {
  const stitchSpec = await buildStitchSpec(env, {
    stitchProjectId: payload.stitchProjectId!,
    stitchScreenIds: payload.stitchScreenIds,
  });

  const artifact = await putPlanningTextArtifact(env, {
    requestId: payload.requestId,
    name: "stitch/spec.md",
    artifactKind: "stitch_spec",
    content: stitchSpec.markdown,
    mimeType: "text/markdown; charset=utf-8",
    metadata: stitchSpec.metadata,
  });

  return {
    artifactId: artifact.artifactId,
    key: artifact.key,
    markdown: stitchSpec.markdown,
  };
}

async function storeChangeSetArtifacts(
  env: Env,
  requestId: string,
  result: PlanningSessionResultSummary | null,
) {
  if (!result?.rawResult) {
    return;
  }

  const rawResult = result.rawResult as {
    outputs?: Array<{
      type?: string;
      changeSet?: {
        gitPatch?: {
          unidiffPatch?: string;
        };
      };
    }>;
  };

  const output = (rawResult.outputs || []).find((candidate) => candidate?.type === "changeSet");
  const patch = output?.changeSet?.gitPatch?.unidiffPatch;
  if (!patch) {
    return;
  }

  const files = Array.from(extractFilesFromDiff(patch).keys());
  await putPlanningTextArtifact(env, {
    requestId,
    name: `diffs/${Date.now()}.patch`,
    artifactKind: "jules_change_set",
    content: patch,
    mimeType: "text/x-diff; charset=utf-8",
    metadata: {
      files,
    },
  });
}

export class PlanningOrchestrator extends WorkflowEntrypoint<Env, PlanningWorkflowPayload> {
  async run(event: Readonly<WorkflowEvent<PlanningWorkflowPayload>>, step: WorkflowStep) {
    const payload = event.payload;
    const requestId = payload.requestId;
    const jules = JulesService.getInstance(this.env);
    let sessionId = "";
    let capture = createEmptyPlanningCapture();
    let failureMessage: string | null = null;
    let finalStatus: PlanningRequestStatus = "completed";
    let result: PlanningSessionResultSummary | null = null;

    try {
      await step.do("mark-running", async () => {
        await updatePlanningRequest(this.env, requestId, { status: "running" });
        await broadcastPlanningEvent(this.env, requestId, {
          source: "workflow",
          type: "STATUS",
          status: "running",
          title: "Planning request started",
          message: "Workflow execution started.",
        });
      });

      if (
        payload.workstream === "integration_stitch" ||
        payload.workstream === "stitch_implementation"
      ) {
        const stitchArtifact = await step.do("generate-stitch-spec", async () => {
          const artifact = await storeStitchSpecArtifact(this.env, payload);
          await updatePlanningRequest(this.env, requestId, {
            status: "awaiting_stitch_approval",
          });
          await broadcastPlanningEvent(this.env, requestId, {
            source: "stitch",
            type: "ARTIFACT_READY",
            status: "awaiting_stitch_approval",
            title: "Stitch design spec ready",
            message: "Review the Stitch artifact before continuing to Jules planning.",
            artifact: {
              key: artifact.key,
              viewUrl: `${this.env.BASE_URL || ""}/api/planning/${requestId}/artifacts/${artifact.artifactId}`,
              rawUrl: `${this.env.BASE_URL || ""}/api/planning/${requestId}/artifacts/${artifact.artifactId}?raw=1`,
              downloadUrl: `${this.env.BASE_URL || ""}/api/planning/${requestId}/artifacts/${artifact.artifactId}?download=1`,
            },
          });
          return artifact;
        });

        let stitchApproved = payload.dryRun;
        let stitchDecisionCount = 0;

        while (!stitchApproved && !failureMessage) {
          const decision = await waitForDecision(step, `await-stitch-decision-${stitchDecisionCount++}`);
          if (decision.decision === "reject") {
            finalStatus = "rejected";
            failureMessage = decision.notes || "Stitch design was rejected before Jules planning.";
            break;
          }

          if (decision.decision === "revise") {
            await updatePlanningRequest(this.env, requestId, { status: "revising" });
            await broadcastPlanningEvent(this.env, requestId, {
              source: "user",
              type: "MESSAGE",
              status: "revising",
              title: "Stitch revision requested",
              message: decision.notes || "User requested Stitch revisions.",
            });

            await step.do(`refresh-stitch-spec-${stitchDecisionCount}`, async () => {
              const refreshed = await storeStitchSpecArtifact(this.env, payload);
              await broadcastPlanningEvent(this.env, requestId, {
                source: "stitch",
                type: "ARTIFACT_READY",
                status: "awaiting_stitch_approval",
                title: "Stitch design spec refreshed",
                message: "Updated Stitch artifact is ready for review.",
                artifact: {
                  key: refreshed.key,
                  viewUrl: `${this.env.BASE_URL || ""}/api/planning/${requestId}/artifacts/${refreshed.artifactId}`,
                  rawUrl: `${this.env.BASE_URL || ""}/api/planning/${requestId}/artifacts/${refreshed.artifactId}?raw=1`,
                  downloadUrl: `${this.env.BASE_URL || ""}/api/planning/${requestId}/artifacts/${refreshed.artifactId}?download=1`,
                },
              });
              await updatePlanningRequest(this.env, requestId, { status: "awaiting_stitch_approval" });
            });
            continue;
          }

          stitchApproved = true;
          await updatePlanningRequest(this.env, requestId, {
            status: "running",
            approvedBy: decision.actedBy || "user",
          });
          await broadcastPlanningEvent(this.env, requestId, {
            source: "user",
            type: "APPROVED",
            status: "running",
            title: "Stitch design approved",
            message: "Proceeding to Jules planning.",
            data: {
              artifactKey: stitchArtifact.key,
            },
          });
        }
      }

      if (!failureMessage) {
        sessionId = await step.do("create-planning-session", async () => {
          const stitchContext =
            payload.workstream === "integration_stitch" || payload.workstream === "stitch_implementation"
              ? `\n\nDesign source: Stitch project ${payload.stitchProjectId} ${payload.stitchScreenIds?.length ? `screens ${payload.stitchScreenIds.join(", ")}` : ""}.`
              : "";

          const repo = repoFromInput(payload);
          const builder = new JulesSessionBuilder(this.env)
            .withPrompt(`${payload.prompt}${stitchContext}`)
            .withoutAutoPr()
            .withApproval(payload.requiresPlanApproval ?? true)
            .withProjectId(payload.projectId)
            .withPlanningRequest(requestId, shouldContinueImplementation(payload) ? "planning_and_implementation" : "planning")
            .withSessionId(requestId);

          if (repo) builder.withRepo(repo.owner, repo.repo, repo.branch);

          const session = await builder.start();

          await updatePlanningRequest(this.env, requestId, {
            julesSessionId: session.id,
          });
          await broadcastPlanningEvent(this.env, requestId, {
            source: "workflow",
            type: "STATUS",
            status: "running",
            title: "Jules planning session created",
            message: `Session ${session.id} created.`,
          });

          return session.id;
        });

        const preApproval = await step.do("capture-plan", async () => {
          await jules.waitForState(sessionId, "awaitingPlanApproval");
          const info = await jules.getSessionInfo(sessionId);
          const snapshot = (await jules.getSessionSnapshot(sessionId, {
            activities: true,
          })) as { activities?: any[]; state?: string };

          const nextCapture = await captureSnapshotActivities(
            this.env,
            requestId,
            createEmptyPlanningCapture(),
            snapshot.activities || [],
          );

          return {
            state: info.state,
            capture: nextCapture,
          };
        });

        capture = preApproval.capture;

        if (preApproval.state === "failed" || capture.failedReason) {
          finalStatus = "failed";
          failureMessage = capture.failedReason || "Jules failed before plan approval.";
        } else if (!payload.dryRun) {
          await updatePlanningRequest(this.env, requestId, { status: "awaiting_plan_approval" });
          await broadcastPlanningEvent(this.env, requestId, {
            source: "workflow",
            type: "AWAITING_APPROVAL",
            status: "awaiting_plan_approval",
            title: "Awaiting plan approval",
            message: "Approve, revise, or reject the Jules implementation plan.",
          });

          let planDecisionCount = 0;
          let planApproved = false;

          while (!planApproved && !failureMessage) {
            const decision = await waitForDecision(step, `await-plan-decision-${planDecisionCount++}`);

            if (decision.decision === "reject") {
              finalStatus = "rejected";
              failureMessage = decision.notes || "Plan rejected by reviewer.";
              break;
            }

            if (decision.decision === "revise") {
              await updatePlanningRequest(this.env, requestId, { status: "revising" });
              await broadcastPlanningEvent(this.env, requestId, {
                source: "user",
                type: "MESSAGE",
                status: "revising",
                title: "Plan revision requested",
                message: decision.notes || "Reviewer requested plan revisions.",
              });

              await step.do(`request-plan-revision-${planDecisionCount}`, async () => {
                await jules.sendMessage(
                  sessionId,
                  decision.notes ||
                    "Revise the implementation plan based on reviewer feedback and regenerate the plan.",
                );
                await jules.waitForState(sessionId, "awaitingPlanApproval");
                const snapshot = (await jules.getSessionSnapshot(sessionId, {
                  activities: true,
                })) as { activities?: any[] };
                capture = await captureSnapshotActivities(
                  this.env,
                  requestId,
                  createEmptyPlanningCapture(),
                  snapshot.activities || [],
                );
                await updatePlanningRequest(this.env, requestId, { status: "awaiting_plan_approval" });
              });
              continue;
            }

            planApproved = true;
            await updatePlanningRequest(this.env, requestId, {
              status: "approved",
              approvedBy: decision.actedBy || "user",
              approvedAt: new Date().toISOString(),
            });
            await broadcastPlanningEvent(this.env, requestId, {
              source: "user",
              type: "APPROVED",
              status: "approved",
              title: "Plan approved",
              message: `Approved by ${decision.actedBy || "user"}.`,
              data: decision.notes || null,
            });

            if (shouldContinueImplementation(payload)) {
              await step.do("approve-session-for-implementation", async () => {
                await jules.approveSession(sessionId);
              });

              await updatePlanningRequest(this.env, requestId, { status: "implementing" });
              await broadcastPlanningEvent(this.env, requestId, {
                source: "workflow",
                type: "STATUS",
                status: "implementing",
                title: "Implementation started",
                message: "Jules is executing the approved plan.",
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
          }
        }
      }

      finalStatus = await step.do("finalize-request", async () => {
        if (!payload.dryRun && sessionId && shouldContinueImplementation(payload) && !failureMessage) {
          try {
            result = await jules.getSessionResult(sessionId);
          } catch (error) {
            failureMessage =
              error instanceof Error ? error.message : "Failed to retrieve Jules result";
          }
        }

        const markdown = await materializePlanningMarkdown(this.env, {
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
          projectName: payload.projectName,
          repoFullName: repoFullNameFromInput(payload),
          workstream: payload.workstream,
          markdown,
        });

        await updatePlanningRequest(this.env, requestId, {
          latestPlanArtifactId: artifact.artifactId,
          r2PlanKey: artifact.key,
          vectorizeIndexId,
          errorMessage: failureMessage || null,
        });

        await broadcastPlanningEvent(this.env, requestId, {
          source: "workflow",
          type: "ARTIFACT_READY",
          status: failureMessage ? "failed" : "orchestrating",
          title: "Plan artifact stored",
          message: "Markdown artifact uploaded to R2.",
          artifact: {
            key: artifact.key,
            ...artifact.urls,
          },
        });

        if (result) {
          await storeChangeSetArtifacts(this.env, requestId, result);

          const pullRequest = result.outputs?.pullRequests?.[0];
          if (pullRequest?.url) {
            await createPlanningArtifact(this.env, {
              requestId,
              artifactKind: "github_pr",
              storageDriver: "github",
              storageKey: pullRequest.url,
              mimeType: "text/plain",
              metadata: pullRequest,
            });
          }
        }

        if (!failureMessage && shouldAutoOrchestrate(payload)) {
          await updatePlanningRequest(this.env, requestId, {
            status: "orchestrating",
          });

          await orchestrateApprovedPlan(this.env, {
            requestId,
            workstream: payload.workstream,
            markdown,
            projectId: payload.projectId,
            projectName: payload.projectName,
          });
        }

        const resolvedStatus: PlanningRequestStatus =
          finalStatus === "rejected"
            ? "rejected"
            : failureMessage
              ? "failed"
              : "completed";

        await updatePlanningRequest(this.env, requestId, {
          status: resolvedStatus,
          completedAt: new Date().toISOString(),
          errorMessage: failureMessage || null,
        });

        await broadcastPlanningEvent(this.env, requestId, {
          source: "workflow",
          type: failureMessage ? "ERROR" : resolvedStatus === "rejected" ? "STATUS" : "COMPLETED",
          status: resolvedStatus,
          title:
            resolvedStatus === "rejected"
              ? "Planning request rejected"
              : failureMessage
                ? "Planning workflow failed"
                : "Planning workflow completed",
          message:
            resolvedStatus === "rejected"
              ? failureMessage || "Planning request rejected."
              : failureMessage || "Artifacts and derived plans are ready.",
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
        source: "workflow",
        type: "ERROR",
        status: "failed",
        title: "Planning workflow failed",
        message,
      });
      throw error;
    }
  }
}
