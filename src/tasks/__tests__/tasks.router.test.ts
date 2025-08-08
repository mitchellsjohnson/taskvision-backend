import request from "supertest";
import { app } from "../../index";
import * as TaskOperations from "../../db/task-operations";
import { Request, Response, NextFunction } from "express";

// Mock the checkJwt middleware
jest.mock("express-oauth2-jwt-bearer", () => ({
  auth: jest.fn(() => (req: Request, res: Response, next: NextFunction) => {
    // Manually attach the auth object for testing
    // @ts-ignore
    req.auth = { payload: { sub: "test-user-id" } };
    next();
  }),
}));

// Mock the task operations module
jest.mock("../../db/task-operations");

const mockedTaskOperations = TaskOperations as jest.Mocked<
  typeof TaskOperations
>;

describe("Tasks API", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/tasks", () => {
    it("should return an array of tasks and a 200 status code", async () => {
      const mockTasks = [
        {
          TaskId: "1",
          title: "Test Task",
          description: "A description",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          PK: "USER#test-user-id",
          SK: "TASK#1",
          GSI1PK: "USER#test-user-id",
          GSI1SK: "TASK#1",
          EntityType: "Task",
          UserId: "test-user-id",
        },
      ];
      mockedTaskOperations.getTasksForUser.mockResolvedValue(mockTasks as any);

      const res = await request(app).get("/api/tasks");

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(mockTasks);
      expect(mockedTaskOperations.getTasksForUser).toHaveBeenCalledWith(
        "dev-user-id",
        {}
      );
    });
  });

  describe("POST /api/tasks", () => {
    it("should create a new task and return it with a 201 status code", async () => {
      const newTaskData = { 
        title: "New Task", 
        description: "A description",
        status: "Open" as const
      };
      const createdTask = {
        TaskId: "2",
        ...newTaskData,
        creationDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        completedDate: null,
        PK: "USER#test-user-id",
        SK: "TASK#2",
        GSI1PK: "USER#test-user-id",
        GSI1SK: "TASK#2",
        EntityType: "Task",
        UserId: "test-user-id",
      };
      mockedTaskOperations.createTask.mockResolvedValue(createdTask as any);

      const res = await request(app).post("/api/tasks").send(newTaskData);

      expect(res.statusCode).toEqual(201);
      expect(res.body).toEqual(createdTask);
      expect(mockedTaskOperations.createTask).toHaveBeenCalledWith(
        "dev-user-id",
        newTaskData
      );
    });

    it("should return a 400 status code if title is missing", async () => {
      const res = await request(app).post("/api/tasks").send({ 
        description: "No title",
        status: "Open" as const
      });
      expect(res.statusCode).toEqual(400);
    });

    it("should return a 400 status code if status is missing", async () => {
      const res = await request(app).post("/api/tasks").send({ 
        title: "No status",
        description: "A description"
      });
      expect(res.statusCode).toEqual(400);
    });

    it("should return a 400 status code if status is invalid", async () => {
      const res = await request(app).post("/api/tasks").send({ 
        title: "Invalid status",
        description: "A description",
        status: "Invalid" as any
      });
      expect(res.statusCode).toEqual(400);
    });
  });

  describe("PUT /api/tasks/:taskId", () => {
    it("should update a task and return it with a 200 status code", async () => {
      const taskId = "1";
      const updateData = { 
        title: "Updated Title",
        status: "Completed" as const
      };
      const updatedTask = {
        TaskId: taskId,
        ...updateData,
        description: "A description",
        creationDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        completedDate: new Date().toISOString(),
        PK: "USER#test-user-id",
        SK: "TASK#1",
        GSI1PK: "USER#test-user-id",
        GSI1SK: "TASK#1",
        EntityType: "Task",
        UserId: "test-user-id",
      };
      mockedTaskOperations.updateTask.mockResolvedValue(updatedTask as any);

      const res = await request(app).put(`/api/tasks/${taskId}`).send(updateData);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(updatedTask);
      expect(mockedTaskOperations.updateTask).toHaveBeenCalledWith("dev-user-id", taskId, updateData);
    });

    it("should return a 400 status code if status is invalid", async () => {
      const taskId = "1";
      const res = await request(app).put(`/api/tasks/${taskId}`).send({ 
        status: "Invalid" as any
      });
      expect(res.statusCode).toEqual(400);
    });
  });

  describe("DELETE /api/tasks/:taskId", () => {
    it("should delete a task and return a 204 status code", async () => {
        const taskId = "1";
        mockedTaskOperations.deleteTask.mockResolvedValue({ success: true, message: "Task deleted" });

        const res = await request(app).delete(`/api/tasks/${taskId}`);

        expect(res.statusCode).toEqual(204);
        expect(mockedTaskOperations.deleteTask).toHaveBeenCalledWith("dev-user-id", taskId);
    });
  });

  // Dashboard API Endpoints Tests
  describe("GET /api/tasks/metrics", () => {
    it("should return productivity metrics with a 200 status code", async () => {
      const mockMetrics = {
        completedTasks: 5,
        createdTasks: 10,
        completedMITs: 2,
        createdMITs: 3,
        taskScore: 0.5,
        mitScore: 0.67,
        finalScore: 57
      };
      mockedTaskOperations.getProductivityMetrics.mockResolvedValue(mockMetrics);

      const res = await request(app).get("/api/tasks/metrics");

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(mockMetrics);
      expect(mockedTaskOperations.getProductivityMetrics).toHaveBeenCalledWith("dev-user-id", 7);
    });

    it("should accept custom days parameter", async () => {
      const mockMetrics = {
        completedTasks: 3,
        createdTasks: 6,
        completedMITs: 1,
        createdMITs: 2,
        taskScore: 0.5,
        mitScore: 0.5,
        finalScore: 50
      };
      mockedTaskOperations.getProductivityMetrics.mockResolvedValue(mockMetrics);

      const res = await request(app).get("/api/tasks/metrics?days=30");

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(mockMetrics);
      expect(mockedTaskOperations.getProductivityMetrics).toHaveBeenCalledWith("dev-user-id", 30);
    });

    it("should return 400 for invalid days parameter", async () => {
      const res = await request(app).get("/api/tasks/metrics?days=0");
      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toContain("Days parameter must be between 1 and 365");
    });

    it("should return 400 for days parameter too large", async () => {
      const res = await request(app).get("/api/tasks/metrics?days=400");
      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toContain("Days parameter must be between 1 and 365");
    });

    it("should handle errors from getProductivityMetrics", async () => {
      mockedTaskOperations.getProductivityMetrics.mockRejectedValue(new Error("Database error"));

      const res = await request(app).get("/api/tasks/metrics");

      expect(res.statusCode).toEqual(500);
      expect(res.body.message).toEqual("Error fetching productivity metrics");
    });
  });

  describe("GET /api/tasks/activity", () => {
    it("should return recent activity with a 200 status code", async () => {
      const mockActivity = [
        {
          id: "completion_task1",
          type: "completion" as const,
          taskId: "task1",
          taskTitle: "Complete project",
          timestamp: "2023-01-01T12:00:00.000Z",
          details: {}
        },
        {
          id: "priority_task2",
          type: "priority_change" as const,
          taskId: "task2",
          taskTitle: "Review code",
          timestamp: "2023-01-01T11:00:00.000Z",
          details: { newValue: "MIT" }
        }
      ];
      mockedTaskOperations.getRecentActivity.mockResolvedValue(mockActivity);

      const res = await request(app).get("/api/tasks/activity");

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(mockActivity);
      expect(mockedTaskOperations.getRecentActivity).toHaveBeenCalledWith("dev-user-id", 5);
    });

    it("should accept custom limit parameter", async () => {
      const mockActivity = [
        {
          id: "completion_task1",
          type: "completion" as const,
          taskId: "task1",
          taskTitle: "Complete project",
          timestamp: "2023-01-01T12:00:00.000Z",
          details: {}
        }
      ];
      mockedTaskOperations.getRecentActivity.mockResolvedValue(mockActivity);

      const res = await request(app).get("/api/tasks/activity?limit=10");

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(mockActivity);
      expect(mockedTaskOperations.getRecentActivity).toHaveBeenCalledWith("dev-user-id", 10);
    });

    it("should return 400 for invalid limit parameter", async () => {
      const res = await request(app).get("/api/tasks/activity?limit=0");
      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toContain("Limit parameter must be between 1 and 50");
    });

    it("should return 400 for limit parameter too large", async () => {
      const res = await request(app).get("/api/tasks/activity?limit=100");
      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toContain("Limit parameter must be between 1 and 50");
    });

    it("should handle errors from getRecentActivity", async () => {
      mockedTaskOperations.getRecentActivity.mockRejectedValue(new Error("Database error"));

      const res = await request(app).get("/api/tasks/activity");

      expect(res.statusCode).toEqual(500);
      expect(res.body.message).toEqual("Error fetching recent activity");
    });
  });

  describe("GET /api/tasks/upcoming", () => {
    it("should return upcoming tasks with a 200 status code", async () => {
      const mockUpcomingTasks = [
        {
          TaskId: "task1",
          title: "Due tomorrow",
          description: "Important task",
          dueDate: "2023-01-02",
          status: "Open",
          isMIT: true,
          priority: 1,
          creationDate: "2023-01-01T00:00:00.000Z",
          modifiedDate: "2023-01-01T00:00:00.000Z"
        },
        {
          TaskId: "task2",
          title: "Due next week",
          description: "Regular task",
          dueDate: "2023-01-07",
          status: "Open",
          isMIT: false,
          priority: 2,
          creationDate: "2023-01-01T00:00:00.000Z",
          modifiedDate: "2023-01-01T00:00:00.000Z"
        }
      ];
      mockedTaskOperations.getUpcomingTasks.mockResolvedValue(mockUpcomingTasks as any);

      const res = await request(app).get("/api/tasks/upcoming");

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(mockUpcomingTasks);
      expect(mockedTaskOperations.getUpcomingTasks).toHaveBeenCalledWith("dev-user-id", 7);
    });

    it("should accept custom days parameter", async () => {
      const mockUpcomingTasks = [
        {
          TaskId: "task1",
          title: "Due this month",
          description: "Monthly task",
          dueDate: "2023-01-15",
          status: "Open",
          isMIT: false,
          priority: 1,
          creationDate: "2023-01-01T00:00:00.000Z",
          modifiedDate: "2023-01-01T00:00:00.000Z"
        }
      ];
      mockedTaskOperations.getUpcomingTasks.mockResolvedValue(mockUpcomingTasks as any);

      const res = await request(app).get("/api/tasks/upcoming?days=30");

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual(mockUpcomingTasks);
      expect(mockedTaskOperations.getUpcomingTasks).toHaveBeenCalledWith("dev-user-id", 30);
    });

    it("should return 400 for invalid days parameter", async () => {
      const res = await request(app).get("/api/tasks/upcoming?days=0");
      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toContain("Days parameter must be between 1 and 365");
    });

    it("should return 400 for days parameter too large", async () => {
      const res = await request(app).get("/api/tasks/upcoming?days=400");
      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toContain("Days parameter must be between 1 and 365");
    });

    it("should handle errors from getUpcomingTasks", async () => {
      mockedTaskOperations.getUpcomingTasks.mockRejectedValue(new Error("Database error"));

      const res = await request(app).get("/api/tasks/upcoming");

      expect(res.statusCode).toEqual(500);
      expect(res.body.message).toEqual("Error fetching upcoming tasks");
    });
  });
}); 