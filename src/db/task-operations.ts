import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  UpdateCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import docClient from "./dynamo";
import { Task } from '../types';

const TABLE_NAME = process.env.TABLE_NAME || "TaskVision";

// A map to store promises for ongoing re-prioritization to avoid race conditions
const userReprioritizationLocks = new Map<string, Promise<any>>();

type TaskStatus = "Open" | "Completed" | "Canceled" | "Waiting";

interface TaskInput {
  title: string;
  description?: string;
  dueDate?: string;
  status: TaskStatus;
}

export const createTask = async (userId: string, taskData: TaskInput) => {
  // First, get the current number of tasks to determine the new priority
  const existingTasks = await getTasksForUser(userId);
  const newPriority = (existingTasks?.length || 0) + 1;

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
    isMIT: false,
    priority: newPriority,
    ...taskData,
    tags: [], // Initialize with an empty array
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

export const reprioritizeTasks = async (userId: string) => {
  const allTasks = await getTasksForUser(userId);

  if (!allTasks) return;

  const mitTasks = allTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
  const litTasks = allTasks.filter(t => !t.isMIT).sort((a, b) => a.priority - b.priority);

  let currentPriority = 1;
  const promises = [];

  for (const task of mitTasks) {
    if (task.priority !== currentPriority) {
      promises.push(updateTask(userId, task.TaskId, { priority: currentPriority }));
    }
    currentPriority++;
  }

  for (const task of litTasks) {
    if (task.priority !== currentPriority) {
      promises.push(updateTask(userId, task.TaskId, { priority: currentPriority }));
    }
    currentPriority++;
  }

  await Promise.all(promises);
};

export async function updateTask(userId: string, taskId: string, updateData: Partial<Task>): Promise<Task | null> {
  const isReprioritizing = updateData.priority !== undefined && Object.keys(updateData).length === 1;

  // If this is a priority-only update, we can skip the complex logic
  if (isReprioritizing) {
    // Simplified update for reprioritization calls to avoid loops
    const priorityUpdateParams = {
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `TASK#${taskId}` },
      UpdateExpression: 'SET #priority = :priority, #modifiedDate = :modifiedDate',
      ExpressionAttributeNames: { '#priority': 'priority', '#modifiedDate': 'modifiedDate' },
      ExpressionAttributeValues: { ':priority': updateData.priority, ':modifiedDate': new Date().toISOString() },
      ReturnValues: 'ALL_NEW' as const,
    };
    const result = await docClient.send(new UpdateCommand(priorityUpdateParams));
    return result.Attributes as Task | null;
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