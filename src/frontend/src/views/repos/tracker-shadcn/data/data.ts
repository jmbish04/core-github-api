import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Circle,
  Timer,
  XCircle,
  AlertCircle,
  Bug,
  BookOpen,
  Layers,
  ListTodo,
} from 'lucide-react'

export const labels = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'improvement', label: 'Improvement' },
]

export const statuses = [
  { value: 'backlog', label: 'Backlog', icon: Circle },
  { value: 'todo', label: 'Todo', icon: Circle },
  { value: 'in_progress', label: 'In Progress', icon: Timer },
  { value: 'done', label: 'Done', icon: CheckCircle2 },
  { value: 'canceled', label: 'Canceled', icon: XCircle },
]

export const priorities = [
  { value: 'low', label: 'Low', icon: ArrowDown },
  { value: 'medium', label: 'Medium', icon: ArrowRight },
  { value: 'high', label: 'High', icon: ArrowUp },
  { value: 'urgent', label: 'Urgent', icon: AlertCircle },
]

export const itemTypes = [
  { value: 'task', label: 'Task', icon: ListTodo },
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'story', label: 'Story', icon: BookOpen },
  { value: 'epic', label: 'Epic', icon: Layers },
]
