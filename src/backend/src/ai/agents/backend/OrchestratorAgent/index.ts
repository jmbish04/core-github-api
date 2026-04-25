/**
 * @file src/ai/agents/OrchestratorAgent/index.ts
 * @description OrchestratorAgent — the top-level coordinator of the MMoE hierarchy.
 *              Parses user requests into SWARM task trees, dispatches sprints to
 *              EngineerAgent, and subscribes to ChatRooms for lifecycle visibility.
 */

import { BaseAgent } from "@/ai/providers";
import { callable } from "agents";
import * as methods from "./methods";
import type { OrchestratorState } from "./types";
import { checkOrchestrationHealth } from "./health";
export { checkOrchestrationHealth };
import type { Sprint } from "../EngineerAgent/types";
import { submitBrief as submitBriefMethod } from "./methods/research";
import type {
  ReverseEngineeringRunPayload,
  ReverseEngineeringConsultPayload,
} from "./methods/reverse-engineering";
import type { ReverseEngineeringAuthInput } from "@/lib/schemas/reverse-engineering";

export class OrchestratorAgent extends BaseAgent<OrchestratorState> {
  private logPrefix = "[OrchestratorAgent] ";

  protected get skills() {
    return ['plan-writing', 'architecture', 'task-management'];
  }

  protected get agentName() {
    return 'OrchestratorAgent';
  }

  protected async agentInit() {}

  // ── Core SWARM Methods ─────────────────────────────────────────────────

  /**
   * Main entry point — parses a user prompt into a Sprint and dispatches it.
   */
  @callable()
  async submitRequest(prompt: string, repoContext: any) {
    this.logger.info(`${this.logPrefix} Submitting request: ${prompt}`);
    const { sprint, reasoning } = await methods.parseRequest(this, prompt, repoContext);
    this.logger.info(`${this.logPrefix} Parsed request: ${JSON.stringify(sprint)}`);

    // Auto-dispatch if the sprint has subtasks
    if (sprint.subtasks.length > 0) {
      const dispatchResult = await methods.dispatch(this, sprint);
      this.logger.info(`${this.logPrefix} Dispatch result: ${JSON.stringify(dispatchResult)}`);
      return { sprint, reasoning, dispatchResult };
    }

    const result = { sprint, reasoning };
    this.logger.info(`${this.logPrefix} Returning result: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Streaming variant of submitRequest — sends real-time SWARM orchestration
   * progress events via @callable SSE streaming.
   *
   * Client usage: agent.call("streamRequest", [prompt, repoContext], { stream: { onChunk } })
   */
  @callable({ streaming: true })
  async streamRequest(stream: import('agents').StreamingResponse, prompt: string, repoContext: any) {
    this.logger.info(`${this.logPrefix} Streaming request: ${prompt}`);
    stream.send({ type: 'orchestrate:parsing', prompt: prompt.slice(0, 120), timestamp: Date.now() });

    const { sprint, reasoning } = await methods.parseRequest(this, prompt, repoContext);
    stream.send({ type: 'orchestrate:parsed', reasoning, subtaskCount: sprint.subtasks.length, timestamp: Date.now() });

    if (sprint.subtasks.length > 0) {
      stream.send({ type: 'orchestrate:dispatching', subtaskCount: sprint.subtasks.length, timestamp: Date.now() });
      const dispatchResult = await methods.dispatch(this, sprint);
      stream.end({ type: 'orchestrate:complete', dispatchResult, sprint, timestamp: Date.now() });
    } else {
      stream.end({ type: 'orchestrate:complete', sprint, reasoning, timestamp: Date.now() });
    }
  }

  /**
   * Submit a new research brief to begin formulation.
   */
  @callable()
  async submitBrief(userId: string, title: string, content: any) {
    this.logger.info(`${this.logPrefix} Submitting brief: ${title}`);
    const result = await submitBriefMethod(this, userId, title, content);
    this.logger.info(`${this.logPrefix} Brief submitted: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Dispatch an already-parsed Sprint to the EngineerAgent.
   */
  @callable()
  async dispatchSprint(sprint: Sprint) {
    this.logger.info(`${this.logPrefix} Dispatching sprint: ${JSON.stringify(sprint)}`);
    const result = await methods.dispatch(this, sprint);
    this.logger.info(`${this.logPrefix} Dispatch result: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Subscribe to ChatRooms for live lifecycle events.
   */
  @callable()
  async subscribeToRooms(roomIds: string[]) {
    this.logger.info(`${this.logPrefix} Subscribing to rooms: ${JSON.stringify(roomIds)}`);
    const result = await methods.subscribeRooms(this, roomIds);
    this.logger.info(`${this.logPrefix} Rooms subscribed: ${JSON.stringify(result)}`);
    return result;
  }

  @callable()
  async onTaskComplete(requestId: string, _result: any) {
    this.logger.info(`${this.logPrefix} Task complete: ${requestId}`);
    await this.logger.flush();
  }

  @callable()
  async getStatus(_requestId: string) {
    this.logger.info(`${this.logPrefix} Getting status: ${_requestId}`);
    const result = this.state;
    this.logger.info(`${this.logPrefix} Status: ${JSON.stringify(result)}`);
    return result;
  }



  // ── Reverse-Engineering ─────────────────────────────────────────────────

  @callable()
  async runReverseEngineering(payload: ReverseEngineeringRunPayload) {
    this.logger.info(`${this.logPrefix} Running reverse engineering: ${JSON.stringify(payload)}`);
    const result = await methods.runReverseEngineering(this, payload);
    this.logger.info(`${this.logPrefix} Reverse engineering result: ${JSON.stringify(result)}`);
    return result;
  }

  @callable()
  async resumeReverseEngineering(
    snapshotId: string,
    auth: ReverseEngineeringAuthInput,
    frontendUrl?: string,
  ) {
    this.logger.info(`${this.logPrefix} Resuming reverse engineering: ${snapshotId}`);
    const result = await methods.resumeReverseEngineering(this, snapshotId, auth, frontendUrl);
    this.logger.info(`${this.logPrefix} Reverse engineering resumed: ${JSON.stringify(result)}`);
    return result;
  }

  @callable()
  async consultReverseEngineering(payload: ReverseEngineeringConsultPayload) {
    this.logger.info(`${this.logPrefix} Consulting reverse engineering: ${JSON.stringify(payload)}`);
    const result = await methods.consultReverseEngineering(this, payload);
    this.logger.info(`${this.logPrefix} Reverse engineering consulted: ${JSON.stringify(result)}`);
    return result;
  }
}
