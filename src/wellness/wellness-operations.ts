import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import docClient from "../db/dynamo";
import { 
  PracticeInstance, 
  WeeklyWellnessScore, 
  UserWellnessSettings,
  WellnessPractice,
  CreatePracticeInstanceInput,
  UpdatePracticeInstanceInput,
  WellnessInteractionTracker
} from '../types';

const TABLE_NAME = process.env.TABLE_NAME || "TaskVision";

// Scoring weights configuration
const SCORE_WEIGHTS: Record<WellnessPractice, { frequency: 'daily' | 'weekly'; maxEvents: number }> = {
  'Gratitude': { frequency: 'daily', maxEvents: 7 },
  'Meditation': { frequency: 'daily', maxEvents: 7 },
  'Kindness': { frequency: 'weekly', maxEvents: 2 },
  'Social Outreach': { frequency: 'weekly', maxEvents: 2 },
  'Novelty Challenge': { frequency: 'weekly', maxEvents: 2 },
  'Savoring Reflection': { frequency: 'daily', maxEvents: 7 },
  'Exercise': { frequency: 'daily', maxEvents: 7 },
};

/**
 * Get the Monday of the week for a given date
 * Supports timezone-aware calculations
 */
export function getWeekStart(date: Date, timezone?: string): string {
  // Create a new date to avoid mutating the original
  const d = new Date(date);
  
  // Get the day of week (0 = Sunday, 1 = Monday, etc.)
  const day = d.getUTCDay();
  
  // Calculate days to subtract to get to Monday
  const daysToMonday = day === 0 ? 6 : day - 1;
  
  // Subtract days to get to Monday using UTC methods to avoid timezone issues
  const mondayDate = new Date(d);
  mondayDate.setUTCDate(d.getUTCDate() - daysToMonday);
  
  // Return in YYYY-MM-DD format using UTC methods
  const year = mondayDate.getUTCFullYear();
  const month = String(mondayDate.getUTCMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(mondayDate.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${dayOfMonth}`;
}

/**
 * Calculate weekly wellness score from practice instances
 */
function calculateWeeklyScore(practices: PracticeInstance[], weekStart: string): number {
  // Count completed practices by type
  const completedCounts: Record<WellnessPractice, number> = {
    'Gratitude': 0,
    'Meditation': 0,
    'Kindness': 0,
    'Social Outreach': 0,
    'Novelty Challenge': 0,
    'Savoring Reflection': 0,
    'Exercise': 0,
  };

  practices.forEach(practice => {
    if (practice.completed) {
      completedCounts[practice.practice]++;
    }
  });

  // Calculate normalized scores (each practice worth ~14.3 points)
  const pointsPerPractice = 100 / 7;
  let totalScore = 0;

  Object.keys(SCORE_WEIGHTS).forEach(practiceKey => {
    const practice = practiceKey as WellnessPractice;
    const config = SCORE_WEIGHTS[practice];
    const completed = completedCounts[practice];
    const maxEvents = config.maxEvents;
    
    // Calculate percentage completion for this practice
    const completionRate = Math.min(completed / maxEvents, 1);
    const practiceScore = completionRate * pointsPerPractice;
    
    totalScore += practiceScore;
  });

  return Math.round(totalScore * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate practice breakdown for coaching
 */
function calculatePracticeBreakdown(practices: PracticeInstance[]): Record<WellnessPractice, { completed: number; target: number }> {
  const breakdown: Record<WellnessPractice, { completed: number; target: number }> = {
    'Gratitude': { completed: 0, target: 7 },
    'Meditation': { completed: 0, target: 7 },
    'Kindness': { completed: 0, target: 2 },
    'Social Outreach': { completed: 0, target: 2 },
    'Novelty Challenge': { completed: 0, target: 2 },
    'Savoring Reflection': { completed: 0, target: 7 },
    'Exercise': { completed: 0, target: 7 },
  };

  practices.forEach(practice => {
    if (practice.completed) {
      breakdown[practice.practice].completed++;
    }
  });

  return breakdown;
}

/**
 * Calculate simple breakdown for WeeklyWellnessScore
 */
function calculateSimpleBreakdown(practices: PracticeInstance[]): Record<WellnessPractice, number> {
  const breakdown: Record<WellnessPractice, number> = {
    'Gratitude': 0,
    'Meditation': 0,
    'Kindness': 0,
    'Social Outreach': 0,
    'Novelty Challenge': 0,
    'Savoring Reflection': 0,
    'Exercise': 0,
  };

  practices.forEach(practice => {
    if (practice.completed) {
      breakdown[practice.practice]++;
    }
  });

  return breakdown;
}

/**
 * Create a new practice instance
 */
export const createPracticeInstance = async (
  userId: string, 
  practiceData: CreatePracticeInstanceInput
): Promise<PracticeInstance> => {
  const practiceId = ulid();
  const now = new Date().toISOString();
  
  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(practiceData.date)) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }

  const practice: PracticeInstance = {
    PK: `USER#${userId}`,
    SK: `PRACTICE#${practiceData.date}#${practiceData.practice}`,
    EntityType: 'PracticeInstance',
    id: practiceId,
    userId,
    date: practiceData.date,
    practice: practiceData.practice,
    completed: false,
    linkedTaskId: practiceData.linkedTaskId,
    createdAt: now,
  };

  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: practice,
    ConditionExpression: 'attribute_not_exists(PK)', // Prevent duplicates
  });

  try {
    await docClient.send(command);
    
    // Calculate and update weekly score (convert practice date to week start)
    const weekStart = getWeekStart(new Date(practiceData.date + 'T12:00:00'), "America/New_York");
    await updateWeeklyScore(userId, weekStart);
    
    return practice;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new Error('Practice instance already exists for this date and practice');
    }
    console.error('Error creating practice instance:', error);
    throw new Error('Could not create practice instance');
  }
};

/**
 * Get practice instances for a user within a date range
 */
export const getPracticeInstances = async (
  userId: string,
  startDate: string,
  endDate: string
): Promise<PracticeInstance[]> => {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :startSK AND :endSK',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':startSK': `PRACTICE#${startDate}`,
      ':endSK': `PRACTICE#${endDate}#~`, // ~ sorts after all practice names
    },
  });

  try {
    const result = await docClient.send(command);
    return (result.Items || []) as PracticeInstance[];
  } catch (error) {
    console.error('Error fetching practice instances:', error);
    throw new Error('Could not fetch practice instances');
  }
};

/**
 * Update a practice instance
 */
export const updatePracticeInstance = async (
  userId: string,
  date: string,
  practice: WellnessPractice,
  updateData: UpdatePracticeInstanceInput
): Promise<PracticeInstance> => {
  const sk = `PRACTICE#${date}#${practice}`;
  const now = new Date().toISOString();
  
  // Build update expression dynamically
  const updateExpressions: string[] = ['updatedAt = :updatedAt'];
  const expressionAttributeValues: Record<string, any> = {
    ':updatedAt': now,
  };

  if (updateData.completed !== undefined) {
    updateExpressions.push('completed = :completed');
    expressionAttributeValues[':completed'] = updateData.completed;
    
    if (updateData.completed) {
      updateExpressions.push('completedAt = :completedAt');
      expressionAttributeValues[':completedAt'] = now;
    } else {
      updateExpressions.push('completedAt = :null');
      expressionAttributeValues[':null'] = null;
    }
  }

  if (updateData.linkedTaskId !== undefined) {
    if (updateData.linkedTaskId) {
      updateExpressions.push('linkedTaskId = :linkedTaskId');
      expressionAttributeValues[':linkedTaskId'] = updateData.linkedTaskId;
    } else {
      updateExpressions.push('linkedTaskId = :null');
      expressionAttributeValues[':null'] = null;
    }
  }

  if (updateData.journal !== undefined) {
    if (updateData.journal && updateData.journal.trim()) {
      updateExpressions.push('journal = :journal');
      expressionAttributeValues[':journal'] = updateData.journal.trim();
    } else {
      updateExpressions.push('journal = :null');
      expressionAttributeValues[':null'] = null;
    }
  }

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: sk,
    },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  });

  try {
    const result = await docClient.send(command);
    
    // Update weekly score if completion status changed (convert practice date to week start)
    if (updateData.completed !== undefined) {
      const weekStart = getWeekStart(new Date(date + 'T12:00:00'), "America/New_York");
      await updateWeeklyScore(userId, weekStart);
    }
    
    return result.Attributes as PracticeInstance;
  } catch (error) {
    console.error('Error updating practice instance:', error);
    throw new Error('Could not update practice instance');
  }
};

/**
 * Delete a practice instance
 */
export const deletePracticeInstance = async (
  userId: string,
  date: string,
  practice: WellnessPractice
): Promise<{ success: boolean; message: string }> => {
  const command = new DeleteCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: `PRACTICE#${date}#${practice}`,
    },
  });

  try {
    await docClient.send(command);
    
    // Update weekly score after deletion (convert practice date to week start)
    const weekStart = getWeekStart(new Date(date + 'T12:00:00'), "America/New_York");
    await updateWeeklyScore(userId, weekStart);
    
    return { success: true, message: 'Practice instance deleted successfully' };
  } catch (error) {
    console.error('Error deleting practice instance:', error);
    throw new Error('Could not delete practice instance');
  }
};

/**
 * Calculate and update weekly wellness score
 */
export const updateWeeklyScore = async (userId: string, weekStart: string): Promise<void> => {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().split('T')[0];
  
  // Get all practice instances for the week
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :startSK AND :endSK',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':startSK': `PRACTICE#${weekStart}`,
      ':endSK': `PRACTICE#${weekEndStr}#ZZZZ`
    }
  };

  const result = await docClient.send(new QueryCommand(params));
  const practices = result.Items as PracticeInstance[];
  
  // Calculate score
  const score = calculateWeeklyScore(practices, weekStart);
  
  // Store the score
  const scoreItem: WeeklyWellnessScore = {
    PK: `USER#${userId}`,
    SK: `SCORE#${weekStart}`,
    EntityType: 'WeeklyWellnessScore',
    userId,
    weekStart,
    score,
    breakdown: calculateSimpleBreakdown(practices),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: scoreItem
  }));
};

/**
 * Get weekly wellness scores for a user
 */
export const getWeeklyScores = async (
  userId: string,
  weeksBack: number = 12,
  timezone: string = "America/New_York"
): Promise<WeeklyWellnessScore[]> => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (weeksBack * 7));
  const startWeek = getWeekStart(startDate, timezone);

  const command = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :startSK AND :endSK',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':startSK': `SCORE#${startWeek}`,
      ':endSK': `SCORE#9999-12-31`, // End of time for SCORE entries
    },
  });

  try {
    const result = await docClient.send(command);
    return (result.Items || []) as WeeklyWellnessScore[];
  } catch (error) {
    console.error('Error fetching weekly scores:', error);
    throw new Error('Could not fetch weekly scores');
  }
};

/**
 * Get user wellness settings
 */
export const getUserWellnessSettings = async (userId: string): Promise<UserWellnessSettings> => {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: 'SETTINGS#WELLNESS',
    },
  });

  try {
    const result = await docClient.send(command);
    
    if (!result.Item) {
      // Return default settings
      const defaultSettings: UserWellnessSettings = {
        userId,
        enabledPractices: ['Gratitude', 'Meditation', 'Kindness', 'Social Outreach', 'Novelty Challenge', 'Savoring Reflection', 'Exercise'],
        weeklyGoals: {
          'Gratitude': 7,
          'Meditation': 7,
          'Kindness': 2,
          'Social Outreach': 2,
          'Novelty Challenge': 2,
          'Savoring Reflection': 7,
          'Exercise': 7,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // Save default settings
      await updateUserWellnessSettings(userId, defaultSettings);
      return defaultSettings;
    }
    
    return result.Item as UserWellnessSettings;
  } catch (error) {
    console.error('Error fetching user wellness settings:', error);
    throw new Error('Could not fetch user wellness settings');
  }
};

/**
 * Update user wellness settings
 */
export const updateUserWellnessSettings = async (
  userId: string,
  updates: Partial<UserWellnessSettings>
): Promise<UserWellnessSettings> => {
  const now = new Date().toISOString();
  
  // Build update expression dynamically
  const updateExpressions: string[] = ['updatedAt = :updatedAt'];
  const expressionAttributeValues: Record<string, any> = {
    ':updatedAt': now,
  };

  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'userId' && key !== 'createdAt' && key !== 'updatedAt' && value !== undefined) {
      updateExpressions.push(`${key} = :${key}`);
      expressionAttributeValues[`:${key}`] = value;
    }
  });

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: 'SETTINGS#WELLNESS',
    },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  });

  try {
    const result = await docClient.send(command);
    return result.Attributes as UserWellnessSettings;
  } catch (error) {
    console.error('Error updating user wellness settings:', error);
    throw new Error('Could not update user wellness settings');
  }
};

// Wellness Interaction Tracking Functions
export const hasCheckedWellnessToday = async (userId: string): Promise<boolean> => {
  const today = new Date().toISOString().split('T')[0];
  
  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: `WELLNESS_CHECK#${today}`
    }
  };

  const result = await docClient.send(new GetCommand(params));
  return !!result.Item;
};

export const markWellnessCheckedToday = async (userId: string): Promise<void> => {
  const today = new Date().toISOString().split('T')[0];
  const timestamp = new Date().toISOString();
  
  const item: WellnessInteractionTracker & { PK: string; SK: string; EntityType: string } = {
    PK: `USER#${userId}`,
    SK: `WELLNESS_CHECK#${today}`,
    EntityType: 'WellnessInteractionTracker',
    userId,
    date: today,
    hasCheckedToday: true,
    lastCheckTimestamp: timestamp
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item
  }));
};

export const getWellnessStatusForCoaching = async (
  userId: string, 
  timezone: string = "America/New_York"
): Promise<{
  score: number;
  practices: Record<WellnessPractice, { completed: number; target: number }>;
  lowPractice?: WellnessPractice;
}> => {
  const weekStart = getWeekStart(new Date(), timezone);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().split('T')[0];
  
  // Get all practice instances for the week
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :startSK AND :endSK',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':startSK': `PRACTICE#${weekStart}`,
      ':endSK': `PRACTICE#${weekEndStr}#ZZZZ`
    }
  };

  const result = await docClient.send(new QueryCommand(params));
  const practices = result.Items as PracticeInstance[];
  
  // Calculate score and practice breakdown
  const score = calculateWeeklyScore(practices, weekStart);
  const practiceBreakdown = calculatePracticeBreakdown(practices);
  
  // Find the practice with lowest completion rate
  let lowPractice: WellnessPractice | undefined;
  let lowestRate = 1;
  
  Object.entries(practiceBreakdown).forEach(([practice, data]) => {
    const rate = data.completed / data.target;
    if (rate < lowestRate) {
      lowestRate = rate;
      lowPractice = practice as WellnessPractice;
    }
  });
  
  return {
    score,
    practices: practiceBreakdown,
    lowPractice
  };
};

export const getRecentWellnessTasks = async (userId: string, practice: WellnessPractice, limit: number = 3): Promise<string[]> => {
  // Get recent completed practice instances for this practice type
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    FilterExpression: 'practice = :practice AND completed = :completed',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':practice': practice,
      ':completed': true
    },
    ScanIndexForward: false, // Get most recent first
    Limit: limit * 2 // Get more to account for filtering
  };

  const result = await docClient.send(new QueryCommand(params));
  const practices = result.Items as PracticeInstance[];
  
  // For now, return sample task descriptions since we don't have actual task descriptions linked
  // This will be enhanced when we integrate with actual task data
  const sampleTasks: Record<WellnessPractice, string[]> = {
    'Gratitude': ['Write 3 things I\'m grateful for', 'Thank someone who helped me', 'Gratitude journal entry'],
    'Meditation': ['10-minute mindfulness session', 'Breathing exercise', 'Walking meditation'],
    'Kindness': ['Help a colleague with their work', 'Volunteer at local charity', 'Random act of kindness'],
    'Social Outreach': ['Call a friend I haven\'t spoken to', 'Join a community event', 'Reach out to family'],
    'Novelty Challenge': ['Try a new recipe', 'Learn something new online', 'Explore a new place'],
    'Savoring Reflection': ['Reflect on today\'s positive moments', 'Write about a happy memory', 'Practice mindful appreciation'],
    'Exercise': ['30-minute walk or run', 'Gym workout session', 'Yoga or stretching', 'Dance or movement activity']
  };
  
  return sampleTasks[practice] || [];
};