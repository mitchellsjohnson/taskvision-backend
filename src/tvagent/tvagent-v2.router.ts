import express, { Request, Response } from 'express';
import { TVAgentV2Service } from './tvagent-v2.service';
import { getUserId } from '../middleware/get-user-id';
import { validateAccessToken } from '../middleware/auth0.middleware';

const router = express.Router();

// Initialize service with error handling
let tvAgentV2Service: TVAgentV2Service | null = null;
try {
  tvAgentV2Service = new TVAgentV2Service();
  console.log('TVAgent V2 Service initialized');
} catch (error) {
  console.error('❌ TVAgent V2 Service initialization failed:', error instanceof Error ? error.message : error);
}

// Middleware to check if service is available
const checkServiceAvailable = (req: Request, res: Response, next: any) => {
  if (!tvAgentV2Service) {
    return res.status(503).json({
      success: false,
      message: 'TVAgent V2 service is not available. Please check OpenAI configuration.'
    });
  }
  next();
};

/**
 * POST /api/tvagent/v2/message
 * Send a message to TVAgent using ChatGPT Assistants API
 */
router.post('/message', validateAccessToken, checkServiceAvailable, async (req: Request, res: Response) => {
  try {
    const { message, threadId } = req.body;
    const userId = getUserId(req);

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Message is required and must be a string'
      });
    }

    const result = await tvAgentV2Service!.sendMessage(userId, message, threadId);

    res.json(result);
  } catch (error) {
    console.error('TVAgent V2 message error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/tvagent/v2/threads
 * Get conversation threads for the authenticated user
 */
router.get('/threads', validateAccessToken, checkServiceAvailable, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    const threads = await tvAgentV2Service!.getConversationThreads(userId, limit);

    res.json({
      success: true,
      data: threads
    });
  } catch (error) {
    console.error('Get threads error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/tvagent/v2/threads/:threadId/messages
 * Get messages for a specific thread
 */
router.get('/threads/:threadId/messages', validateAccessToken, checkServiceAvailable, async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    if (!threadId) {
      return res.status(400).json({
        success: false,
        message: 'Thread ID is required'
      });
    }

    const messages = await tvAgentV2Service!.getThreadMessages(threadId, limit);

    res.json({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error('Get thread messages error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/tvagent/v2/threads
 * Create a new conversation thread
 */
router.post('/threads', validateAccessToken, checkServiceAvailable, async (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    const userId = getUserId(req);

    const thread = await tvAgentV2Service!.createNewThread(userId, title);

    res.json({
      success: true,
      data: thread
    });
  } catch (error) {
    console.error('Create thread error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * PUT /api/tvagent/v2/threads/:threadId/switch
 * Switch to an existing thread (make it active)
 */
router.put('/threads/:threadId/switch', validateAccessToken, checkServiceAvailable, async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const userId = getUserId(req);

    if (!threadId) {
      return res.status(400).json({
        success: false,
        message: 'Thread ID is required'
      });
    }

    const thread = await tvAgentV2Service!.switchToThread(userId, threadId);

    res.json({
      success: true,
      data: thread
    });
  } catch (error) {
    console.error('Switch thread error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/tvagent/v2/active-thread
 * Get the current active thread for the user
 */
router.get('/active-thread', validateAccessToken, checkServiceAvailable, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    const thread = await tvAgentV2Service!.getActiveThread(userId);

    res.json({
      success: true,
      data: thread
    });
  } catch (error) {
    console.error('Get active thread error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * DELETE /api/tvagent/v2/threads/:threadId
 * Delete a conversation thread and all its messages
 */
router.delete('/threads/:threadId', validateAccessToken, checkServiceAvailable, async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const userId = getUserId(req);

    if (!threadId) {
      return res.status(400).json({
        success: false,
        message: 'Thread ID is required'
      });
    }

    await tvAgentV2Service!.deleteThread(userId, threadId);

    res.json({
      success: true,
      message: 'Thread deleted successfully'
    });
  } catch (error) {
    console.error('Delete thread error:', error);
    
    if (error instanceof Error && error.message === 'Thread not found') {
      return res.status(404).json({
        success: false,
        message: 'Thread not found'
      });
    }

    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * PUT /api/tvagent/v2/threads/:threadId/title
 * Update the title of a conversation thread
 */
router.put('/threads/:threadId/title', validateAccessToken, checkServiceAvailable, async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const { title } = req.body;
    const userId = getUserId(req);

    if (!threadId) {
      return res.status(400).json({
        success: false,
        message: 'Thread ID is required'
      });
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Title is required and must be a non-empty string'
      });
    }

    const thread = await tvAgentV2Service!.updateThreadTitle(userId, threadId, title.trim());

    res.json({
      success: true,
      data: thread
    });
  } catch (error) {
    console.error('Update thread title error:', error);
    
    if (error instanceof Error && error.message === 'Thread not found') {
      return res.status(404).json({
        success: false,
        message: 'Thread not found'
      });
    }

    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router; 