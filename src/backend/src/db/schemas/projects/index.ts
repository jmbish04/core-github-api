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
export * from './planning_requests';
export * from './reverse_engineering';
export * from './todos';     // todos, corkboardLabels, todoTags, todoTagMap, todoLinks, todoAiInsights
export * from './backlog';   // epics, stories, tasks, taskComments, taskEvents
