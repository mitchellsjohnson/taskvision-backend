import express, { Request, Response } from "express";
import { validateAccessToken } from "../middleware/auth0.middleware";
import {
  createTask,
  getTasksForUser,
  updateTask,
  deleteTask,
} from "../db/task-operations";

export const tasksRouter = express.Router();

// Helper to get user ID from the request
const getUserId = (req: Request) => {
  if (process.env.DISABLE_AUTH === 'true') {
    // When auth is disabled, return a mock user ID for testing
    return 'auth0|MOCK_USER_ID';
  }
  // The 'sub' property on req.auth.payload is the user ID from the JWT
  if (req.auth && req.auth.payload && req.auth.payload.sub) {
    return req.auth.payload.sub;
  }
  throw new Error("User ID not found in request");
};

// GET /api/tasks
tasksRouter.get("/", validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const tasks = await getTasksForUser(userId);
    res.status(200).json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching tasks" });
  }
});

// POST /api/tasks
tasksRouter.post("/", validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { title, description } = req.body;
    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }
    const newTask = await createTask(userId, { title, description });
    res.status(201).json(newTask);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creating task" });
  }
});

// PUT /api/tasks/:taskId
tasksRouter.put("/:taskId", validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { taskId } = req.params;
    const { title, description } = req.body;
    const updatedTask = await updateTask(userId, taskId, { title, description });
    if (!updatedTask) {
      return res.status(404).json({ message: "Task not found" });
    }
    res.status(200).json(updatedTask);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating task" });
  }
});

// DELETE /api/tasks/:taskId
tasksRouter.delete("/:taskId", validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { taskId } = req.params;
    const success = await deleteTask(userId, taskId);
    if (!success) {
      return res.status(404).json({ message: "Task not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting task" });
  }
}); 