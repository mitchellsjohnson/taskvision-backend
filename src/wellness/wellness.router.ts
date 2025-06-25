import { Router, Request, Response } from 'express';
import { validateAccessToken } from '../middleware/auth0.middleware';
import { getUserId } from '../middleware/get-user-id';
import {
  createPracticeInstance,
  getPracticeInstances,
  updatePracticeInstance,
  deletePracticeInstance,
  getWeeklyScores,
  getUserWellnessSettings,
  updateUserWellnessSettings,
  getWeekStart,
} from './wellness-operations';
import { WellnessPractice, UserWellnessSettings } from '../types';
import dynamoClient from '../db/dynamo';

const router = Router();

/**
 * GET /api/wellness/practices
 * Get practice instances for a date range
 * Query params: startDate, endDate (YYYY-MM-DD format)
 */
router.get('/practices', validateAccessToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate query parameters are required (YYYY-MM-DD format)',
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate as string) || !dateRegex.test(endDate as string)) {
      return res.status(400).json({
        success: false,
        message: 'Dates must be in YYYY-MM-DD format',
      });
    }

    const practices = await getPracticeInstances(userId, startDate as string, endDate as string);

    res.json({
      success: true,
      data: practices,
    });
  } catch (error) {
    console.error('Error fetching practice instances:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * POST /api/wellness/practices
 * Create a new practice instance
 */
router.post('/practices', validateAccessToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { date, practice, linkedTaskId } = req.body;

    if (!date || !practice) {
      return res.status(400).json({
        success: false,
        message: 'date and practice are required',
      });
    }

    // Validate practice type
    const validPractices: WellnessPractice[] = [
      'Gratitude',
      'Meditation',
      'Kindness',
      'Social Outreach',
      'Novelty Challenge',
      'Savoring Reflection',
    ];

    if (!validPractices.includes(practice)) {
      return res.status(400).json({
        success: false,
        message: `Invalid practice. Must be one of: ${validPractices.join(', ')}`,
      });
    }

    const practiceInstance = await createPracticeInstance(userId, {
      date,
      practice,
      linkedTaskId,
    });

    res.status(201).json({
      success: true,
      data: practiceInstance,
    });
  } catch (error: any) {
    console.error('Error creating practice instance:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('Date must be')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * PUT /api/wellness/practices/:date/:practice
 * Update a practice instance
 */
router.put('/practices/:date/:practice', validateAccessToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { date, practice } = req.params;
    const { completed, linkedTaskId } = req.body;

    // Validate practice type
    const validPractices: WellnessPractice[] = [
      'Gratitude',
      'Meditation',
      'Kindness',
      'Social Outreach',
      'Novelty Challenge',
      'Savoring Reflection',
    ];

    if (!validPractices.includes(practice as WellnessPractice)) {
      return res.status(400).json({
        success: false,
        message: `Invalid practice. Must be one of: ${validPractices.join(', ')}`,
      });
    }

    // Validate that at least one field is being updated
    if (completed === undefined && linkedTaskId === undefined) {
      return res.status(400).json({
        success: false,
        message: 'At least one field (completed, linkedTaskId) must be provided',
      });
    }

    const updatedPractice = await updatePracticeInstance(
      userId,
      date,
      practice as WellnessPractice,
      { completed, linkedTaskId }
    );

    res.json({
      success: true,
      data: updatedPractice,
    });
  } catch (error) {
    console.error('Error updating practice instance:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * DELETE /api/wellness/practices/:date/:practice
 * Delete a practice instance
 */
router.delete('/practices/:date/:practice', validateAccessToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { date, practice } = req.params;

    // Validate practice type
    const validPractices: WellnessPractice[] = [
      'Gratitude',
      'Meditation',
      'Kindness',
      'Social Outreach',
      'Novelty Challenge',
      'Savoring Reflection',
    ];

    if (!validPractices.includes(practice as WellnessPractice)) {
      return res.status(400).json({
        success: false,
        message: `Invalid practice. Must be one of: ${validPractices.join(', ')}`,
      });
    }

    await deletePracticeInstance(userId, date, practice as WellnessPractice);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting practice instance:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * GET /api/wellness/scores
 * Get weekly wellness scores
 * Query params: weeks (optional, defaults to 12)
 */
router.get('/scores', validateAccessToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const weeks = parseInt(req.query.weeks as string) || 12;

    if (weeks < 1 || weeks > 52) {
      return res.status(400).json({
        success: false,
        message: 'weeks parameter must be between 1 and 52',
      });
    }

    const scores = await getWeeklyScores(userId, weeks, "America/New_York");

    res.json({
      success: true,
      data: scores,
    });
  } catch (error) {
    console.error('Error fetching weekly scores:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * GET /api/wellness/status
 * Get wellness status for current week (for AI agent)
 */
router.get('/status', validateAccessToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const today = new Date();
    const weekStart = getWeekStart(today, "America/New_York");
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    // Get current week's practices
    const practices = await getPracticeInstances(userId, weekStart, weekEndStr);
    
    // Get current week's score
    const scores = await getWeeklyScores(userId, 1, "America/New_York");
    const currentScore = scores.find(s => s.weekStart === weekStart);

    // Calculate completion status by practice
    const practiceStatus: Record<WellnessPractice, { completed: number; target: number }> = {
      'Gratitude': { completed: 0, target: 7 },
      'Meditation': { completed: 0, target: 7 },
      'Kindness': { completed: 0, target: 2 },
      'Social Outreach': { completed: 0, target: 2 },
      'Novelty Challenge': { completed: 0, target: 2 },
      'Savoring Reflection': { completed: 0, target: 7 },
    };

    practices.forEach(practice => {
      if (practice.completed) {
        practiceStatus[practice.practice].completed++;
      }
    });

    // Find incomplete practices
    const incompletePractices: WellnessPractice[] = [];
    Object.entries(practiceStatus).forEach(([practice, status]) => {
      if (status.completed < status.target) {
        incompletePractices.push(practice as WellnessPractice);
      }
    });

    res.json({
      success: true,
      data: {
        weekStart,
        currentScore: currentScore?.score || 0,
        practiceStatus,
        incompletePractices,
        totalPractices: practices.length,
        completedPractices: practices.filter(p => p.completed).length,
      },
    });
  } catch (error) {
    console.error('Error fetching wellness status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * GET /api/wellness/settings
 * Get user wellness settings
 */
router.get('/settings', validateAccessToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const settings = await getUserWellnessSettings(userId);

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error fetching wellness settings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * PUT /api/wellness/settings
 * Update user wellness settings
 */
router.put('/settings', validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    const { enabledPractices, weeklyGoals } = req.body;
    
    // Validate input
    if (enabledPractices && !Array.isArray(enabledPractices)) {
      return res.status(400).json({ error: 'enabledPractices must be an array' });
    }

    if (weeklyGoals && typeof weeklyGoals !== 'object') {
      return res.status(400).json({ error: 'weeklyGoals must be an object' });
    }

    const updates: Partial<UserWellnessSettings> = {};
    if (enabledPractices !== undefined) updates.enabledPractices = enabledPractices;
    if (weeklyGoals !== undefined) updates.weeklyGoals = weeklyGoals;

    const result = await updateUserWellnessSettings(userId, updates);
    res.json(result);
  } catch (error) {
    console.error('Error updating wellness settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/wellness/all-data
 * Delete all wellness data for the user (practices, scores, settings)
 */
router.delete('/all-data', validateAccessToken, async (req, res) => {
  try {
    const userId = getUserId(req);

    // Delete all practice instances
    const deleteParams = {
      TableName: 'TaskVision',
      FilterExpression: 'begins_with(PK, :userPrefix) AND begins_with(SK, :practicePrefix)',
      ExpressionAttributeValues: {
        ':userPrefix': `USER#${userId}`,
        ':practicePrefix': 'PRACTICE#'
      }
    };

    const { ScanCommand, BatchWriteCommand, DeleteCommand } = await import("@aws-sdk/lib-dynamodb");
    
    const practiceInstances = await dynamoClient.send(new ScanCommand(deleteParams));
    
    // Batch delete practice instances
    if (practiceInstances.Items && practiceInstances.Items.length > 0) {
      const deleteRequests = practiceInstances.Items.map((item: any) => ({
        DeleteRequest: {
          Key: {
            PK: item.PK,
            SK: item.SK
          }
        }
      }));

      // Process in batches of 25 (DynamoDB limit)
      for (let i = 0; i < deleteRequests.length; i += 25) {
        const batch = deleteRequests.slice(i, i + 25);
        await dynamoClient.send(new BatchWriteCommand({
          RequestItems: {
            TaskVision: batch
          }
        }));
      }
    }

    // Delete all weekly scores
    const scoreParams = {
      TableName: 'TaskVision',
      FilterExpression: 'begins_with(PK, :userPrefix) AND begins_with(SK, :scorePrefix)',
      ExpressionAttributeValues: {
        ':userPrefix': `USER#${userId}`,
        ':scorePrefix': 'SCORE#'
      }
    };

    const weeklyScores = await dynamoClient.send(new ScanCommand(scoreParams));
    
    if (weeklyScores.Items && weeklyScores.Items.length > 0) {
      const deleteRequests = weeklyScores.Items.map((item: any) => ({
        DeleteRequest: {
          Key: {
            PK: item.PK,
            SK: item.SK
          }
        }
      }));

      // Process in batches of 25
      for (let i = 0; i < deleteRequests.length; i += 25) {
        const batch = deleteRequests.slice(i, i + 25);
        await dynamoClient.send(new BatchWriteCommand({
          RequestItems: {
            TaskVision: batch
          }
        }));
      }
    }

    // Delete wellness settings
    try {
      await dynamoClient.send(new DeleteCommand({
        TableName: 'TaskVision',
        Key: {
          PK: `USER#${userId}`,
          SK: 'WELLNESS_SETTINGS'
        }
      }));
    } catch (error) {
      // Settings might not exist, that's okay
    }

    res.json({
      success: true,
      message: 'All wellness data deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting all wellness data:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router; 