import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import docClient from "./dynamo";

const TABLE_NAME = process.env.TABLE_NAME || "taskvision-prod";

interface TaskInput {
  title: string;
  description?: string;
  // any other fields you expect from the client
}

export const createTask = async (userId: string, taskData: TaskInput) => {
  const taskId = ulid();
  const task = {
    PK: `USER#${userId}`,
    SK: `TASK#${taskId}`,
    GSI1PK: `USER#${userId}`,
    GSI1SK: `TASK#${taskId}`, // You can add a sort key for GSI if needed, e.g., based on status or due date
    EntityType: "Task",
    TaskId: taskId,
    UserId: userId,
    ...taskData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

export const getTasksForUser = async (userId: string) => {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`,
      ":sk": "TASK#",
    },
  });

  try {
    const { Items } = await docClient.send(command);
    return Items;
  } catch (error) {
    console.error("Error fetching tasks:", error);
    throw new Error("Could not fetch tasks.");
  }
};

interface TaskUpdateInput {
  title?: string;
  description?: string;
  // any other fields that can be updated
}

export const updateTask = async (
  userId: string,
  taskId: string,
  updateData: TaskUpdateInput
) => {
  // Build the UpdateExpression and ExpressionAttributeValues dynamically
  const updateExpression: string[] = [];
  const expressionAttributeValues: { [key: string]: any } = {};
  const expressionAttributeNames: { [key: string]: string } = {};

  for (const [key, value] of Object.entries(updateData)) {
    if (value !== undefined) {
      const attributeKey = `:${key}`;
      const attributeName = `#${key}`;
      updateExpression.push(`${attributeName} = ${attributeKey}`);
      expressionAttributeValues[attributeKey] = value;
      expressionAttributeNames[attributeName] = key;
    }
  }

  // Add the updatedAt timestamp
  updateExpression.push("#updatedAt = :updatedAt");
  expressionAttributeNames["#updatedAt"] = "updatedAt";
  expressionAttributeValues[":updatedAt"] = new Date().toISOString();

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: `TASK#${taskId}`,
    },
    UpdateExpression: `SET ${updateExpression.join(", ")}`,
    ExpressionAttributeValues: expressionAttributeValues,
    ExpressionAttributeNames: expressionAttributeNames,
    ReturnValues: "ALL_NEW", // Returns the item as it appeared after the update
  });

  try {
    const { Attributes } = await docClient.send(command);
    return Attributes;
  } catch (error) {
    console.error("Error updating task:", error);
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