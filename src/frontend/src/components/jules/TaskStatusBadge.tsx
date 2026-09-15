import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { JulesSession } from '@/hooks/jules/useJulesSessions';

interface TaskStatusBadgeProps {
  status: JulesSession['status'];
  className?: string;
}

export function TaskStatusBadge({ status, className }: TaskStatusBadgeProps) {
  let variant: 'default' | 'success' | 'destructive' | 'secondary' = 'default';
  let customClass = '';
  let label = status;

  switch (status) {
    case 'active':
      variant = 'default';
      customClass = 'bg-blue-500 hover:bg-blue-600 text-white';
      label = 'Active';
      break;
    case 'completed':
      variant = 'success';
      label = 'Completed';
      break;
    case 'failed':
      variant = 'destructive';
      label = 'Failed';
      break;
    case 'waiting_for_user':
      variant = 'secondary';
      customClass = 'bg-amber-500 hover:bg-amber-600 text-white';
      label = 'Needs Attention';
      break;
  }

  return (
    <Badge variant={variant} className={cn(customClass, className)}>
      {label}
    </Badge>
  );
}
