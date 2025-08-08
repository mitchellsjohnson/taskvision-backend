import express, { Request, Response } from "express";
import { validateAccessToken } from "../middleware/auth0.middleware";
import {
  createTask,
  updateTask,
  deleteTask,
  getTasksForUser,
  getProductivityMetrics,
  getRecentActivity,
  getUpcomingTasks,
} from "../db/task-operations";
import { Task } from '../types';

const getUserId = (req: Request): string => {
  return req.auth?.payload.sub || "";
};

export const tasksRouter = express.Router();

// GET /api/tasks
tasksRouter.get("/", validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { status, tags, search, dateFilter, startDate, endDate, noDueDate } = req.query;

    const filters: any = {};
    if (status) filters.status = (status as string).split(",");
    if (tags) filters.tags = (tags as string).split(",");
    if (search) filters.search = search as string;
    if (dateFilter) filters.dateFilter = dateFilter as string;
    if (startDate) filters.startDate = startDate as string;
    if (endDate) filters.endDate = endDate as string;
    if (noDueDate) filters.noDueDate = noDueDate === 'true';

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
    const { title, description, dueDate, status, isMIT, priority, tags } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!status || !["Open", "Completed", "Canceled", "Waiting"].includes(status)) {
      return res.status(400).json({ message: "Status must be Open, Completed, or Canceled" });
    }

    const taskData: any = { title, description, dueDate, status };
    
    // Add optional fields if provided
    if (isMIT !== undefined) taskData.isMIT = isMIT;
    if (priority !== undefined) taskData.priority = priority;
    if (tags !== undefined) taskData.tags = tags;

    const newTask = await createTask(userId, taskData);
    res.status(201).json(newTask);
  } catch (error: any) {
    console.error(error);
    if (error.validationErrors) {
      return res.status(400).json({ 
        message: "Validation failed", 
        errors: error.validationErrors 
      });
    }
    res.status(500).json({ message: "Error creating task" });
  }
});

// PUT /api/tasks/:taskId
tasksRouter.put("/:taskId", validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { taskId } = req.params;
    const {
      title, description, dueDate, status, isMIT, 
      priority, tags, completedDate
    } = req.body;

    const updateData: Partial<Task> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (dueDate !== undefined) updateData.dueDate = dueDate;
    if (status !== undefined) {
      if (!["Open", "InProgress", "Completed", "Waiting", "Canceled"].includes(status)) {
        return res.status(400).json({ message: "Status must be one of: Open, InProgress, Completed, Waiting, Canceled" });
      }
      updateData.status = status;
    }
    if (isMIT !== undefined) updateData.isMIT = isMIT;
    if (priority !== undefined) updateData.priority = priority;
    if (tags !== undefined) updateData.tags = tags;
    if (completedDate !== undefined) updateData.completedDate = completedDate;

    const updatedTask = await updateTask(userId, taskId, updateData);

    if (!updatedTask) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.status(200).json(updatedTask);
  } catch (error: any) {
    console.error(error);
    if (error.validationErrors) {
      return res.status(400).json({ 
        message: "Validation failed", 
        errors: error.validationErrors 
      });
    }
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

// Dashboard API Endpoints

// GET /api/tasks/metrics
tasksRouter.get("/metrics", validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const daysParam = req.query.days as string;
    const days = daysParam ? parseInt(daysParam) : 7;
    
    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({ message: "Days parameter must be between 1 and 365" });
    }

    const metrics = await getProductivityMetrics(userId, days);
    res.status(200).json(metrics);
  } catch (error) {
    console.error("Error fetching productivity metrics:", error);
    res.status(500).json({ message: "Error fetching productivity metrics" });
  }
});

// GET /api/tasks/activity
tasksRouter.get("/activity", validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const limitParam = req.query.limit as string;
    const limit = limitParam ? parseInt(limitParam) : 5;
    
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ message: "Limit parameter must be between 1 and 50" });
    }

    const activities = await getRecentActivity(userId, limit);
    res.status(200).json(activities);
  } catch (error) {
    console.error("Error fetching recent activity:", error);
    res.status(500).json({ message: "Error fetching recent activity" });
  }
});

// GET /api/tasks/upcoming
tasksRouter.get("/upcoming", validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const daysParam = req.query.days as string;
    const days = daysParam ? parseInt(daysParam) : 7;
    
    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({ message: "Days parameter must be between 1 and 365" });
    }

    const upcomingTasks = await getUpcomingTasks(userId, days);
    res.status(200).json(upcomingTasks);
  } catch (error) {
    console.error("Error fetching upcoming tasks:", error);
    res.status(500).json({ message: "Error fetching upcoming tasks" });
  }
}); 