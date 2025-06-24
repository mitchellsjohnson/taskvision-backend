import express, { Request, Response } from "express";
import { validateAccessToken } from "../middleware/auth0.middleware";
import { TVAgentService } from "./tvagent.service";
import { getUserId } from "../middleware/get-user-id";

export const tvagentRouter = express.Router();

// POST /api/tvagent
tvagentRouter.post("/", validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ 
        error: "Message is required and must be a string" 
      });
    }

    const tvAgentService = new TVAgentService();
    const result = await tvAgentService.processUserMessage(userId, message);

    return res.status(200).json(result);
  } catch (error) {
    console.error("TVAgent error:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// GET /api/tvagent/conversation
tvagentRouter.get("/conversation", validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const tvAgentService = new TVAgentService();
    const conversation = tvAgentService.getConversationForUser(userId);

    return res.status(200).json({ conversation });
  } catch (error) {
    console.error("TVAgent conversation history error:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});