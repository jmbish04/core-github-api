/**
 * @file schemas/projects/index.ts — Barrel for all project management schemas.
 *
 * Exports the canonical project tables:
 *   - `projects`       — root project entity (linked to a GitHub repo)
 *   - `projectPhases`  — phase/epic grouping within a project
 *   - `projectPlans`   — adjacency-list Epic → Story → Task hierarchy
 *   - `tasks`          — GitHub-issue-linked Kanban tasks
 *   - `taskComments`   — comments on Kanban tasks
 *   - `taskEvents`     — audit log for Kanban task operations
 *   - `todos`          — corkboard post-it notes
 *   - `corkboardLabels`
 *   - `pmProjects`, `pmEpics`, `pmStories`, `pmTasks` (hierarchy, pending migration)
 */
export * from './roadmap';   // projects, projectPhases
export * from './plans';     // projectPlans
export * from './planning_requests';
export * from './tasks';     // tasks, taskComments, taskEvents
export * from './todos';     // todos, corkboardLabels, todoTags, todoTagMap, todoLinks, todoAiInsights
export * from './hierarchy'; // pmProjects, pmEpics, pmStories, pmTasks (pending consolidation)
