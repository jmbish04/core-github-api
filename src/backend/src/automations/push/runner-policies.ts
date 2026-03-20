import { desc, eq } from 'drizzle-orm';
import { getDb } from '@db';
import {
  automationRunnerPolicies,
  type AutomationRunnerKind,
  type AutomationRunnerPolicyRow,
} from '@/db/schemas/app/automation_runner_policies';
import { generateUuid } from '@/utils/common';

export interface AutomationRunnerPolicyFilters {
  automationKey?: string;
  triggerEvent?: string;
  activeOnly?: boolean;
}

export interface AutomationRunnerPolicyContext {
  automationKey: string;
  triggerEvent: string;
  ref?: string | null;
  repoOwner?: string | null;
  repoName?: string | null;
  infrastructure?: string | null;
}

export interface UpsertAutomationRunnerPolicyInput {
  title: string;
  description?: string | null;
  automationKey: string;
  triggerEvent: string;
  runnerKind: AutomationRunnerKind;
  targetRef?: string | null;
  repoOwner?: string | null;
  repoName?: string | null;
  branchPattern?: string | null;
  infrastructure?: string | null;
  priority?: number;
  isActive?: boolean;
}

const DEFAULT_STANDARDS_RUNNER_POLICIES: UpsertAutomationRunnerPolicyInput[] = [
  {
    title: 'Default Internal Standards Check',
    description: 'Run the default-branch push standards check through the internal coding agent.',
    automationKey: 'standards-check-push',
    triggerEvent: 'push',
    runnerKind: 'internal_agent',
    branchPattern: 'main',
    priority: 100,
    isActive: true,
  },
  {
    title: 'Optional Jules Standards Check',
    description: 'Alternative policy for running the standards check through Jules.',
    automationKey: 'standards-check-push',
    triggerEvent: 'push',
    runnerKind: 'jules',
    branchPattern: 'main',
    priority: 50,
    isActive: false,
  },
  {
    title: 'Optional GitHub Agent Assignment',
    description: 'Alternative policy for routing push standards checks to a GitHub agent assignment.',
    automationKey: 'standards-check-push',
    triggerEvent: 'push',
    runnerKind: 'github_assignment',
    targetRef: '@codex[agent]',
    branchPattern: 'main',
    priority: 50,
    isActive: false,
  },
];

function normalize(value?: string | null): string | null {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed : null;
}

function normalizeBranch(ref?: string | null): string {
  return String(ref || '').replace(/^refs\/heads\//, '').trim();
}

function toPatternRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesOptionalFilter(expected?: string | null, actual?: string | null): boolean {
  const normalizedExpected = normalize(expected);
  if (!normalizedExpected) {
    return true;
  }

  return normalize(actual)?.toLowerCase() === normalizedExpected.toLowerCase();
}

function matchesBranch(pattern?: string | null, ref?: string | null): boolean {
  const normalizedPattern = normalize(pattern);
  if (!normalizedPattern) {
    return true;
  }

  const branchName = normalizeBranch(ref);
  return toPatternRegex(normalizedPattern).test(branchName);
}

async function ensureAutomationRunnerPoliciesSeeded(env: Env): Promise<void> {
  const db = getDb(env.DB);
  const existing = await db.select().from(automationRunnerPolicies).limit(1);
  if (existing.length > 0) {
    return;
  }

  const now = new Date().toISOString();
  await db.insert(automationRunnerPolicies).values(
    DEFAULT_STANDARDS_RUNNER_POLICIES.map((policy) => ({
      id: generateUuid(),
      title: policy.title,
      description: normalize(policy.description),
      automationKey: policy.automationKey,
      triggerEvent: policy.triggerEvent,
      runnerKind: policy.runnerKind,
      targetRef: normalize(policy.targetRef),
      repoOwner: normalize(policy.repoOwner),
      repoName: normalize(policy.repoName),
      branchPattern: normalize(policy.branchPattern),
      infrastructure: normalize(policy.infrastructure),
      priority: policy.priority ?? 100,
      isActive: policy.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

export async function listAutomationRunnerPolicies(
  env: Env,
  filters: AutomationRunnerPolicyFilters = {},
): Promise<AutomationRunnerPolicyRow[]> {
  await ensureAutomationRunnerPoliciesSeeded(env);

  const db = getDb(env.DB);
  let rows = await db
    .select()
    .from(automationRunnerPolicies)
    .orderBy(desc(automationRunnerPolicies.priority), desc(automationRunnerPolicies.updatedAt))
    .all();

  if (filters.activeOnly) {
    rows = rows.filter((row) => Boolean(row.isActive));
  }

  if (filters.automationKey) {
    rows = rows.filter((row) => row.automationKey === filters.automationKey);
  }

  if (filters.triggerEvent) {
    rows = rows.filter((row) => row.triggerEvent === filters.triggerEvent);
  }

  return rows;
}

export async function createAutomationRunnerPolicy(
  env: Env,
  input: UpsertAutomationRunnerPolicyInput,
): Promise<AutomationRunnerPolicyRow> {
  await ensureAutomationRunnerPoliciesSeeded(env);

  const db = getDb(env.DB);
  const now = new Date().toISOString();
  const [row] = await db
    .insert(automationRunnerPolicies)
    .values({
      id: generateUuid(),
      title: input.title.trim(),
      description: normalize(input.description),
      automationKey: input.automationKey.trim(),
      triggerEvent: input.triggerEvent.trim(),
      runnerKind: input.runnerKind,
      targetRef: normalize(input.targetRef),
      repoOwner: normalize(input.repoOwner),
      repoName: normalize(input.repoName),
      branchPattern: normalize(input.branchPattern),
      infrastructure: normalize(input.infrastructure),
      priority: input.priority ?? 100,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return row;
}

export async function updateAutomationRunnerPolicy(
  env: Env,
  id: string,
  input: Partial<UpsertAutomationRunnerPolicyInput>,
): Promise<AutomationRunnerPolicyRow | null> {
  await ensureAutomationRunnerPoliciesSeeded(env);

  const db = getDb(env.DB);
  const patch: Partial<typeof automationRunnerPolicies.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = normalize(input.description);
  if (input.automationKey !== undefined) patch.automationKey = input.automationKey.trim();
  if (input.triggerEvent !== undefined) patch.triggerEvent = input.triggerEvent.trim();
  if (input.runnerKind !== undefined) patch.runnerKind = input.runnerKind;
  if (input.targetRef !== undefined) patch.targetRef = normalize(input.targetRef);
  if (input.repoOwner !== undefined) patch.repoOwner = normalize(input.repoOwner);
  if (input.repoName !== undefined) patch.repoName = normalize(input.repoName);
  if (input.branchPattern !== undefined) patch.branchPattern = normalize(input.branchPattern);
  if (input.infrastructure !== undefined) patch.infrastructure = normalize(input.infrastructure);
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  await db.update(automationRunnerPolicies).set(patch).where(eq(automationRunnerPolicies.id, id)).run();
  const row = await db
    .select()
    .from(automationRunnerPolicies)
    .where(eq(automationRunnerPolicies.id, id))
    .get();
  return row ?? null;
}

export async function deleteAutomationRunnerPolicy(env: Env, id: string): Promise<void> {
  await ensureAutomationRunnerPoliciesSeeded(env);

  const db = getDb(env.DB);
  await db.delete(automationRunnerPolicies).where(eq(automationRunnerPolicies.id, id)).run();
}

export async function resolveAutomationRunnerPolicy(
  env: Env,
  context: AutomationRunnerPolicyContext,
): Promise<AutomationRunnerPolicyRow> {
  const candidates = await listAutomationRunnerPolicies(env, {
    automationKey: context.automationKey,
    triggerEvent: context.triggerEvent,
    activeOnly: true,
  });

  const match = candidates.find((candidate) => {
    if (!matchesBranch(candidate.branchPattern, context.ref)) {
      return false;
    }

    if (!matchesOptionalFilter(candidate.repoOwner, context.repoOwner)) {
      return false;
    }

    if (!matchesOptionalFilter(candidate.repoName, context.repoName)) {
      return false;
    }

    if (!matchesOptionalFilter(candidate.infrastructure, context.infrastructure)) {
      return false;
    }

    return true;
  });

  if (match) {
    return match;
  }

  const fallback = DEFAULT_STANDARDS_RUNNER_POLICIES[0]!;
  return {
    id: 'default-standards-check-push',
    title: fallback.title,
    description: fallback.description || null,
    automationKey: fallback.automationKey,
    triggerEvent: fallback.triggerEvent,
    runnerKind: fallback.runnerKind,
    targetRef: fallback.targetRef || null,
    repoOwner: fallback.repoOwner || null,
    repoName: fallback.repoName || null,
    branchPattern: fallback.branchPattern || null,
    infrastructure: fallback.infrastructure || null,
    priority: fallback.priority ?? 100,
    isActive: fallback.isActive ?? true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}
