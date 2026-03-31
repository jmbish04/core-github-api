
/**
 * @file src/types/enums.ts
 * @description Enums for Task Status and Kanban Columns to ensure strict typing and consistency.
 * @owner AI-Builder
 */

export enum TaskStatus {
    BACKLOG = 'backlog',
    TODO = 'todo',
    IN_PROGRESS = 'in_progress',
    REVIEW = 'review',
    DONE = 'done'
}

export enum KanbanColumn {
    BACKLOG = 'backlog',
    PLANNED = 'planned',
    IN_PROGRESS = 'in_progress',
    DONE = 'done'
}
