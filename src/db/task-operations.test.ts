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
  PutCommand: jest.fn(),
  QueryCommand: jest.fn(),
  UpdateCommand: jest.fn(),
  DeleteCommand: jest.fn(),
}));

import { createTask, getTasksForUser, updateTask, deleteTask } from "./task-operations";

describe("Task Operations", () => {
  let createdTaskId: string;

  // Test data
  const testTask = {
    title: "Test Task",
    description: "This is a test task",
  };

  const updatedTask = {
    title: "Updated Test Task",
    description: "This is an updated test task",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createdTaskId = "test-task-123";
  });

  describe("Create Task", () => {
    it("should create a new task", async () => {
      const mockResponse = {
        Attributes: {
          TaskId: createdTaskId,
          title: testTask.title,
          description: testTask.description,
          UserId: "test-user-id",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
      mockSend.mockResolvedValueOnce(mockResponse);

      const task = await createTask("test-user-id", testTask);

      expect(task).toBeDefined();
      expect(task.title).toBe(testTask.title);
      expect(task.description).toBe(testTask.description);
      expect(task.UserId).toBe("test-user-id");
      expect(typeof task.TaskId).toBe("string");
      expect(task.TaskId).toBeDefined();
      expect(task.createdAt).toBeDefined();
      expect(task.updatedAt).toBeDefined();
    });
  });

  describe("Get Tasks", () => {
    it("should retrieve tasks for a user", async () => {
      const mockResponse = {
        Items: [
          {
            TaskId: createdTaskId,
            title: testTask.title,
            description: testTask.description,
            UserId: "test-user-id",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };
      mockSend.mockResolvedValueOnce(mockResponse);

      const tasks = await getTasksForUser("test-user-id") || [];

      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBe(1);
      expect(tasks[0].TaskId).toBe(createdTaskId);
      expect(tasks[0].title).toBe(testTask.title);
      expect(tasks[0].description).toBe(testTask.description);
    });
  });

  describe("Update Task", () => {
    it("should update an existing task", async () => {
      const mockResponse = {
        Attributes: {
          TaskId: createdTaskId,
          title: updatedTask.title,
          description: updatedTask.description,
          UserId: "test-user-id",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
      mockSend.mockResolvedValueOnce(mockResponse);

      const updatedTaskResult = await updateTask("test-user-id", createdTaskId, updatedTask);

      expect(updatedTaskResult).toBeDefined();
      expect(updatedTaskResult?.title).toBe(updatedTask.title);
      expect(updatedTaskResult?.description).toBe(updatedTask.description);
      expect(updatedTaskResult?.updatedAt).toBeDefined();
    });
  });

  describe("Delete Task", () => {
    it("should delete a task", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await deleteTask("test-user-id", createdTaskId);
      expect(result.success).toBe(true);
    });
  });
}); 