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
  GetCommand: jest.fn(input => ({ type: 'Get', input })),
}));

// Mock audit operations
jest.mock('./audit-operations', () => ({
  logTaskAuditEvent: jest.fn().mockResolvedValue({}),
}));

import {
  createTask,
  getTasksForUser,
  updateTask,
  deleteTask,
  reprioritizeTasks,
  getProductivityMetrics,
  getRecentActivity,
  getUpcomingTasks,
} from "./task-operations";
import { Task } from "../types";

describe("Task Operations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
  });

  describe("createTask", () => {
    it("should create a new task with the correct priority", async () => {
      const testTask = {
        title: "Test Task",
        description: "Test Description",
        status: "Open" as const,
      };

      mockSend
        .mockResolvedValueOnce({ Items: [] }) // QueryCommand for duplicate check
        .mockResolvedValueOnce({}); // PutCommand for createTask
      // OPTIMIZED: No longer calls reprioritizeTasks unless insertPosition is provided

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

    it("should create a new task without reprioritizing", async () => {
      const testTask = {
        title: "Test Task",
        description: "Test Description",
        status: "Open" as const,
      };

      mockSend
        .mockResolvedValueOnce({ Items: [] }) // Duplicate check
        .mockResolvedValueOnce({}); // PutCommand

      const task = await createTask("test-user-id", testTask);

      expect(task).toBeDefined();
      expect(task.title).toBe(testTask.title);
      expect(task.description).toBe(testTask.description);
      expect(task.status).toBe(testTask.status);
      expect(task.creationDate).toBeDefined();
      expect(task.modifiedDate).toBeDefined();
      expect(task.completedDate).toBeNull();
      expect(task.UserId).toBe("test-user-id");
      
      // Verify only 2 DynamoDB calls (duplicate check + create), no reprioritization
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("should reprioritize when insertPosition is provided", async () => {
      const testTask = {
        title: "Test Task",
        description: "Test Description",
        status: "Open" as const,
        insertPosition: 2,
      };

      mockSend
        .mockResolvedValueOnce({ Items: [] }) // Duplicate check
        .mockResolvedValueOnce({}) // PutCommand
        .mockResolvedValueOnce({ Items: [] }) // QueryCommand for reprioritizeTasks
        .mockResolvedValueOnce({ Item: { TaskId: 'test', priority: 2 } }); // GetCommand for updated task

      const task = await createTask("test-user-id", testTask);

      expect(task).toBeDefined();
      // Should have called reprioritizeTasks
      expect(mockSend).toHaveBeenCalledTimes(4);
    });

    it("should set completedDate when status is Completed", async () => {
      const testTask = {
        title: "Test Task",
        description: "Test Description",
        status: "Completed" as const,
      };

      mockSend
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({});

      const task = await createTask("test-user-id", testTask);

      expect(task.completedDate).toBeDefined();
      expect(task.status).toBe("Completed");
    });
    
    it("should detect duplicate tasks (case-insensitive)", async () => {
      const testTask = {
        title: "Test Task",
        description: "Test Description",
        status: "Open" as const,
        // No dueDate - will be compared as null
      };
      
      const existingTasks = [
        { 
          title: "test task",  // Different case  
          dueDate: undefined,  // Same as no dueDate
          status: "Open" 
        }
      ];

      mockSend.mockResolvedValueOnce({ Items: existingTasks }); // Duplicate check query

      await expect(createTask("test-user-id", testTask)).rejects.toThrow("A task with this name and due date already exists");
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
    it("should call reprioritizeTasks when position is changed", async () => {
      const updateData: Partial<Task & { position?: number }> = {
        position: 2,
      };
      const mockCurrentTask: Task = {
        TaskId: "task-1",
        UserId: "test-user-id",
        title: "Current Title",
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
      const mockReturnedTask: Task = {
        ...mockCurrentTask,
        priority: 2,
        modifiedDate: "2023-01-01T01:00:00.000Z",
      };
      
      mockSend
        .mockResolvedValueOnce({ Items: [] }) // QueryCommand for reprioritizeTasks
        .mockResolvedValueOnce({ Item: mockReturnedTask }); // GetCommand after reprioritization

      await updateTask("test-user-id", "task-1", updateData);

      // Should have called reprioritizeTasks (Query + Get)
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("should NOT auto-reprioritize when isMIT is changed (optimization)", async () => {
      const updateData: Partial<Task> = {
        isMIT: true,
      };
      const mockCurrentTask: Task = {
        TaskId: "task-1",
        UserId: "test-user-id",
        title: "Current Title",
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
      const mockReturnedTask: Task = {
        ...mockCurrentTask,
        isMIT: true,
        modifiedDate: "2023-01-01T01:00:00.000Z",
      };

      mockSend
        .mockResolvedValueOnce({ Item: mockCurrentTask }) // getTask call
        .mockResolvedValueOnce({ Attributes: mockReturnedTask }); // UpdateCommand
      // OPTIMIZED: No longer auto-reprioritizes on isMIT change

      const result = await updateTask("test-user-id", "task-1", updateData);

      expect(result?.isMIT).toBe(true);
      // Should only have 2 calls (getTask + update), no reprioritization
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("should update a task", async () => {
      const updateData: Partial<Task> = {
        title: "Updated Title",
        status: "Completed",
      };

      const mockCurrentTask: Task = {
        TaskId: "task-1",
        UserId: "test-user-id",
        title: "Original Title",
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

      const mockReturnedTask: Task = {
        ...mockCurrentTask,
        title: "Updated Title",
        status: "Completed",
        completedDate: "2023-01-01T01:00:00.000Z",
        modifiedDate: "2023-01-01T01:00:00.000Z",
      };

      mockSend
        .mockResolvedValueOnce({ Item: mockCurrentTask }) // getTask call
        .mockResolvedValueOnce({ Attributes: mockReturnedTask }) // UpdateCommand
        .mockResolvedValueOnce({}); // logTaskAuditEvent call

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

      const mockCurrentTask: Task = {
        TaskId: "task-1",
        UserId: "test-user-id",
        title: "Test Task",
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

      const mockReturnedTask: Task = {
        ...mockCurrentTask,
        status: "Open",
        completedDate: null,
        modifiedDate: "2023-01-01T01:00:00.000Z",
      };

      mockSend
        .mockResolvedValueOnce({ Item: mockCurrentTask }) // getTask call
        .mockResolvedValueOnce({ Attributes: mockReturnedTask }) // UpdateCommand
        .mockResolvedValueOnce({}); // logTaskAuditEvent call

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
      const mockTask: Task = {
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

      mockSend
        .mockResolvedValueOnce({ Item: mockTask }) // getTask call
        .mockResolvedValueOnce({}); // DeleteCommand

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

  // Dashboard API Operations Tests
  describe("getProductivityMetrics", () => {
    it("should calculate productivity metrics correctly", async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
      
      const mockTasks = [
        {
          TaskId: "task1",
          status: "Completed",
          isMIT: true,
          creationDate: recentDate,
          completedDate: recentDate
        },
        {
          TaskId: "task2",
          status: "Completed",
          isMIT: false,
          creationDate: recentDate,
          completedDate: recentDate
        },
        {
          TaskId: "task3",
          status: "Open",
          isMIT: true,
          creationDate: recentDate,
          completedDate: null
        },
        {
          TaskId: "task4",
          status: "Canceled",
          isMIT: false,
          creationDate: recentDate,
          completedDate: null
        }
      ];

      mockSend.mockResolvedValueOnce({ Items: mockTasks });

      const metrics = await getProductivityMetrics("test-user-id", 7);

      expect(metrics.completedTasks).toBe(2);
      expect(metrics.createdTasks).toBe(3); // Excludes canceled task
      expect(metrics.completedMITs).toBe(1);
      expect(metrics.createdMITs).toBe(2);
      expect(metrics.taskScore).toBeCloseTo(0.67, 2);
      expect(metrics.mitScore).toBe(0.5);
      expect(metrics.finalScore).toBe(60); // Math.round(0.67 * 0.6 + 0.5 * 0.4)
    });

    it("should handle empty task list", async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const metrics = await getProductivityMetrics("test-user-id", 7);

      expect(metrics.completedTasks).toBe(0);
      expect(metrics.createdTasks).toBe(0);
      expect(metrics.completedMITs).toBe(0);
      expect(metrics.createdMITs).toBe(0);
      expect(metrics.taskScore).toBe(0);
      expect(metrics.mitScore).toBe(0);
      expect(metrics.finalScore).toBe(0);
    });

    it("should handle database errors", async () => {
      mockSend.mockImplementation(() => {
        throw new Error("Database error");
      });

      await expect(getProductivityMetrics("test-user-id", 7))
        .rejects.toThrow("Could not fetch productivity metrics.");
    });
  });

  describe("getRecentActivity", () => {
    it("should return recent activity entries", async () => {
      const mockTasks = [
        {
          TaskId: "task1",
          title: "Completed Task",
          status: "Completed",
          completedDate: "2023-01-06T12:00:00.000Z",
          modifiedDate: "2023-01-06T12:00:00.000Z",
          isMIT: false
        },
        {
          TaskId: "task2",
          title: "MIT Task",
          status: "Open",
          completedDate: null,
          modifiedDate: "2023-01-06T11:00:00.000Z",
          isMIT: true
        },
        {
          TaskId: "task3",
          title: "Another Completed",
          status: "Completed",
          completedDate: "2023-01-06T10:00:00.000Z",
          modifiedDate: "2023-01-06T10:00:00.000Z",
          isMIT: true
        }
      ];

      mockSend.mockResolvedValueOnce({ Items: mockTasks });

      const activities = await getRecentActivity("test-user-id", 5);

      expect(activities).toHaveLength(4); // 2 completions + 2 priority changes
      expect(activities[0].type).toBe("completion");
      expect(activities[0].taskTitle).toBe("Completed Task");
      expect(activities.some(a => a.type === "priority_change")).toBe(true);
    });

    it("should handle empty task list", async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const activities = await getRecentActivity("test-user-id", 5);

      expect(activities).toHaveLength(0);
    });

    it("should handle database errors", async () => {
      mockSend.mockImplementation(() => {
        throw new Error("Database error");
      });

      await expect(getRecentActivity("test-user-id", 5))
        .rejects.toThrow("Could not fetch recent activity.");
    });
  });

  describe("getUpcomingTasks", () => {
    it("should return upcoming tasks sorted by urgency (overdue, today, future)", async () => {
      // Mock today's date as 2023-01-05
      const originalDateToString = Date.prototype.toISOString;
      Date.prototype.toISOString = jest.fn(() => "2023-01-05T10:00:00.000Z");

      const mockTasks = [
        {
          TaskId: "task1",
          title: "Due Future",
          description: "Task due in future",
          dueDate: "2023-01-10",
          status: "Open",
          isMIT: false,
          priority: 3,
          creationDate: "2023-01-01T00:00:00.000Z",
          modifiedDate: "2023-01-01T00:00:00.000Z"
        },
        {
          TaskId: "task2",
          title: "Due Today",
          description: "Task due today",
          dueDate: "2023-01-05",
          status: "Open",
          isMIT: true,
          priority: 2,
          creationDate: "2023-01-01T00:00:00.000Z",
          modifiedDate: "2023-01-01T00:00:00.000Z"
        },
        {
          TaskId: "task3",
          title: "Overdue Task",
          description: "Task that is overdue",
          dueDate: "2023-01-03",
          status: "Open",
          isMIT: false,
          priority: 1,
          creationDate: "2023-01-01T00:00:00.000Z",
          modifiedDate: "2023-01-01T00:00:00.000Z"
        },
        {
          TaskId: "task4",
          title: "Very Overdue",
          description: "Task that is very overdue",
          dueDate: "2023-01-01",
          status: "Open",
          isMIT: true,
          priority: 4,
          creationDate: "2023-01-01T00:00:00.000Z",
          modifiedDate: "2023-01-01T00:00:00.000Z"
        }
      ];

      mockSend.mockResolvedValueOnce({ Items: mockTasks });

      const upcomingTasks = await getUpcomingTasks("test-user-id", 7);

      expect(upcomingTasks).toHaveLength(4);
      // Should be sorted by urgency: most overdue first, then today, then future
      expect(upcomingTasks[0].title).toBe("Very Overdue"); // 2023-01-01 (most overdue)
      expect(upcomingTasks[1].title).toBe("Overdue Task"); // 2023-01-03 (overdue)
      expect(upcomingTasks[2].title).toBe("Due Today");    // 2023-01-05 (today)
      expect(upcomingTasks[3].title).toBe("Due Future");   // 2023-01-10 (future)

      // Restore original Date function
      Date.prototype.toISOString = originalDateToString;
    });

    it("should handle empty task list", async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const upcomingTasks = await getUpcomingTasks("test-user-id", 7);

      expect(upcomingTasks).toHaveLength(0);
    });

    it("should handle database errors", async () => {
      mockSend.mockImplementation(() => {
        throw new Error("Database error");
      });

      await expect(getUpcomingTasks("test-user-id", 7))
        .rejects.toThrow("Could not fetch upcoming tasks.");
    });
  });
}); 