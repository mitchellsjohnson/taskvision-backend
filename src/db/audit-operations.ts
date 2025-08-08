import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import docClient from "./dynamo";

const TABLE_NAME = process.env.TABLE_NAME || "TaskVision";

export interface AuditLogEntry {
  userInput: string;
  functionCalled?: string;
  parameters?: any;
  result?: any;
  error?: string;
  timestamp: string;
}

export interface TaskAuditEntry {
  taskId: string;
  taskTitle: string;
  action: 'created' | 'updated' | 'deleted' | 'completed' | 'status_changed' | 'priority_changed';
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  timestamp: string;
}

export const logAuditEvent = async (userId: string, entry: AuditLogEntry) => {
  const auditId = ulid();
  const auditLogItem = {
    PK: `AUDITLOG#${userId}`,
    SK: `ENTRY#${auditId}`,
    GSI1PK: "AUDITLOG",
    GSI1SK: entry.timestamp,
    EntityType: "AuditLog",
    AuditId: auditId,
    UserId: userId,
    ...entry
  };

  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: auditLogItem,
  });

  try {
    await docClient.send(command);
    return auditLogItem;
  } catch (error) {
    console.error("Error logging audit event:", error);
    throw new Error("Could not log audit event.");
  }
};

export const logTaskAuditEvent = async (userId: string, entry: TaskAuditEntry) => {
  const auditId = ulid();
  const auditLogItem = {
    PK: `TASKAUDIT#${userId}`,
    SK: `ENTRY#${auditId}`,
    GSI1PK: `TASKAUDIT#${entry.taskId}`,
    GSI1SK: entry.timestamp,
    EntityType: "TaskAudit",
    AuditId: auditId,
    UserId: userId,
    ...entry
  };

  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: auditLogItem,
  });

  try {
    await docClient.send(command);
    return auditLogItem;
  } catch (error) {
    console.error("Error logging task audit event:", error);
    // Don't throw error for audit logging failures to avoid breaking main functionality
    console.warn("Task audit logging failed, continuing with operation");
  }
};

export const getTaskAuditHistory = async (userId: string, limit: number = 10): Promise<TaskAuditEntry[]> => {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `TASKAUDIT#${userId}`,
      ":sk": "ENTRY#",
    },
    ScanIndexForward: false, // Sort by SK in descending order (most recent first)
    Limit: limit,
  };

  try {
    const result = await docClient.send(new QueryCommand(params));
    return (result.Items || []) as TaskAuditEntry[];
  } catch (error) {
    console.error("Error fetching task audit history:", error);
    return [];
  }
};