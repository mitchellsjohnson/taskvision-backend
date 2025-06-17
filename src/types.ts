export type TaskStatus = 'Open' | 'InProgress' | 'Completed' | 'Waiting' | 'Canceled';

export interface Task {
  TaskId: string;
  UserId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  creationDate: string;
  modifiedDate: string;
  completedDate: string | null;
  dueDate: string | null;
  priority: number;
  isMIT: boolean;
  tags: string[];
} 