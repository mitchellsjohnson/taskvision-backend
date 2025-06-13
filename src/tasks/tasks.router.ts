import express, { Request, Response } from "express";
import { validateAccessToken } from "../middleware/auth0.middleware";
import {
  createTask,
  getTasksForUser,
  updateTask,
  deleteTask,
} from "../db/task-operations";

export const tasksRouter = express.Router();

const getUserId = (req: Request): string => {
  return req.auth?.payload.sub || "";
};

// GET /api/tasks
tasksRouter.get("/", validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { status, tags, search } = req.query;

    const filters: any = {};
    if (status) filters.status = (status as string).split(",");
    if (tags) filters.tags = (tags as string).split(",");
    if (search) filters.search = search as string;

    const tasks = await getTasksForUser(userId, filters);
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
    const { title, description, dueDate, status } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!status || !["Open", "Completed", "Canceled", "Waiting"].includes(status)) {
      return res.status(400).json({ message: "Status must be Open, Completed, or Canceled" });
    }

    const newTask = await createTask(userId, { title, description, dueDate, status });
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
    const taskData = req.body;

    if (taskData.status && !["Open", "Completed", "Canceled", "Waiting"].includes(taskData.status)) {
      return res.status(400).json({ message: "Status must be Open, Completed, or Canceled" });
    }

    const updatedTask = await updateTask(userId, taskId, taskData);

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