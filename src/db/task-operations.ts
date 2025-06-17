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

type TaskStatus = "Open" | "Completed" | "Canceled" | "Waiting";

interface TaskInput {
  title: string;
  description?: string;
  dueDate?: string;
  status: TaskStatus;
}

export const createTask = async (userId: string, taskData: TaskInput) => {
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
    priority: 999, // Default to last
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

  console.log("[getTasksForUser] Querying with params:", JSON.stringify(params, null, 2));

  try {
    const result = await docClient.send(new QueryCommand(params));
    return result.Items;
  } catch (error) {
    console.error("Error fetching tasks for user:", error);
    throw new Error("Could not fetch tasks.");
  }
};

export async function updateTask(userId: string, taskId: string, updateData: Partial<Task>): Promise<Task | null> {
  console.log(`[updateTask] Starting update for userId: ${userId}, taskId: ${taskId}`);
  console.log(`[updateTask] Received updateData:`, updateData);

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

  console.log('[updateTask] Sending UpdateCommand to DynamoDB:', JSON.stringify(params, null, 2));

  try {
    const command = new UpdateCommand(params);
    const result: UpdateCommandOutput = await docClient.send(command);
    console.log('[updateTask] Successfully updated task. New attributes:', result.Attributes);
    return result.Attributes as Task | null;
  } catch (error) {
    console.error('[updateTask] CRITICAL: Error updating task in DynamoDB:', error);
    throw new Error('Could not update task.');
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