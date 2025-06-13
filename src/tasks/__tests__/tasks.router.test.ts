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
        "test-user-id",
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
        "test-user-id",
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
      expect(mockedTaskOperations.updateTask).toHaveBeenCalledWith("test-user-id", taskId, updateData);
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
        expect(mockedTaskOperations.deleteTask).toHaveBeenCalledWith("test-user-id", taskId);
    });
  });
}); 