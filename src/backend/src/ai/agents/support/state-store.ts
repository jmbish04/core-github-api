import { Logger } from '@/lib/logger';
import type { PersistentAgentState } from './types';

function isDurableObjectState(value: unknown): value is DurableObjectState {
  return !!value && typeof value === 'object' && 'storage' in (value as Record<string, unknown>);
}

export class AgentStateStore<State extends PersistentAgentState = PersistentAgentState> {
  readonly ctx: DurableObjectState;
  readonly env: Env;
  readonly logger: Logger;
  private currentState: State;
  private readonly readyPromise: Promise<void>;

  constructor(options: {
    ctx: DurableObjectState;
    env: Env;
    agentName: string;
    initialState: State;
    loggerNamespace?: string;
  }) {
    if (!isDurableObjectState(options.ctx)) {
      throw new Error('AgentStateStore requires a DurableObjectState');
    }

    this.ctx = options.ctx;
    this.env = options.env;
    this.logger = new Logger(options.env, options.loggerNamespace || options.agentName);
    this.currentState = this.clone(options.initialState);
    this.readyPromise = this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<State>('state');
      if (stored) {
        this.currentState = stored;
        return;
      }

      await this.ctx.storage.put('state', this.currentState);
    });
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  get state(): State {
    return this.currentState;
  }

  async set(nextState: State): Promise<void> {
    await this.ready();
    this.currentState = nextState;
    await this.ctx.storage.put('state', nextState);
  }

  async patch(partial: Partial<State>): Promise<void> {
    await this.set({
      ...this.state,
      ...partial,
    } as State);
  }

  async setStatus(status: string): Promise<void> {
    await this.ready();
    if (this.state.status !== status) {
      this.logger.info(`Status changed: ${this.state.status} -> ${status}`);
    }
    await this.patch({ status } as Partial<State>);
  }

  async appendHistory(entry: Record<string, unknown>): Promise<void> {
    await this.ready();
    const history = Array.isArray(this.state.history) ? this.state.history : [];
    await this.patch({ history: [...history, entry] } as Partial<State>);
  }
}
