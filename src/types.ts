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

// Wellness Module Types
export type WellnessPractice = 
  | 'Gratitude'
  | 'Meditation' 
  | 'Kindness'
  | 'Social Outreach'
  | 'Novelty Challenge'
  | 'Savoring Reflection';

export interface PracticeInstance {
  // DynamoDB Keys
  PK: string; // USER#{userId}
  SK: string; // PRACTICE#{date}#{practice}
  EntityType: 'PracticeInstance';
  
  // Core Fields
  id: string;
  userId: string;
  date: string; // ISO date (YYYY-MM-DD)
  practice: WellnessPractice;
  completed: boolean;
  linkedTaskId?: string;
  
  // Timestamps
  createdAt: string;
  completedAt?: string;
}

export interface WeeklyWellnessScore {
  // DynamoDB Keys
  PK: string; // USER#{userId}
  SK: string; // SCORE#{weekStart}
  EntityType: 'WeeklyWellnessScore';
  
  // Core Fields
  userId: string;
  weekStart: string; // ISO date (Monday of the week)
  score: number; // 0-100
  breakdown: Record<WellnessPractice, number>;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface UserWellnessSettings {
  userId: string;
  enabledPractices: WellnessPractice[];
  weeklyGoals: Record<WellnessPractice, number>;
  createdAt: string;
  updatedAt: string;
}

export interface WellnessInteractionTracker {
  userId: string;
  date: string; // ISO YYYY-MM-DD
  hasCheckedToday: boolean;
  lastCheckTimestamp: string;
}

export interface WellnessCoachingContext {
  practice?: WellnessPractice;
  suggestion?: string;
  timestamp: string;
}

// Wellness API Input Types
export interface CreatePracticeInstanceInput {
  date: string;
  practice: WellnessPractice;
  linkedTaskId?: string;
}

export interface UpdatePracticeInstanceInput {
  completed?: boolean;
  linkedTaskId?: string;
} 