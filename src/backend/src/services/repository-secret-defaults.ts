import { asc, eq, sql } from 'drizzle-orm';

import { getDb } from '@db';
import { repositorySecretDefaults } from '@db/schemas/app/standardization';
import { type SecretDefinition } from '@/services/github/secrets-manager';
import { getSecret } from '@/utils/secrets';

const BOOTSTRAP_DEFAULT_SECRET_NAMES = [
  'STITCH_API_KEY',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_WRANGLER_API_TOKEN',
  'WORKER_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'AI_GATEWAY_TOKEN',
];

export type RepositorySecretDefaultRecord = typeof repositorySecretDefaults.$inferSelect;

function normalizeSecretName(secretName: string): string {
  return secretName.trim().toUpperCase();
}

function normalizeLegacySecretList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (typeof entry === 'string') {
        return normalizeSecretName(entry);
      }

      if (entry && typeof entry === 'object') {
        const name = Reflect.get(entry, 'secretName') ?? Reflect.get(entry, 'name');
        if (typeof name === 'string') {
          return normalizeSecretName(name);
        }
      }

      return '';
    })
    .filter(Boolean);
}

async function ensureRepositorySecretDefaultsSeeded(env: Env): Promise<void> {
  const db = getDb(env.DB);
  const existing = await db
    .select({ count: sql<number>`count(*)` })
    .from(repositorySecretDefaults)
    .get();

  if (Number(existing?.count ?? 0) > 0) {
    return;
  }

  let legacyDefaults: string[] = [];

  try {
    const raw = await env.KV_CONFIGS.get('DEFAULT_SYNC_SECRETS');
    if (raw) {
      const parsed = JSON.parse(raw);
      legacyDefaults = normalizeLegacySecretList(parsed?.value ?? parsed);
    }
  } catch (error) {
    console.warn('[RepositorySecretDefaults] Failed to read legacy DEFAULT_SYNC_SECRETS seed.', error);
  }

  const seedNames = Array.from(
    new Set([...BOOTSTRAP_DEFAULT_SECRET_NAMES, ...legacyDefaults].map(normalizeSecretName)),
  );

  if (!seedNames.length) {
    return;
  }

  const now = new Date().toISOString();
  await db
    .insert(repositorySecretDefaults)
    .values(
      seedNames.map((secretName) => ({
        secretName,
        description: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing({
      target: repositorySecretDefaults.secretName,
    });
}

export async function listRepositorySecretDefaults(
  env: Env,
  options?: { activeOnly?: boolean },
): Promise<RepositorySecretDefaultRecord[]> {
  await ensureRepositorySecretDefaultsSeeded(env);

  const db = getDb(env.DB);
  const baseQuery = db.select().from(repositorySecretDefaults);

  if (options?.activeOnly) {
    return baseQuery
      .where(eq(repositorySecretDefaults.isActive, true))
      .orderBy(asc(repositorySecretDefaults.secretName))
      .all();
  }

  return baseQuery.orderBy(asc(repositorySecretDefaults.secretName)).all();
}

export async function listActiveRepositorySecretNames(env: Env): Promise<string[]> {
  const records = await listRepositorySecretDefaults(env, { activeOnly: true });
  return records.map((record) => record.secretName);
}

export async function upsertRepositorySecretDefault(
  env: Env,
  input: {
    secretName: string;
    description?: string | null;
  },
): Promise<RepositorySecretDefaultRecord> {
  await ensureRepositorySecretDefaultsSeeded(env);

  const db = getDb(env.DB);
  const now = new Date().toISOString();
  const secretName = normalizeSecretName(input.secretName);
  const description = input.description?.trim() || null;

  await db
    .insert(repositorySecretDefaults)
    .values({
      secretName,
      description,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: repositorySecretDefaults.secretName,
      set: {
        description,
        isActive: true,
        updatedAt: now,
      },
    });

  const row = await db
    .select()
    .from(repositorySecretDefaults)
    .where(eq(repositorySecretDefaults.secretName, secretName))
    .get();

  if (!row) {
    throw new Error(`Failed to persist repository secret default for ${secretName}`);
  }

  return row;
}

export async function deactivateRepositorySecretDefault(
  env: Env,
  secretName: string,
): Promise<void> {
  await ensureRepositorySecretDefaultsSeeded(env);

  const db = getDb(env.DB);
  await db
    .update(repositorySecretDefaults)
    .set({
      isActive: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(repositorySecretDefaults.secretName, normalizeSecretName(secretName)))
    .run();
}

export async function buildRepositorySyncSecretPlan(env: Env): Promise<SecretDefinition[]> {
  const secretNames = await listActiveRepositorySecretNames(env);
  const secrets: SecretDefinition[] = [];

  for (const secretName of secretNames) {
    const value = await getSecret(env, secretName);
    if (!value) {
      continue;
    }

    secrets.push({ name: secretName, value });
  }

  return secrets;
}
