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
  
  const task = {
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

  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: task,
  });

  try {
    await docClient.send(command);
    
    // Trigger reprioritization to handle the new task's position
    await reprioritizeTasks(userId, taskId, (taskData.priority || 1) - 1);
    
    return task;
  } catch (error) {
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
  let projectionExpression = "TaskId, #title, #description, dueDate, #st, isMIT, priority, creationDate, modifiedDate, completedDate, tags";

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
    params.ExpressionAttributeValues[searchPlaceholder] =
      filters.search.toLowerCase();
    filterExpressions.push(
      `(contains(lower(#title), ${searchPlaceholder}) OR contains(lower(#description), ${searchPlaceholder}))`
    );
  }

  // Date filtering
  if (filters.dateFilter && filters.dateFilter !== 'all') {
    params.ExpressionAttributeNames["#dueDate"] = "dueDate";
    
    if (filters.dateFilter === 'pastDue') {
      // Past due: has due date AND due date is not empty AND due date < today
      if (filters.endDate) {
        filterExpressions.push(`(attribute_exists(#dueDate) AND #dueDate <> :emptyValue AND #dueDate < :endDate)`);
        params.ExpressionAttributeValues[":endDate"] = filters.endDate;
        params.ExpressionAttributeValues[":emptyValue"] = "";
      }
    } else if (filters.dateFilter === 'dueToday') {
      // Due today: due date = today
      if (filters.startDate) {
        filterExpressions.push(`(attribute_exists(#dueDate) AND #dueDate = :startDate)`);
        params.ExpressionAttributeValues[":startDate"] = filters.startDate;
      }
    } else if (filters.dateFilter === 'dueThisWeek' || filters.dateFilter === 'dueThisMonth') {
      // Due this week/month: due date >= startDate AND due date <= endDate
      if (filters.startDate && filters.endDate) {
        filterExpressions.push(`(attribute_exists(#dueDate) AND #dueDate >= :startDate AND #dueDate <= :endDate)`);
        params.ExpressionAttributeValues[":startDate"] = filters.startDate;
        params.ExpressionAttributeValues[":endDate"] = filters.endDate;
      }
    } else if (filters.dateFilter === 'noDueDate') {
      // No due date: either dueDate doesn't exist or is null/empty
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
    // Use a strongly consistent read to ensure we get the latest data
    const allTasksResult = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
        ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":sk": "TASK#" },
        ConsistentRead: true,
    }));
    
    let allTasks = allTasksResult.Items || [];

    // Filter out completed and canceled tasks, as they don't have a priority
    let activeTasks = allTasks.filter(t => t.status !== 'Completed' && t.status !== 'Canceled');

    const movedTask = movedTaskId ? activeTasks.find(t => t.TaskId === movedTaskId) : undefined;
    
    if (movedTask && newPosition !== undefined) {
        // Remove the moved task from its current spot
        activeTasks = activeTasks.filter(t => t.TaskId !== movedTaskId);
        // Insert it at the new position
        activeTasks.splice(newPosition, 0, movedTask);
    }
    
    // Separate into MIT and LIT lists based on their current state
    const mitTasks = activeTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
    const litTasks = activeTasks.filter(t => !t.isMIT).sort((a, b) => a.priority - b.priority);

    // Update MIT priorities (1-based: 1, 2, 3)
    const mitPromises = mitTasks.map((task, index) => {
        const newPriority = index + 1; // 1-based priority within MIT
        if (task.priority !== newPriority) {
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
        if (task.priority !== newPriority) {
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
  if (updateData.isMIT !== undefined) {
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
    const command = new UpdateCommand(params);
    const result: UpdateCommandOutput = await docClient.send(command);
    const updatedTask = result.Attributes as Task | null;

    // After the main update, if isMIT was changed, trigger reprioritization
    if (updateData.isMIT !== undefined) {
      await reprioritizeTasks(userId);
    }

    return updatedTask;
  } catch (error) {
    throw new Error("Could not update task.");
  }
}

export const deleteTask = async (userId: string, taskId: string) => {
  const command = new DeleteCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: `TASK#${taskId}`,
    },
  });

  try {
    await docClient.send(command);
    return { success: true, message: "Task deleted successfully" };
  } catch (error) {
    console.error("Error deleting task:", error);
    throw new Error("Could not delete task.");
  }
};