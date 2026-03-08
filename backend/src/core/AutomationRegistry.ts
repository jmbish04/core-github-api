import { eq } from 'drizzle-orm';
import { getWebhooksDb } from '@db';
import { webhookConfigs } from '@/db/schemas/webhooks/automations';
import {
  type AutomationClass,
  type AutomationExecutionContext,
  type AutomationMetadata,
} from './BaseAutomation';
import { BugHunter } from '@/automations/issues/BugHunter';
import { JulesAutoFix } from '@/automations/issues/JulesAutoFix';
import { SlashCommand } from '@/automations/issues/SlashCommand';
import { TaskSync } from '@/automations/issues/TaskSync';
import { AgentTagger } from '@/automations/pr/AgentTagger';
import { BuildAnalyzer } from '@/automations/pr/BuildAnalyzer';
import { DocstringGenerator } from '@/automations/pr/DocstringGenerator';
import { GeminiReview } from '@/automations/pr/GeminiReview';
import { PRIngest } from '@/automations/pr/PRIngest';
import { PRReviewExtraction } from '@/automations/pr/PRReviewExtraction';
import { GardenerPush } from '@/automations/push/GardenerPush';
import { JulesStandardsPush } from '@/automations/push/JulesStandardsPush';
import { RepoStandardization } from '@/automations/repository/RepoStandardization';
import { RepoSync } from '@/automations/repository/RepoSync';
import { StatsUpdate } from '@/automations/repository/StatsUpdate';
import { LeakPlumber } from '@/automations/security/LeakPlumber';
import { TelemetryIngestion } from '@/automations/telemetry/TelemetryIngestion';

export type RegisteredAutomation = AutomationClass<any>;

export interface AutomationDefinition {
  automationClass: string;
  metadata: AutomationMetadata;
}

export const REGISTERED_AUTOMATIONS: RegisteredAutomation[] = [
  TelemetryIngestion,
  RepoSync,
  StatsUpdate,
  TaskSync,
  PRIngest,
  GeminiReview,
  DocstringGenerator,
  PRReviewExtraction,
  AgentTagger,
  BuildAnalyzer,
  BugHunter,
  JulesAutoFix,
  SlashCommand,
  GardenerPush,
  JulesStandardsPush,
  RepoStandardization,
  LeakPlumber,
];

const AUTOMATIONS_BY_CLASS = new Map<string, RegisteredAutomation>(
  REGISTERED_AUTOMATIONS.map((automation) => [automation.name, automation]),
);

export class AutomationRegistry {
  static definitions(): AutomationDefinition[] {
    return REGISTERED_AUTOMATIONS.map((automation) => ({
      automationClass: automation.name,
      metadata: automation.metadata,
    }));
  }

  static alwaysOnClasses(): string[] {
    return REGISTERED_AUTOMATIONS.filter((automation) => automation.metadata.alwaysOn).map(
      (automation) => automation.name,
    );
  }

  static find(automationClass: string): RegisteredAutomation | undefined {
    return AUTOMATIONS_BY_CLASS.get(automationClass);
  }

  private static async configuredClasses(env: Env): Promise<Set<string>> {
    const db = getWebhooksDb(env.DB_WEBHOOKS);
    const activeConfigs = await db
      .select({
        automationClass: webhookConfigs.automationClass,
      })
      .from(webhookConfigs)
      .where(eq(webhookConfigs.isActive, true))
      .all();

    return new Set(activeConfigs.map((config) => config.automationClass));
  }

  static async dispatch(
    context: AutomationExecutionContext<any>,
  ): Promise<PromiseSettledResult<void>[]> {
    const configured = await this.configuredClasses(context.env);
    const eligibleAutomations = REGISTERED_AUTOMATIONS.filter(
      (automation) => automation.metadata.alwaysOn || configured.has(automation.name),
    );

    const executions = eligibleAutomations.map(async (AutomationCtor) => {
      const instance = new AutomationCtor(context);

      try {
        const shouldRun = await instance.shouldRun();
        if (!shouldRun) {
          return;
        }

        await instance.run();
      } catch (error) {
        console.error(`[AutomationRegistry] ${AutomationCtor.name} failed`, error);
        await instance.logExecution(
          'failure',
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    });

    return Promise.allSettled(executions);
  }
}
