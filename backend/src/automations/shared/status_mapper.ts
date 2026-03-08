import { TaskStatus, KanbanColumn } from '@/types/project-management/enums';

export class StatusMapper {
  static mapStatusToColumn(status: TaskStatus): KanbanColumn {
    switch (status) {
      case TaskStatus.BACKLOG:
        return KanbanColumn.BACKLOG;
      case TaskStatus.TODO:
        return KanbanColumn.PLANNED;
      case TaskStatus.IN_PROGRESS:
        return KanbanColumn.IN_PROGRESS;
      case TaskStatus.REVIEW:
        return KanbanColumn.IN_PROGRESS;
      case TaskStatus.DONE:
        return KanbanColumn.DONE;
      default:
        return KanbanColumn.BACKLOG;
    }
  }

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

  static getSyncColumn(currentColumn: KanbanColumn, newStatus: TaskStatus): KanbanColumn | null {
    const expectedColumn = this.mapStatusToColumn(newStatus);
    if (newStatus === TaskStatus.REVIEW && currentColumn === KanbanColumn.IN_PROGRESS) {
      return null;
    }

    return currentColumn !== expectedColumn ? expectedColumn : null;
  }

  static getSyncStatus(currentStatus: TaskStatus, newColumn: KanbanColumn): TaskStatus | null {
    if (newColumn === KanbanColumn.IN_PROGRESS && currentStatus === TaskStatus.REVIEW) {
      return null;
    }

    const expectedStatus = this.mapColumnToStatus(newColumn);
    return currentStatus !== expectedStatus ? expectedStatus : null;
  }
}
