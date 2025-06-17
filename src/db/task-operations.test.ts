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

import {
  createTask,
  getTasksForUser,
  updateTask,
  deleteTask,
} from "./task-operations";
import { Task } from "../types";

describe("Task Operations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createTask", () => {
    it("should create a new task", async () => {
      const testTask = {
        title: "Test Task",
        description: "Test Description",
        status: "Open" as const,
      };

      mockSend.mockResolvedValueOnce({});

      const task = await createTask("test-user-id", testTask);

      expect(task).toBeDefined();
      expect(task.title).toBe(testTask.title);
      expect(task.description).toBe(testTask.description);
      expect(task.status).toBe(testTask.status);
      expect(task.creationDate).toBeDefined();
      expect(task.modifiedDate).toBeDefined();
      expect(task.completedDate).toBeNull();
      expect(task.UserId).toBe("test-user-id");
    });

    it("should set completedDate when status is Completed", async () => {
      const testTask = {
        title: "Test Task",
        description: "Test Description",
        status: "Completed" as const,
      };

      mockSend.mockResolvedValueOnce({});

      const task = await createTask("test-user-id", testTask);

      expect(task.completedDate).toBeDefined();
      expect(task.status).toBe("Completed");
    });
  });

  describe("getTasksForUser", () => {
    it("should return tasks for a user", async () => {
      const mockTasks = [
        {
          PK: "USER#test-user-id",
          SK: "TASK#1",
          title: "Task 1",
          status: "Open",
        },
        {
          PK: "USER#test-user-id",
          SK: "TASK#2",
          title: "Task 2",
          status: "Completed",
        },
      ];

      mockSend.mockResolvedValueOnce({ Items: mockTasks });

      const tasks = await getTasksForUser("test-user-id");

      expect(tasks).toEqual(mockTasks);
    });
  });

  describe("updateTask", () => {
    it("should update a task", async () => {
      const updateData: Partial<Task> = {
        title: "Updated Title",
        status: "Completed",
      };

      const mockReturnedTask: Task = {
        TaskId: "task-1",
        UserId: "test-user-id",
        title: "Updated Title",
        status: "Completed",
        description: "Test Description",
        creationDate: "2023-01-01T00:00:00.000Z",
        modifiedDate: "2023-01-01T00:00:00.000Z",
        completedDate: "2023-01-01T00:00:00.000Z",
        dueDate: null,
        priority: 1,
        isMIT: false,
        tags: [],
      };

      mockSend.mockResolvedValueOnce({ Attributes: mockReturnedTask });

      const updatedTask = (await updateTask(
        "test-user-id",
        "task-1",
        updateData
      )) as Task;

      expect(updatedTask).toEqual(mockReturnedTask);
    });

    it("should clear completedDate when status changes from Completed", async () => {
      const updateData: Partial<Task> = {
        status: "Open",
      };

      const mockReturnedTask: Task = {
        TaskId: "task-1",
        UserId: "test-user-id",
        title: "Test Task",
        status: "Open",
        description: "Test Description",
        creationDate: "2023-01-01T00:00:00.000Z",
        modifiedDate: "2023-01-01T00:00:00.000Z",
        completedDate: null,
        dueDate: null,
        priority: 1,
        isMIT: false,
        tags: [],
      };

      mockSend.mockResolvedValueOnce({ Attributes: mockReturnedTask });

      const updatedTask = (await updateTask(
        "test-user-id",
        "task-1",
        updateData
      )) as Task;

      expect(updatedTask.completedDate).toBeNull();
    });
  });

  describe("deleteTask", () => {
    it("should delete a task", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await deleteTask("test-user-id", "task-1");

      expect(result).toEqual({
        success: true,
        message: "Task deleted successfully",
      });
    });
  });
}); 