import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import docClient from "./dynamo";

const TABLE_NAME = process.env.TABLE_NAME || "TaskVision";

type TaskStatus = "Open" | "Completed" | "Canceled";

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
  };

  const filterExpressions: string[] = [];
  const expressionAttributeNames: { [key: string]: string } = {};

  if (filters.status && filters.status.length > 0) {
    const statusPlaceholders = filters.status.map((s, i) => `:status${i}`);
    filterExpressions.push(`#status IN (${statusPlaceholders.join(", ")})`);
    expressionAttributeNames["#status"] = "status";
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
    expressionAttributeNames["#tags"] = "tags";
  }

  if (filters.search) {
    const searchPlaceholder = ":search";
    params.ExpressionAttributeValues[searchPlaceholder] =
      filters.search.toLowerCase();
    filterExpressions.push(
      `(contains(lower(#title), ${searchPlaceholder}) OR contains(lower(#description), ${searchPlaceholder}))`
    );
    expressionAttributeNames["#title"] = "title";
    expressionAttributeNames["#description"] = "description";
  }

  if (filterExpressions.length > 0) {
    params.FilterExpression = filterExpressions.join(" AND ");
    if (Object.keys(expressionAttributeNames).length > 0) {
      params.ExpressionAttributeNames = expressionAttributeNames;
    }
  }

  console.log("[getTasksForUser] Querying with params:", JSON.stringify(params, null, 2));

  try {
    const { Items } = await docClient.send(new QueryCommand(params));
    return Items;
  } catch (error) {
    console.error("Error fetching tasks with filters:", error);
    throw new Error("Could not fetch tasks.");
  }
};

interface TaskUpdateInput {
  title?: string;
  description?: string;
  dueDate?: string;
  status?: TaskStatus;
  isMIT?: boolean;
  priority?: number;
  [key: string]: any; // Allow other properties
}

export const updateTask = async (
  userId: string,
  taskId: string,
  updateData: TaskUpdateInput
) => {
  console.log(`[updateTask] Starting update for userId: ${userId}, taskId: ${taskId}`);
  console.log("[updateTask] Received updateData:", JSON.stringify(updateData, null, 2));

  const updateExpression: string[] = [];
  const expressionAttributeValues: { [key: string]: any } = {};
  const expressionAttributeNames: { [key: string]: string } = {};

  // Always update the modifiedDate
  const now = new Date().toISOString();
  updateExpression.push("#modifiedDate = :modifiedDate");
  expressionAttributeNames["#modifiedDate"] = "modifiedDate";
  expressionAttributeValues[":modifiedDate"] = now;

  // Iterate over all keys in updateData to build the update expression
  for (const [key, value] of Object.entries(updateData)) {
    // Skip keys that are part of the primary key or shouldn't be changed
    if (key === "PK" || key === "SK" || key === "UserId" || key === "TaskId" || key === "creationDate") continue;
    
    // We handle modifiedDate separately above
    if (key === "modifiedDate") continue;

    if (value !== undefined) {
      const attributeName = `#${key}`;
      const attributeValueKey = `:${key}`;

      updateExpression.push(`${attributeName} = ${attributeValueKey}`);
      expressionAttributeNames[attributeName] = key;
      expressionAttributeValues[attributeValueKey] = value;
      
      // Special handling for completedDate when status changes
      if (key === "status") {
        updateExpression.push("#completedDate = :completedDate");
        expressionAttributeNames["#completedDate"] = "completedDate";
        expressionAttributeValues[":completedDate"] = (value === "Completed") ? now : null;
      }
    }
  }

  if (updateExpression.length === 0) {
    // No fields to update
    console.log("[updateTask] No fields to update. Exiting.");
    return;
  }

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: `TASK#${taskId}`,
    },
    UpdateExpression: `SET ${updateExpression.join(", ")}`,
    ExpressionAttributeValues: expressionAttributeValues,
    ExpressionAttributeNames: expressionAttributeNames,
    ReturnValues: "ALL_NEW",
  });

  console.log("[updateTask] Sending UpdateCommand to DynamoDB:", JSON.stringify(command, null, 2));

  try {
    const { Attributes } = await docClient.send(command);
    console.log("[updateTask] Successfully updated task. New attributes:", Attributes);
    return Attributes;
  } catch (error) {
    console.error("[updateTask] CRITICAL: Error updating task in DynamoDB:", error);
    throw new Error("Could not update task.");
  }
};

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