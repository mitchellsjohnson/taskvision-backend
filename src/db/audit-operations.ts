import { PutCommand } from "@aws-sdk/lib-dynamodb";
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