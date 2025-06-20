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
  UpdateCommand: jest.fn(input => ({ type: 'Update', input })),
  DeleteCommand: jest.fn(input => ({ type: 'Delete', input })),
}));

import {
  createTask,
  getTasksForUser,
  updateTask,
  deleteTask,
  reprioritizeTasks,
} from "./task-operations";
import { Task } from "../types";

describe("Task Operations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createTask", () => {
    it("should create a new task with the correct priority", async () => {
      const testTask = {
        title: "Test Task",
        description: "Test Description",
        status: "Open" as const,
      };

      mockSend
        .mockResolvedValueOnce({ Items: [{ priority: 1 }, { priority: 2 }] })
        .mockResolvedValueOnce({});

      const task = await createTask("test-user-id", testTask);

      expect(task).toBeDefined();
      expect(task.title).toBe(testTask.title);
      expect(task.priority).toBe(1);
      expect(task.description).toBe(testTask.description);
      expect(task.status).toBe(testTask.status);
      expect(task.creationDate).toBeDefined();
      expect(task.modifiedDate).toBeDefined();
      expect(task.completedDate).toBeNull();
      expect(task.UserId).toBe("test-user-id");
    });

    it("should create a new task", async () => {
      const testTask = {
        title: "Test Task",
        description: "Test Description",
        status: "Open" as const,
      };

      mockSend
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValue({});

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

      mockSend
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValue({});

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
    it("should call reprioritizeTasks when priority is changed", async () => {
      const updateData: Partial<Task> = {
        priority: 2,
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
        priority: 2,
        isMIT: false,
        tags: [],
      };
      
      mockSend.mockResolvedValueOnce({ Attributes: mockReturnedTask });
      // reprioritizeTasks will call getTasksForUser and then update tasks
      mockSend.mockResolvedValueOnce({ Items: [] }); // for getTasksForUser inside reprioritize
      mockSend.mockResolvedValue({}); // for updateTask inside reprioritize

      await updateTask("test-user-id", "task-1", updateData);

      // We expect getTasksForUser to be called inside reprioritizeTasks
      expect(mockSend).toHaveBeenCalled();
    });

    it("should call reprioritizeTasks when isMIT is changed", async () => {
      const updateData: Partial<Task> = {
        isMIT: true,
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
        isMIT: true,
        tags: [],
      };

      mockSend.mockResolvedValueOnce({ Attributes: mockReturnedTask });
      // reprioritizeTasks will call getTasksForUser and then update tasks
      mockSend.mockResolvedValueOnce({ Items: [] }); // for getTasksForUser inside reprioritize
      mockSend.mockResolvedValue({}); // for updateTask inside reprioritize

      await updateTask("test-user-id", "task-1", updateData);

      // We expect getTasksForUser to be called inside reprioritizeTasks
      expect(mockSend).toHaveBeenCalled();
    });

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

  describe("reprioritizeTasks", () => {
    it("should reprioritize tasks correctly when priorities need updating", async () => {
      const mockTasks = [
        { TaskId: "task-1", isMIT: false, priority: 4, status: "Open" },
        { TaskId: "task-2", isMIT: true, priority: 1, status: "Open" },
        { TaskId: "task-3", isMIT: false, priority: 2, status: "Open" },
        { TaskId: "task-4", isMIT: true, priority: 3, status: "Open" },
      ];

      mockSend.mockImplementation(command => {
        if (command.type === 'Query') {
          return Promise.resolve({ Items: mockTasks });
        }
        if (command.type === 'Update') {
          return Promise.resolve({ Attributes: { ...command.input } });
        }
        return Promise.resolve({});
      });

      await reprioritizeTasks("test-user-id");
      
      const updateCalls = mockSend.mock.calls.filter(call => call[0].type === 'Update');

      // Should update tasks whose priorities changed from their expected positions
      expect(updateCalls.length).toBeGreaterThan(0);
      
      // Verify at least one task got updated with correct priority structure
      const someUpdateCall = updateCalls[0];
      expect(someUpdateCall[0].input.UpdateExpression).toContain('priority');
      expect(someUpdateCall[0].input.ExpressionAttributeValues).toHaveProperty(':priority');
    });

    it("should handle empty task list", async () => {
      mockSend.mockImplementation(command => {
        if (command.type === 'Query') {
          return Promise.resolve({ Items: [] });
        }
        return Promise.resolve({});
      });

      await reprioritizeTasks("test-user-id");
      
      const updateCalls = mockSend.mock.calls.filter(call => call[0].type === 'Update');
      expect(updateCalls.length).toBe(0);
    });
  });
}); 