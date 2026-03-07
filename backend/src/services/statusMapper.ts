
/**
 * @file src/services/statusMapper.ts
 * @description Service to handle bidirectional mapping between TaskStatus and KanbanColumn.
 * @owner AI-Builder
 */

import { TaskStatus, KanbanColumn } from '@/types/project-management/enums';

export class StatusMapper {

    /**
     * Maps a TaskStatus to the appropriate KanbanColumn.
     * Used when a task status is updated directly (e.g. via API or GitHub issue state change).
     */
    static mapStatusToColumn(status: TaskStatus): KanbanColumn {
        switch (status) {
            case TaskStatus.BACKLOG:
                return KanbanColumn.BACKLOG;
            case TaskStatus.TODO:
                return KanbanColumn.PLANNED;
            case TaskStatus.IN_PROGRESS:
                return KanbanColumn.IN_PROGRESS;
            case TaskStatus.REVIEW:
                return KanbanColumn.IN_PROGRESS; // Review is still active
            case TaskStatus.DONE:
                return KanbanColumn.DONE;
            default:
                return KanbanColumn.BACKLOG;
        }
    }

    /**
     * Maps a KanbanColumn to the appropriate TaskStatus.
     * Used when a task is moved on the Kanban board.
     * Note: This is an approximation/default-setting. 
     */
    static mapColumnToStatus(column: KanbanColumn): TaskStatus {
        switch (column) {
            case KanbanColumn.BACKLOG:
                return TaskStatus.BACKLOG;
            case KanbanColumn.PLANNED:
                return TaskStatus.TODO;
            case KanbanColumn.IN_PROGRESS:
                return TaskStatus.IN_PROGRESS;
            case KanbanColumn.DONE:
                return TaskStatus.DONE;
            default:
                return TaskStatus.BACKLOG;
        }
    }

    /**
     * Determines if a status update necessitates a column update.
     * Returns the new column if mismatched, or null if consistent.
     */
    static getSyncColumn(currentColumn: KanbanColumn, newStatus: TaskStatus): KanbanColumn | null {
        const expectedColumn = this.mapStatusToColumn(newStatus);

        // Special Case: 'review' status is valid in 'in_progress' column
        if (newStatus === TaskStatus.REVIEW && currentColumn === KanbanColumn.IN_PROGRESS) {
            return null;
        }

        return currentColumn !== expectedColumn ? expectedColumn : null;
    }

    /**
     * Determines if a column update necessitates a status update.
     * Returns the new status if mismatched, or null if consistent.
     */
    static getSyncStatus(currentStatus: TaskStatus, newColumn: KanbanColumn): TaskStatus | null {
        // If moving TO a column, simply adopt the default status for that column
        // EXCEPT if we are moving to In Progress and status is ALREADY Review, keep it Review.
        if (newColumn === KanbanColumn.IN_PROGRESS && currentStatus === TaskStatus.REVIEW) {
            return null;
        }

        const defaultStatus = this.mapColumnToStatus(newColumn);
        return currentStatus !== defaultStatus ? defaultStatus : null; // Strictly adopt default otherwise
    }
}
