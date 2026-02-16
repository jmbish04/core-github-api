import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@db";
import { organizationSettings, userSettings } from "@/db/schemas/app/settings";
import {
  GOLDEN_PATH_DEFAULTS,
  GOLDEN_PATH_SYSTEM_PROMPT,
} from "@/standards/goldenPath";

const settingsApi = new Hono<{ Bindings: Env }>();
const DEFAULT_CONTROL_CENTER_USER = "default-user";

function normalizeUserId(input?: string | null): string {
  const trimmed = String(input || "").trim();
  return trimmed || DEFAULT_CONTROL_CENTER_USER;
}

function parseOverrides(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function ensureSettingsTables(db: ReturnType<typeof getDb>) {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY NOT NULL,
      preferred_provider TEXT NOT NULL DEFAULT 'worker-ai',
      preferred_model TEXT NOT NULL DEFAULT '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      enforce_golden_path INTEGER NOT NULL DEFAULT 1,
      custom_instructions TEXT,
      golden_path_overrides_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_user_settings_provider ON user_settings(preferred_provider)`,
  );

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS organization_settings (
      organization_id TEXT PRIMARY KEY NOT NULL,
      display_name TEXT,
      preferred_provider TEXT NOT NULL DEFAULT 'worker-ai',
      preferred_model TEXT NOT NULL DEFAULT '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      enforce_golden_path INTEGER NOT NULL DEFAULT 1,
      custom_instructions TEXT,
      golden_path_overrides_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_org_settings_provider ON organization_settings(preferred_provider)`,
  );
}

settingsApi.get("/", async (c) => {
  try {
    const db = getDb(c.env.DB);
    await ensureSettingsTables(db);
    const userId = normalizeUserId(c.req.query("userId") || c.req.header("x-user-id"));

    const existing = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1)
      .then((rows) => rows[0]);

    const settings = existing
      ? {
          userId: existing.userId,
          preferredProvider: existing.preferredProvider,
          preferredModel: existing.preferredModel,
          enforceGoldenPath: Boolean(existing.enforceGoldenPath),
          customInstructions: existing.customInstructions || "",
          goldenPathOverrides: parseOverrides(existing.goldenPathOverridesJson),
        }
      : {
          userId,
          preferredProvider: "worker-ai",
          preferredModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
          enforceGoldenPath: true,
          customInstructions: "",
          goldenPathOverrides: {},
        };

    return c.json({
      success: true,
      settings,
      goldenPath: {
        defaults: GOLDEN_PATH_DEFAULTS,
        systemPrompt: GOLDEN_PATH_SYSTEM_PROMPT,
      },
    });
  } catch (error: any) {
    console.error("[api/settings] Failed to fetch settings:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

settingsApi.put("/", async (c) => {
  const db = getDb(c.env.DB);
  await ensureSettingsTables(db);
  const body = (await c.req.json().catch(() => ({}))) as {
    userId?: string;
    preferredProvider?: string;
    preferredModel?: string;
    enforceGoldenPath?: boolean;
    customInstructions?: string;
    goldenPathOverrides?: Record<string, unknown>;
  };

  const userId = normalizeUserId(body.userId || c.req.header("x-user-id"));
  const now = new Date().toISOString();
  const preferredProvider = String(body.preferredProvider || "worker-ai").trim() || "worker-ai";
  const preferredModel =
    String(body.preferredModel || "@cf/meta/llama-3.3-70b-instruct-fp8-fast").trim() ||
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const enforceGoldenPath = body.enforceGoldenPath === false ? 0 : 1;
  const customInstructions = String(body.customInstructions || "").trim() || null;
  const goldenPathOverrides = body.goldenPathOverrides || {};

  await db
    .insert(userSettings)
    .values({
      userId,
      preferredProvider,
      preferredModel,
      enforceGoldenPath,
      customInstructions,
      goldenPathOverridesJson: JSON.stringify(goldenPathOverrides),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        preferredProvider,
        preferredModel,
        enforceGoldenPath,
        customInstructions,
        goldenPathOverridesJson: JSON.stringify(goldenPathOverrides),
        updatedAt: now,
      },
    });

  return c.json({
    success: true,
    settings: {
      userId,
      preferredProvider,
      preferredModel,
      enforceGoldenPath: Boolean(enforceGoldenPath),
      customInstructions: customInstructions || "",
      goldenPathOverrides,
      updatedAt: now,
    },
  });
});

settingsApi.get("/organization/:organizationId", async (c) => {
  const db = getDb(c.env.DB);
  await ensureSettingsTables(db);
  const organizationId = String(c.req.param("organizationId") || "").trim();
  if (!organizationId) {
    return c.json({ success: false, error: "organizationId is required." }, 400);
  }

  const existing = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!existing) {
    return c.json({
      success: true,
      settings: {
        organizationId,
        preferredProvider: "worker-ai",
        preferredModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        enforceGoldenPath: true,
        customInstructions: "",
        goldenPathOverrides: {},
      },
    });
  }

  return c.json({
    success: true,
    settings: {
      organizationId: existing.organizationId,
      displayName: existing.displayName || "",
      preferredProvider: existing.preferredProvider,
      preferredModel: existing.preferredModel,
      enforceGoldenPath: Boolean(existing.enforceGoldenPath),
      customInstructions: existing.customInstructions || "",
      goldenPathOverrides: parseOverrides(existing.goldenPathOverridesJson),
      updatedAt: existing.updatedAt,
    },
  });
});

export default settingsApi;
