/**
 * @file backend/src/routes/api/jules/stitch.ts
 * @description Full Stitch SDK REST API — covers all available Stitch operations.
 *
 * Mount point: /api/jules/stitch (via jules index.ts)
 *
 * Endpoints:
 *   GET    /projects                                   — List all projects
 *   POST   /projects                                   — Create a new project
 *   GET    /projects/:projectId                        — Get a project by ID
 *   GET    /projects/:projectId/screens                — List screens in a project
 *   POST   /projects/:projectId/screens                — Generate a new screen
 *   GET    /projects/:projectId/screens/:screenId      — Get a single screen
 *   PATCH  /projects/:projectId/screens/:screenId      — Edit a screen
 *   POST   /projects/:projectId/screens/:screenId/variants — Generate variants
 *   GET    /tools                                      — List available Stitch tools
 *   POST   /                                           — Jules+Stitch context: generate screen via Jules
 *
 * @module Routes/Jules/Stitch
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { StitchService } from '@/services/stitch/service';
import { JulesSessionBuilder } from '@/services/jules/builder';

const app = new Hono<{ Bindings: Env }>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function err(c: any, e: any, status: 500 | 404 | 400 = 500) {
  return c.json({ success: false, error: e instanceof Error ? e.message : String(e) }, status);
}

// ─── Projects ─────────────────────────────────────────────────────────────────

/** GET /projects */
app.get('/projects', async (c) => {
  try {
    const svc = await StitchService.getInstance(c.env);
    const projects = await svc.listProjects();
    return c.json({ success: true, projects });
  } catch (e) {
    return err(c, e);
  }
});

/** POST /projects */
app.post(
  '/projects',
  zValidator('json', z.object({ title: z.string().optional() })),
  async (c) => {
    const { title } = c.req.valid('json');
    try {
      const svc = await StitchService.getInstance(c.env);
      const project = await svc.createProject(title);
      return c.json({ success: true, project });
    } catch (e) {
      return err(c, e);
    }
  },
);

/** GET /projects/:projectId */
app.get('/projects/:projectId', async (c) => {
  const { projectId } = c.req.param();
  try {
    const svc = await StitchService.getInstance(c.env);
    const project = await svc.getProject(projectId);
    return c.json({ success: true, project });
  } catch (e) {
    return err(c, e);
  }
});

// ─── Screens ──────────────────────────────────────────────────────────────────

/** GET /projects/:projectId/screens */
app.get('/projects/:projectId/screens', async (c) => {
  const { projectId } = c.req.param();
  try {
    const svc = await StitchService.getInstance(c.env);
    const screens = await svc.listScreens(projectId);
    return c.json({ success: true, screens });
  } catch (e) {
    return err(c, e);
  }
});

/** POST /projects/:projectId/screens */
app.post(
  '/projects/:projectId/screens',
  zValidator(
    'json',
    z.object({
      prompt: z.string().min(1),
      deviceType: z.enum(['DEVICE_TYPE_UNSPECIFIED', 'MOBILE', 'DESKTOP', 'TABLET', 'AGNOSTIC']).optional(),
      modelId: z.enum(['MODEL_ID_UNSPECIFIED', 'GEMINI_3_PRO', 'GEMINI_3_FLASH']).optional(),
    }),
  ),
  async (c) => {
    const { projectId } = c.req.param();
    const { prompt, deviceType, modelId } = c.req.valid('json');
    try {
      const svc = await StitchService.getInstance(c.env);
      const screen = await svc.generateScreen(projectId, prompt, deviceType, modelId);
      return c.json({ success: true, screen });
    } catch (e) {
      return err(c, e);
    }
  },
);

/** GET /projects/:projectId/screens/:screenId */
app.get('/projects/:projectId/screens/:screenId', async (c) => {
  const { projectId, screenId } = c.req.param();
  try {
    const svc = await StitchService.getInstance(c.env);
    const screen = await svc.getScreen(projectId, screenId);
    return c.json({ success: true, screen });
  } catch (e) {
    return err(c, e);
  }
});

/** PATCH /projects/:projectId/screens/:screenId */
app.patch(
  '/projects/:projectId/screens/:screenId',
  zValidator(
    'json',
    z.object({
      prompt: z.string().min(1),
      selectedScreenIds: z.array(z.string()).optional(),
      deviceType: z.enum(['DEVICE_TYPE_UNSPECIFIED', 'MOBILE', 'DESKTOP', 'TABLET', 'AGNOSTIC']).optional(),
      modelId: z.enum(['MODEL_ID_UNSPECIFIED', 'GEMINI_3_PRO', 'GEMINI_3_FLASH']).optional(),
    }),
  ),
  async (c) => {
    const { projectId, screenId } = c.req.param();
    const { prompt, selectedScreenIds, deviceType, modelId } = c.req.valid('json');
    try {
      const svc = await StitchService.getInstance(c.env);
      const result = await svc.editScreen(
        projectId,
        selectedScreenIds ?? [screenId],
        prompt,
        deviceType,
        modelId,
      );
      return c.json({ success: true, result });
    } catch (e) {
      return err(c, e);
    }
  },
);

/** POST /projects/:projectId/screens/:screenId/variants */
app.post(
  '/projects/:projectId/screens/:screenId/variants',
  zValidator(
    'json',
    z.object({
      prompt: z.string().min(1),
      variantOptions: z.record(z.string(), z.unknown()).optional(),
      deviceType: z.enum(['DEVICE_TYPE_UNSPECIFIED', 'MOBILE', 'DESKTOP', 'TABLET', 'AGNOSTIC']).optional(),
      modelId: z.enum(['MODEL_ID_UNSPECIFIED', 'GEMINI_3_PRO', 'GEMINI_3_FLASH']).optional(),
    }),
  ),
  async (c) => {
    const { projectId, screenId } = c.req.param();
    const { prompt, variantOptions, deviceType, modelId } = c.req.valid('json');
    try {
      const svc = await StitchService.getInstance(c.env);
      const variants = await svc.generateVariants(
        projectId,
        [screenId],
        prompt,
        (variantOptions ?? {}) as Record<string, any>,
        deviceType,
        modelId,
      );
      return c.json({ success: true, variants });
    } catch (e) {
      return err(c, e);
    }
  },
);

// ─── Tools ────────────────────────────────────────────────────────────────────

/** GET /tools */
app.get('/tools', async (c) => {
  try {
    const svc = await StitchService.getInstance(c.env);
    const tools = await svc.listTools();
    return c.json({ success: true, tools });
  } catch (e) {
    return err(c, e);
  }
});

// ─── Jules + Stitch Integration ───────────────────────────────────────────────

/**
 * POST / — Fetches the Stitch project context, then launches a Jules
 * session to generate UI changes based on the screen designs.
 */
app.post(
  '/',
  zValidator(
    'json',
    z.object({
      prompt: z.string().default('Enhance this UI based on the Stitch components provided.'),
      projectId: z.string(),
      screenIds: z.array(z.string()).optional(),
      repoOwner: z.string().optional(),
      repoName: z.string().optional(),
    }),
  ),
  async (c) => {
    const { prompt, projectId, screenIds, repoOwner, repoName } = c.req.valid('json');

    try {
      // Build Stitch context by listing the relevant screens
      const svc = await StitchService.getInstance(c.env);
      const screens = screenIds?.length
        ? await Promise.all(screenIds.map((id) => svc.getScreen(projectId, id)))
        : await svc.listScreens(projectId);

      const stitchContext = `\n\n## Stitch Design Context\n\nProject: ${projectId}\nScreens:\n${JSON.stringify(screens, null, 2)}`;
      const enrichedPrompt = `${prompt}${stitchContext}`;

      const builder = new JulesSessionBuilder(c.env)
        .withPrompt(enrichedPrompt)
        .withProjectId(projectId)
        .withoutApproval();

      if (repoOwner && repoName) {
        builder.withRepo(repoOwner, repoName);
      }

      const session = await builder.start();
      return c.json({ success: true, sessionId: session.id });
    } catch (e) {
      return err(c, e);
    }
  },
);

export default app;
