/**
 * @file backend/src/routes/api/jules/categories.ts
 * @description Aggregates task data to produce category summaries.
 *
 * Tasks are classified into predefined categories using keyword matching
 * against task titles and descriptions.
 *
 * Endpoint:
 *   GET /api/jules/categories — Returns category summaries with task counts
 *
 * @module Routes/Jules/Categories
 */

import { Hono } from 'hono';
import { getDb } from '@db';
import { tasks } from '@/db/schemas/projects/backlog/tasks';
import { eq } from 'drizzle-orm';

const app = new Hono<{ Bindings: Env }>();

// Predefined categories with their keywords for classification
const CATEGORY_DEFINITIONS = [
  { id: 'frontend', name: 'Frontend Development', description: 'UI components, styling, and client-side logic', color: '#3b82f6', icon: 'Layout', keywords: ['ui', 'frontend', 'component', 'css', 'style', 'react', 'page', 'view', 'layout', 'responsive', 'tailwind'] },
  { id: 'backend', name: 'Backend Systems', description: 'APIs, services, and server-side logic', color: '#10b981', icon: 'Server', keywords: ['api', 'backend', 'server', 'route', 'endpoint', 'service', 'middleware', 'auth', 'database', 'db', 'migration', 'schema'] },
  { id: 'devops', name: 'DevOps & CI/CD', description: 'Infrastructure, deployment, and automation', color: '#f59e0b', icon: 'GitBranch', keywords: ['deploy', 'ci', 'cd', 'pipeline', 'docker', 'infrastructure', 'terraform', 'monitoring', 'logging', 'devops', 'build', 'test'] },
  { id: 'design', name: 'Design & UX', description: 'User experience, design systems, and accessibility', color: '#8b5cf6', icon: 'Palette', keywords: ['design', 'ux', 'accessibility', 'a11y', 'figma', 'stitch', 'mockup', 'prototype', 'user experience'] },
  { id: 'security', name: 'Security', description: 'Authentication, authorization, and vulnerability fixes', color: '#ef4444', icon: 'Shield', keywords: ['security', 'auth', 'oauth', 'jwt', 'vulnerability', 'cve', 'encryption', 'permission', 'rbac'] },
  { id: 'other', name: 'Other', description: 'Uncategorized tasks', color: '#6b7280', icon: 'MoreHorizontal', keywords: [] },
];

// GET /api/jules/categories
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const allTasks = await db.select().from(tasks).where(eq(tasks.isDeleted, 0));

  // Classify each task
  const categoryCounts: Record<string, number> = {};
  CATEGORY_DEFINITIONS.forEach(cat => { categoryCounts[cat.id] = 0; });

  for (const task of allTasks) {
    const text = `${task.title} ${task.description || ''}`.toLowerCase();
    let matched = false;
    for (const cat of CATEGORY_DEFINITIONS) {
      if (cat.id === 'other') continue;
      if (cat.keywords.some(kw => text.includes(kw))) {
        categoryCounts[cat.id]++;
        matched = true;
        break;
      }
    }
    if (!matched) categoryCounts['other']++;
  }

  const categories = CATEGORY_DEFINITIONS.map(cat => ({
    ...cat,
    taskCount: categoryCounts[cat.id],
    keywords: undefined, // strip from response
  }));

  return c.json({ success: true, categories });
});

export default app;
