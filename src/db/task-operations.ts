import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  UpdateCommandOutput,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import docClient from "./dynamo";
import { Task } from '../types';
import { validateTaskData } from '../utils/validation';
import { logTaskAuditEvent } from './audit-operations';

const TABLE_NAME = process.env.TABLE_NAME || "TaskVision";

// A map to store promises for ongoing re-prioritization to avoid race conditions
const userReprioritizationLocks = new Map<string, Promise<any>>();

type TaskStatus = "Open" | "Completed" | "Canceled" | "Waiting";

interface TaskInput {
  title: string;
  description?: string;
  dueDate?: string;
  status: TaskStatus;
  isMIT?: boolean;
  priority?: number;
  tags?: string[];
  insertPosition?: number; // Optional: specify exact position in combined MIT+LIT list
  shortCode?: string; // Optional: SMS short code for task
}

export const createTask = async (userId: string, taskData: TaskInput) => {
  // Validate task data
  const validation = validateTaskData(taskData);
  if (!validation.isValid) {
    const error = new Error('Validation failed');
    (error as any).validationErrors = validation.errors;
    throw error;
  }

  const taskId = ulid();
  const now = new Date().toISOString();

  const task: any = {
    PK: `USER#${userId}`,
    SK: `TASK#${taskId}`,
    GSI1PK: `USER#${userId}`,
    GSI1SK: `TASK#${taskId}`,
    EntityType: "Task",
    TaskId: taskId,
    UserId: userId,
    isMIT: taskData.isMIT || false,
    priority: taskData.priority || 1,
    title: taskData.title,
    description: taskData.description || '',
    dueDate: taskData.dueDate || null,
    status: taskData.status,
    tags: taskData.tags || [],
    creationDate: now,
    modifiedDate: now,
    completedDate: taskData.status === "Completed" ? now : null,
  };

  // Add shortCode if provided (for SMS-created tasks)
  if (taskData.shortCode) {
    task.shortCode = taskData.shortCode;
  }

  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: task,
  });

  try {
    await docClient.send(command);

    // Log audit event for task creation
    await logTaskAuditEvent(userId, {
      taskId,
      taskTitle: task.title,
      action: 'created',
      newValues: {
        status: task.status,
        isMIT: task.isMIT,
        priority: task.priority,
        dueDate: task.dueDate
      },
      timestamp: now
    });

    // Trigger reprioritization to handle the new task's position
    // If insertPosition is provided, use that; otherwise use priority-based calculation
    const repositionIndex = taskData.insertPosition !== undefined
      ? taskData.insertPosition
      : (taskData.priority || 1) - 1;

    await reprioritizeTasks(userId, taskId, repositionIndex);

    // Fetch the task again to get the updated priority after reprioritization
    const updatedTask = await getTask(userId, taskId);
    return updatedTask || task; // Fallback to original task if fetch fails
  } catch (error) {
    console.error("Error creating task:", error);
    throw new Error("Could not create task.");
  }
};

export const getTasksForUser = async (
  userId: string,
  filters: {
    status?: string[];
    tags?: string[];
    search?: string;
    dateFilter?: string;
    startDate?: string;
    endDate?: string;
    noDueDate?: boolean;
  } = {}
) => {
  const params: any = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`,
      ":sk": "TASK#",
    },
    ExpressionAttributeNames: {
      "#st": "status",
      "#title": "title",
      "#description": "description",
    },
  };

  const filterExpressions: string[] = [];

  // This is the corrected line
  let projectionExpression = "TaskId, #title, #description, dueDate, #st, isMIT, priority, creationDate, modifiedDate, completedDate, tags, shortCode";

  if (filters.status && filters.status.length > 0) {
    const statusPlaceholders = filters.status.map((s, i) => `:status${i}`);
    filterExpressions.push(`#st IN (${statusPlaceholders.join(", ")})`);
    filters.status.forEach((s, i) => {
      params.ExpressionAttributeValues[`:status${i}`] = s;
    });
  }

  if (filters.tags && filters.tags.length > 0) {
    const tagExpressions = filters.tags.map((tag, i) => {
      const placeholder = `:tag${i}`;
      params.ExpressionAttributeValues[placeholder] = tag;
      return `contains(#tags, ${placeholder})`;
    });
    filterExpressions.push(`(${tagExpressions.join(" OR ")})`);
    params.ExpressionAttributeNames["#tags"] = "tags";
  }

  if (filters.search) {
    const searchPlaceholder = ":search";
    params.ExpressionAttributeValues[searchPlaceholder] = filters.search;
    filterExpressions.push(
      `(contains(#title, ${searchPlaceholder}) OR contains(#description, ${searchPlaceholder}))`
    );
  }

  // Date filtering
  if (filters.dateFilter && filters.dateFilter !== 'all') {
    if (filters.dateFilter === 'pastDue') {
      // Past due: has due date AND due date is not empty AND due date < today
      if (filters.endDate) {
        params.ExpressionAttributeNames["#dueDate"] = "dueDate";
        filterExpressions.push(`(attribute_exists(#dueDate) AND #dueDate <> :emptyValue AND #dueDate < :endDate)`);
        params.ExpressionAttributeValues[":endDate"] = filters.endDate;
        params.ExpressionAttributeValues[":emptyValue"] = "";
      }
    } else if (filters.dateFilter === 'dueToday') {
      // Due today: due date = today
      if (filters.startDate) {
        params.ExpressionAttributeNames["#dueDate"] = "dueDate";
        filterExpressions.push(`(attribute_exists(#dueDate) AND #dueDate = :startDate)`);
        params.ExpressionAttributeValues[":startDate"] = filters.startDate;
      }
    } else if (filters.dateFilter === 'dueThisWeek' || filters.dateFilter === 'dueThisMonth') {
      // Due this week/month: due date >= startDate AND due date <= endDate
      if (filters.startDate && filters.endDate) {
        params.ExpressionAttributeNames["#dueDate"] = "dueDate";
        filterExpressions.push(`(attribute_exists(#dueDate) AND #dueDate >= :startDate AND #dueDate <= :endDate)`);
        params.ExpressionAttributeValues[":startDate"] = filters.startDate;
        params.ExpressionAttributeValues[":endDate"] = filters.endDate;
      }
    } else if (filters.dateFilter === 'noDueDate') {
      // No due date: either dueDate doesn't exist or is null/empty
      params.ExpressionAttributeNames["#dueDate"] = "dueDate";
      filterExpressions.push(`(attribute_not_exists(#dueDate) OR #dueDate = :nullValue OR #dueDate = :emptyValue)`);
      params.ExpressionAttributeValues[":nullValue"] = null;
      params.ExpressionAttributeValues[":emptyValue"] = "";
    }
  }

  params.ProjectionExpression = projectionExpression;

  if (filterExpressions.length > 0) {
    params.FilterExpression = filterExpressions.join(" AND ");
  }

  try {
    const result = await docClient.send(new QueryCommand(params));
    return result.Items;
  } catch (error) {
    console.error("Error fetching tasks for user:", error);
    throw new Error("Could not fetch tasks.");
  }
};

export const getTask = async (userId: string, taskId: string) => {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: `TASK#${taskId}`,
    },
    ConsistentRead: true, // Ensure we get the latest data after reprioritization
  };
  try {
    const result = await docClient.send(new GetCommand(params));
    return result.Item ? (result.Item as Task) : null;
  } catch (error) {
    console.error("Error fetching single task:", error);
    throw new Error("Could not fetch task.");
  }
}

export const reprioritizeTasks = async (userId: string, movedTaskId?: string, newPosition?: number) => {
  console.log('[reprioritizeTasks] Called with:', { userId, movedTaskId, newPosition });

  // Use a strongly consistent read to ensure we get the latest data
  const allTasksResult = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
    ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":sk": "TASK#" },
    ConsistentRead: true,
  }));

  let allTasks = allTasksResult.Items || [];
  console.log('[reprioritizeTasks] Found tasks:', allTasks.length);

  // Filter out completed and canceled tasks, as they don't have a priority
  let activeTasks = allTasks.filter(t => t.status !== 'Completed' && t.status !== 'Canceled');
  console.log('[reprioritizeTasks] Active tasks:', activeTasks.length);

  // Sort tasks by isMIT (MIT first) and then by priority to establish consistent order
  // This ensures that position calculations work correctly
  activeTasks.sort((a, b) => {
    if (a.isMIT && !b.isMIT) return -1;  // MIT before LIT
    if (!a.isMIT && b.isMIT) return 1;   // LIT after MIT
    return (a.priority || 0) - (b.priority || 0);  // Sort by priority within each group
  });

  const movedTask = movedTaskId ? activeTasks.find(t => t.TaskId === movedTaskId) : undefined;
  console.log('[reprioritizeTasks] Moved task found:', !!movedTask);

  if (movedTask && newPosition !== undefined) {
    console.log('[reprioritizeTasks] Moving task to position:', newPosition);
    // Remove the moved task from its current spot
    activeTasks = activeTasks.filter(t => t.TaskId !== movedTaskId);
    // Insert it at the new position
    activeTasks.splice(newPosition, 0, movedTask);
  }

  // Separate into MIT and LIT lists based on their current state
  // Do NOT sort here - tasks are already in correct order from splice operation
  const mitTasks = activeTasks.filter(t => t.isMIT);
  const litTasks = activeTasks.filter(t => !t.isMIT);

  console.log('[reprioritizeTasks] MIT tasks:', mitTasks.length, 'LIT tasks:', litTasks.length);
  console.log('[reprioritizeTasks] MIT task priorities before:', mitTasks.map(t => ({ id: t.TaskId.substring(0, 8), priority: t.priority, priorityType: typeof t.priority, title: t.title })));

  // Update MIT priorities (1-based: 1, 2, 3)
  const mitPromises = mitTasks.map((task, index) => {
    const newPriority = index + 1; // 1-based priority within MIT
    const currentPriority = Number(task.priority); // Ensure it's a number
    console.log(`[reprioritizeTasks] MIT task ${task.TaskId.substring(0, 8)}: ${currentPriority} (${typeof task.priority}) -> ${newPriority} | needsUpdate: ${currentPriority !== newPriority}`);
    if (currentPriority !== newPriority) {
      console.log(`[reprioritizeTasks] UPDATING MIT task ${task.TaskId.substring(0, 8)} priority from ${currentPriority} to ${newPriority}`);
      return docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `TASK#${task.TaskId}` },
        UpdateExpression: 'SET #priority = :priority, #modifiedDate = :modifiedDate',
        ExpressionAttributeNames: { '#priority': 'priority', '#modifiedDate': 'modifiedDate' },
        ExpressionAttributeValues: { ':priority': newPriority, ':modifiedDate': new Date().toISOString() },
      }));
    }
    return Promise.resolve();
  });

  // Update LIT priorities (1-based: 1, 2, 3, 4...)
  const litPromises = litTasks.map((task, index) => {
    const newPriority = index + 1; // 1-based priority within LIT
    const currentPriority = Number(task.priority); // Ensure it's a number
    console.log(`[reprioritizeTasks] LIT task ${task.TaskId.substring(0, 8)}: ${currentPriority} (${typeof task.priority}) -> ${newPriority} | needsUpdate: ${currentPriority !== newPriority}`);
    if (currentPriority !== newPriority) {
      console.log(`[reprioritizeTasks] UPDATING LIT task ${task.TaskId.substring(0, 8)} priority from ${currentPriority} to ${newPriority}`);
      return docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `TASK#${task.TaskId}` },
        UpdateExpression: 'SET #priority = :priority, #modifiedDate = :modifiedDate',
        ExpressionAttributeNames: { '#priority': 'priority', '#modifiedDate': 'modifiedDate' },
        ExpressionAttributeValues: { ':priority': newPriority, ':modifiedDate': new Date().toISOString() },
      }));
    }
    return Promise.resolve();
  });

  await Promise.all([...mitPromises, ...litPromises]);
  console.log('[reprioritizeTasks] Completed. Updated', mitPromises.length + litPromises.length, 'tasks');
};

export async function updateTask(userId: string, taskId: string, updateData: Partial<Task & { position?: number }>): Promise<Task | null> {
  // Validate task data if title or description are being updated
  if (updateData.title || updateData.description) {
    const validation = validateTaskData({
      title: updateData.title || undefined,
      description: updateData.description || undefined,
    });
    if (!validation.isValid) {
      const error = new Error('Validation failed');
      (error as any).validationErrors = validation.errors;
      throw error;
    }
  }

  // If 'position' is present, this is a reordering event.
  // Handle it separately and then proceed with other updates if necessary.
  if (updateData.position !== undefined) {
    await reprioritizeTasks(userId, taskId, updateData.position);
    // After reprioritizing, we remove 'position' so it's not added to the DB.
    delete updateData.position;
  }

  // If after handling position, there are no other fields to update, we can return early.
  // This is especially true if the move was initiated by the arrows, which only sends position.
  if (Object.keys(updateData).length === 0) {
    const updatedTask = await getTask(userId, taskId); // We need to get the updated task state
    return updatedTask;
  }

  const modifiedDate = new Date().toISOString();
  updateData.modifiedDate = modifiedDate;

  // Explicitly handle status updates to ensure data integrity
  if (updateData.status) {
    if (updateData.status === 'Completed') {
      updateData.completedDate = modifiedDate;
    } else if (updateData.status === 'Canceled') {
      updateData.completedDate = null;
    }
  }

  // After the main update, if isMIT was changed, trigger reprioritization
  // BUT only if priority wasn't also explicitly set (which indicates manual reordering)
  if (updateData.isMIT !== undefined && updateData.priority === undefined) {
    // Use a lock to prevent concurrent reprioritization for the same user
    if (!userReprioritizationLocks.has(userId)) {
      const reprioritizePromise = reprioritizeTasks(userId).finally(() => {
        userReprioritizationLocks.delete(userId);
      });
      userReprioritizationLocks.set(userId, reprioritizePromise);
    }
    await userReprioritizationLocks.get(userId);
  }

  const updateExpressionParts: string[] = [];
  const expressionAttributeNames: { [key: string]: string } = {};
  const expressionAttributeValues: { [key: string]: any } = {};

  for (const [key, value] of Object.entries(updateData)) {
    const attributeKey = `#${key}`;
    const attributeValueKey = `:${key}`;
    updateExpressionParts.push(`${attributeKey} = ${attributeValueKey}`);
    expressionAttributeNames[attributeKey] = key;
    expressionAttributeValues[attributeValueKey] = value;
  }

  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: `TASK#${taskId}`,
    },
    UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW' as const,
  };

  try {
    // Get the current task state for audit logging
    const currentTask = await getTask(userId, taskId);

    const command = new UpdateCommand(params);
    const result: UpdateCommandOutput = await docClient.send(command);
    const updatedTask = result.Attributes as Task | null;

    // Log audit event for task update
    if (currentTask && updatedTask) {
      const oldValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};

      // Track significant changes
      if (currentTask.status !== updatedTask.status) {
        oldValues.status = currentTask.status;
        newValues.status = updatedTask.status;
      }

      if (currentTask.isMIT !== updatedTask.isMIT) {
        oldValues.isMIT = currentTask.isMIT;
        newValues.isMIT = updatedTask.isMIT;
      }

      if (currentTask.priority !== updatedTask.priority) {
        oldValues.priority = currentTask.priority;
        newValues.priority = updatedTask.priority;
      }

      // Determine the action type
      let action: 'updated' | 'completed' | 'status_changed' | 'priority_changed' = 'updated';
      if (newValues.status === 'Completed') {
        action = 'completed';
      } else if (newValues.status && newValues.status !== oldValues.status) {
        action = 'status_changed';
      } else if (newValues.isMIT !== undefined || newValues.priority !== undefined) {
        action = 'priority_changed';
      }

      await logTaskAuditEvent(userId, {
        taskId,
        taskTitle: updatedTask.title,
        action,
        oldValues: Object.keys(oldValues).length > 0 ? oldValues : undefined,
        newValues: Object.keys(newValues).length > 0 ? newValues : undefined,
        timestamp: modifiedDate
      });
    }

    return updatedTask;
  } catch (error) {
    console.error("Error updating task:", error);
    throw new Error("Could not update task.");
  }
}

export const deleteTask = async (userId: string, taskId: string) => {
  try {
    // Get the task before deletion for audit logging
    const taskToDelete = await getTask(userId, taskId);

    const command = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `TASK#${taskId}`,
      },
    });

    await docClient.send(command);

    // Log audit event for task deletion
    if (taskToDelete) {
      await logTaskAuditEvent(userId, {
        taskId,
        taskTitle: taskToDelete.title,
        action: 'deleted',
        oldValues: {
          status: taskToDelete.status,
          isMIT: taskToDelete.isMIT,
          priority: taskToDelete.priority
        },
        timestamp: new Date().toISOString()
      });
    }

    return { success: true, message: "Task deleted successfully" };
  } catch (error) {
    console.error("Error deleting task:", error);
    throw new Error("Could not delete task.");
  }
};

// Dashboard API Operations

export interface ProductivityMetrics {
  completedTasks: number;
  createdTasks: number;
  completedMITs: number;
  createdMITs: number;
  taskScore: number;
  mitScore: number;
  finalScore: number;
}

export const getProductivityMetrics = async (userId: string, days: number = 7): Promise<ProductivityMetrics> => {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - days);
  const cutoffDate = daysAgo.toISOString();

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`,
      ":sk": "TASK#",
    },
    ProjectionExpression: "TaskId, #st, isMIT, creationDate, completedDate",
    ExpressionAttributeNames: {
      "#st": "status",
    },
  };

  try {
    const result = await docClient.send(new QueryCommand(params));
    const tasks = result.Items || [];

    // Filter tasks created in the specified time period (excluding canceled)
    const tasksInPeriod = tasks.filter(task =>
      task.creationDate >= cutoffDate && task.status !== 'Canceled'
    );

    // Calculate metrics
    const completedTasks = tasksInPeriod.filter(task =>
      task.status === 'Completed' && task.completedDate >= cutoffDate
    ).length;

    const createdTasks = tasksInPeriod.length;

    const mitsInPeriod = tasksInPeriod.filter(task => task.isMIT);
    const completedMITs = mitsInPeriod.filter(task =>
      task.status === 'Completed' && task.completedDate >= cutoffDate
    ).length;

    const createdMITs = mitsInPeriod.length;

    // Calculate scores
    const taskScore = createdTasks > 0 ? completedTasks / createdTasks : 0;
    const mitScore = createdMITs > 0 ? completedMITs / createdMITs : 0;
    const finalScore = Math.round((taskScore * 0.6 + mitScore * 0.4) * 100);

    return {
      completedTasks,
      createdTasks,
      completedMITs,
      createdMITs,
      taskScore,
      mitScore,
      finalScore
    };
  } catch (error) {
    console.error("Error fetching productivity metrics:", error);
    throw new Error("Could not fetch productivity metrics.");
  }
};

export interface ActivityEntry {
  id: string;
  type: 'completion' | 'priority_change' | 'creation' | 'status_change';
  taskId: string;
  taskTitle: string;
  timestamp: string;
  details: {
    oldValue?: string;
    newValue?: string;
  };
}

export const getRecentActivity = async (userId: string, limit: number = 5): Promise<ActivityEntry[]> => {
  // For now, we'll get recent task completions and status changes
  // In a full implementation, this would query a dedicated activity log
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`,
      ":sk": "TASK#",
    },
    ProjectionExpression: "TaskId, #title, #st, completedDate, modifiedDate, isMIT",
    ExpressionAttributeNames: {
      "#title": "title",
      "#st": "status",
    },
  };

  try {
    const result = await docClient.send(new QueryCommand(params));
    const tasks = result.Items || [];

    const activities: ActivityEntry[] = [];

    // Add completion activities
    tasks
      .filter(task => task.status === 'Completed' && task.completedDate)
      .sort((a, b) => new Date(b.completedDate).getTime() - new Date(a.completedDate).getTime())
      .slice(0, limit)
      .forEach(task => {
        activities.push({
          id: `completion_${task.TaskId}`,
          type: 'completion',
          taskId: task.TaskId,
          taskTitle: task.title,
          timestamp: task.completedDate,
          details: {}
        });
      });

    // Add priority change activities (MIT status changes)
    tasks
      .filter(task => task.modifiedDate)
      .sort((a, b) => new Date(b.modifiedDate).getTime() - new Date(a.modifiedDate).getTime())
      .slice(0, limit * 2) // Get more to filter for actual priority changes
      .forEach(task => {
        if (task.isMIT) {
          activities.push({
            id: `priority_${task.TaskId}`,
            type: 'priority_change',
            taskId: task.TaskId,
            taskTitle: task.title,
            timestamp: task.modifiedDate,
            details: {
              newValue: 'MIT'
            }
          });
        }
      });

    // Sort all activities by timestamp and return the most recent
    return activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

  } catch (error) {
    console.error("Error fetching recent activity:", error);
    throw new Error("Could not fetch recent activity.");
  }
};

export const getUpcomingTasks = async (userId: string, days: number = 7): Promise<Task[]> => {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + days);

  const futureDateStr = futureDate.toISOString().split('T')[0];

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`,
      ":sk": "TASK#",
      ":futureDateStr": futureDateStr,
      ":emptyValue": "",
    },
    FilterExpression: "#st = :openStatus AND attribute_exists(#dueDate) AND #dueDate <> :emptyValue AND #dueDate <= :futureDateStr",
    ProjectionExpression: "TaskId, #title, #description, dueDate, #st, isMIT, priority, creationDate, modifiedDate",
    ExpressionAttributeNames: {
      "#title": "title",
      "#description": "description",
      "#st": "status",
      "#dueDate": "dueDate",
    },
  };

  // Add the open status value
  (params.ExpressionAttributeValues as any)[":openStatus"] = "Open";

  try {
    const result = await docClient.send(new QueryCommand(params));
    const tasks = (result.Items || []) as Task[];

    const today = new Date().toISOString().split('T')[0];

    // Sort by urgency: overdue first, then due today, then future dates (earliest first)
    return tasks.sort((a, b) => {
      if (!a.dueDate || !b.dueDate) return 0;

      const aIsOverdue = a.dueDate < today;
      const bIsOverdue = b.dueDate < today;
      const aIsDueToday = a.dueDate === today;
      const bIsDueToday = b.dueDate === today;

      // Overdue tasks come first
      if (aIsOverdue && !bIsOverdue) return -1;
      if (bIsOverdue && !aIsOverdue) return 1;

      // If both are overdue, sort by earliest due date first (most overdue)
      if (aIsOverdue && bIsOverdue) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }

      // Due today tasks come before future tasks
      if (aIsDueToday && !bIsDueToday && !bIsOverdue) return -1;
      if (bIsDueToday && !aIsDueToday && !aIsOverdue) return 1;

      // For all other cases, sort by due date (earliest first)
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  } catch (error) {
    console.error("Error fetching upcoming tasks:", error);
    throw new Error("Could not fetch upcoming tasks.");
  }
};