import type { BaseAutomation } from './BaseAutomation';
import { GeminiReview } from '../automations/pr/GeminiReview';
import { BugHunter } from '../automations/issues/BugHunter';
import { JulesAutoFix } from '../automations/issues/JulesAutoFix';
import { SlashCommand } from '../automations/issues/SlashCommand';
import { TaskSync } from '../automations/issues/TaskSync';
import { RepoSync } from '../automations/repository/RepoSync';
import { StatsUpdate } from '../automations/repository/StatsUpdate';
import { JulesStandardsPush } from '../automations/push/JulesStandardsPush';
import { GardenerPush } from '../automations/push/GardenerPush';
import { TelemetryIngestion } from '../automations/telemetry/TelemetryIngestion';
import { PRIngest } from '../automations/pr/PRIngest';
import { PRReviewExtraction } from '../automations/pr/PRReviewExtraction';
import { AgentTagger } from '../automations/pr/AgentTagger';
import { BuildAnalyzer } from '../automations/pr/BuildAnalyzer';

export type AutomationClass = new (...args: any[]) => BaseAutomation<any>;

export const AutomationRegistry: Record<string, AutomationClass> = {
  TelemetryIngestion,
  RepoSync,
  StatsUpdate,
  GeminiReview,
  BugHunter,
  JulesAutoFix,
  SlashCommand,
  TaskSync,
  JulesStandardsPush,
  GardenerPush,
  PRIngest,
  PRReviewExtraction,
  AgentTagger,
  BuildAnalyzer,
};

// An array of essential core automations that should always run, regardless of db config UI display
// User might not want to explicitly "toggle" on standard database insertion.
export const SystemAutomations: string[] = [
  'TelemetryIngestion', 
  'RepoSync', 
  'StatsUpdate',
  'TaskSync',
  'PRIngest'
];
