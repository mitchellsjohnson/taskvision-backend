const mockSend = jest.fn();

const mockDynamoDBClient = { send: mockSend };

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn(() => mockDynamoDBClient),
  CreateTableCommand: jest.fn(),
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: mockSend,
    })),
  },
  PutCommand: jest.fn(input => ({ type: 'Put', input })),
  QueryCommand: jest.fn(input => ({ type: 'Query', input })),
}));

import {
  logAuditEvent,
  logTaskAuditEvent,
  getTaskAuditHistory,
  AuditLogEntry,
  TaskAuditEntry,
} from "./audit-operations";

describe("Audit Operations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("logAuditEvent", () => {
    it("should log an audit event successfully", async () => {
      const auditEntry: AuditLogEntry = {
        userInput: "Create new task",
        functionCalled: "createTask",
        parameters: { title: "Test Task" },
        result: { taskId: "task-123" },
        timestamp: "2023-01-01T12:00:00.000Z"
      };

      mockSend.mockResolvedValueOnce({});

      const result = await logAuditEvent("test-user-id", auditEntry);

      expect(result).toBeDefined();
      expect(result.UserId).toBe("test-user-id");
      expect(result.userInput).toBe(auditEntry.userInput);
      expect(result.functionCalled).toBe(auditEntry.functionCalled);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Put',
          input: expect.objectContaining({
            TableName: "TaskVision",
            Item: expect.objectContaining({
              PK: "AUDITLOG#test-user-id",
              EntityType: "AuditLog",
              UserId: "test-user-id",
              userInput: auditEntry.userInput
            })
          })
        })
      );
    });

    it("should handle database errors", async () => {
      const auditEntry: AuditLogEntry = {
        userInput: "Test input",
        timestamp: "2023-01-01T12:00:00.000Z"
      };

      mockSend.mockRejectedValueOnce(new Error("Database error"));

      await expect(logAuditEvent("test-user-id", auditEntry))
        .rejects.toThrow("Could not log audit event.");
    });
  });

  describe("logTaskAuditEvent", () => {
    it("should log a task audit event successfully", async () => {
      const taskAuditEntry: TaskAuditEntry = {
        taskId: "task-123",
        taskTitle: "Test Task",
        action: "created",
        newValues: { status: "Open", isMIT: false },
        timestamp: "2023-01-01T12:00:00.000Z"
      };

      mockSend.mockResolvedValueOnce({});

      const result = await logTaskAuditEvent("test-user-id", taskAuditEntry);

      expect(result).toBeDefined();
      expect(result?.UserId).toBe("test-user-id");
      expect(result?.taskId).toBe(taskAuditEntry.taskId);
      expect(result?.action).toBe(taskAuditEntry.action);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Put',
          input: expect.objectContaining({
            TableName: "TaskVision",
            Item: expect.objectContaining({
              PK: "TASKAUDIT#test-user-id",
              GSI1PK: "TASKAUDIT#task-123",
              EntityType: "TaskAudit",
              UserId: "test-user-id",
              taskId: "task-123",
              action: "created"
            })
          })
        })
      );
    });

    it("should handle database errors gracefully without throwing", async () => {
      const taskAuditEntry: TaskAuditEntry = {
        taskId: "task-123",
        taskTitle: "Test Task",
        action: "created",
        timestamp: "2023-01-01T12:00:00.000Z"
      };

      mockSend.mockRejectedValueOnce(new Error("Database error"));

      // Should not throw an error
      await expect(logTaskAuditEvent("test-user-id", taskAuditEntry))
        .resolves.toBeUndefined();
    });
  });

  describe("getTaskAuditHistory", () => {
    it("should return task audit history", async () => {
      const mockAuditEntries = [
        {
          AuditId: "audit-1",
          UserId: "test-user-id",
          taskId: "task-123",
          taskTitle: "Test Task",
          action: "completed",
          oldValues: { status: "Open" },
          newValues: { status: "Completed" },
          timestamp: "2023-01-01T12:00:00.000Z"
        },
        {
          AuditId: "audit-2",
          UserId: "test-user-id",
          taskId: "task-456",
          taskTitle: "Another Task",
          action: "created",
          newValues: { status: "Open", isMIT: true },
          timestamp: "2023-01-01T11:00:00.000Z"
        }
      ];

      mockSend.mockResolvedValueOnce({ Items: mockAuditEntries });

      const history = await getTaskAuditHistory("test-user-id", 10);

      expect(history).toEqual(mockAuditEntries);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Query',
          input: expect.objectContaining({
            TableName: "TaskVision",
            KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
            ExpressionAttributeValues: {
              ":pk": "TASKAUDIT#test-user-id",
              ":sk": "ENTRY#"
            },
            ScanIndexForward: false,
            Limit: 10
          })
        })
      );
    });

    it("should handle empty audit history", async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const history = await getTaskAuditHistory("test-user-id", 10);

      expect(history).toEqual([]);
    });

    it("should handle database errors gracefully", async () => {
      mockSend.mockRejectedValueOnce(new Error("Database error"));

      const history = await getTaskAuditHistory("test-user-id", 10);

      expect(history).toEqual([]);
    });
  });
});