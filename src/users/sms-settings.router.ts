/**
 * SMS Settings Router
 *
 * REST API endpoints for SMS configuration management.
 */

import { Request, Response, Router } from 'express';
import { validateAccessToken } from '../middleware/auth0.middleware';
import { getUserId } from '../middleware/get-user-id';
import {
  getSmsConfig,
  initializeSmsConfig,
  sendVerificationCode,
  verifyPhoneNumber,
  regenerateSmsKey,
  updateSmsNotifications,
  updatePreferredTime,
  disableSms,
} from './sms-settings.operations';

const router = Router();

/**
 * GET /api/user/sms-settings
 * Get SMS configuration for the authenticated user
 */
router.get('/sms-settings', validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const smsConfig = await getSmsConfig(userId);

    res.json({
      success: true,
      data: smsConfig,
    });
  } catch (error) {
    console.error('Error fetching SMS settings:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/user/sms-settings
 * Initialize SMS configuration with phone number
 *
 * Body: { phoneNumber: string }
 */
router.post('/sms-settings', validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { phoneNumber } = req.body;

    // Validation
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required',
      });
    }

    // Validate E.164 format
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Phone number must be in E.164 format (e.g., +15551234567)',
      });
    }

    const smsConfig = await initializeSmsConfig(userId, phoneNumber);

    res.status(201).json({
      success: true,
      data: smsConfig,
      message: 'SMS configuration created. Please verify your phone number.',
    });
  } catch (error) {
    console.error('Error initializing SMS settings:', error);

    if (error instanceof Error && error.message.includes('E.164')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/user/sms-settings/send-verification
 * Send verification code to phone number
 */
router.post(
  '/sms-settings/send-verification',
  validateAccessToken,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);

      // Get current SMS config
      const smsConfig = await getSmsConfig(userId);

      if (!smsConfig || !smsConfig.phoneNumber) {
        return res.status(400).json({
          success: false,
          error: 'SMS configuration not found. Please set up your phone number first.',
        });
      }

      // Check if already verified
      if (smsConfig.verified) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is already verified',
        });
      }

      // Rate limiting: Allow verification code every 60 seconds
      if (smsConfig.verificationCodeSentAt) {
        const lastSent = new Date(smsConfig.verificationCodeSentAt);
        const now = new Date();
        const secondsSinceLastSent = (now.getTime() - lastSent.getTime()) / 1000;

        if (secondsSinceLastSent < 60) {
          return res.status(429).json({
            success: false,
            error: 'Please wait 60 seconds before requesting another code',
            retryAfter: Math.ceil(60 - secondsSinceLastSent),
          });
        }
      }

      await sendVerificationCode(userId, smsConfig.phoneNumber);

      res.json({
        success: true,
        message: 'Verification code sent',
      });
    } catch (error) {
      console.error('Error sending verification code:', error);

      if (error instanceof Error && error.message.includes('EUM')) {
        return res.status(503).json({
          success: false,
          error: 'SMS service is temporarily unavailable',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/user/sms-settings/verify
 * Verify phone number with code
 *
 * Body: { code: string }
 */
router.post('/sms-settings/verify', validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { code } = req.body;

    // Validation
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Verification code is required',
      });
    }

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        error: 'Verification code must be 6 digits',
      });
    }

    // Get current SMS config
    const smsConfig = await getSmsConfig(userId);

    if (!smsConfig || !smsConfig.phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'SMS configuration not found',
      });
    }

    const verified = await verifyPhoneNumber(userId, smsConfig.phoneNumber, code);

    if (!verified) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification code',
      });
    }

    res.json({
      success: true,
      message: 'Phone number verified successfully',
    });
  } catch (error) {
    console.error('Error verifying phone number:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/user/sms-settings/regenerate-key
 * Regenerate SMS key (for security)
 */
router.post(
  '/sms-settings/regenerate-key',
  validateAccessToken,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);

      // Check if SMS is configured
      const smsConfig = await getSmsConfig(userId);

      if (!smsConfig || !smsConfig.phoneNumber) {
        return res.status(400).json({
          success: false,
          error: 'SMS configuration not found',
        });
      }

      const newSmsKey = await regenerateSmsKey(userId);

      res.json({
        success: true,
        data: { smsKey: newSmsKey },
        message: 'SMS key regenerated successfully. Update your saved ID.',
      });
    } catch (error) {
      console.error('Error regenerating SMS key:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PUT /api/user/sms-settings/notifications
 * Update SMS notification preferences
 *
 * Body: {
 *   dailySummary?: boolean,
 *   taskReminders?: boolean,
 *   mitReminders?: boolean
 * }
 */
router.put(
  '/sms-settings/notifications',
  validateAccessToken,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { dailySummary, taskReminders, mitReminders } = req.body;

      // Validation
      if (
        dailySummary !== undefined &&
        typeof dailySummary !== 'boolean'
      ) {
        return res.status(400).json({
          success: false,
          error: 'dailySummary must be a boolean',
        });
      }

      if (
        taskReminders !== undefined &&
        typeof taskReminders !== 'boolean'
      ) {
        return res.status(400).json({
          success: false,
          error: 'taskReminders must be a boolean',
        });
      }

      if (
        mitReminders !== undefined &&
        typeof mitReminders !== 'boolean'
      ) {
        return res.status(400).json({
          success: false,
          error: 'mitReminders must be a boolean',
        });
      }

      const updates: any = {};
      if (dailySummary !== undefined) updates.dailySummary = dailySummary;
      if (taskReminders !== undefined) updates.taskReminders = taskReminders;
      if (mitReminders !== undefined) updates.mitReminders = mitReminders;

      const updatedConfig = await updateSmsNotifications(userId, updates);

      res.json({
        success: true,
        data: updatedConfig,
        message: 'Notification preferences updated',
      });
    } catch (error) {
      console.error('Error updating notifications:', error);

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'SMS configuration not found',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PUT /api/user/sms-settings/preferred-time
 * Update preferred time for daily summaries
 *
 * Body: { preferredTime: string } (format: HH:MM)
 */
router.put(
  '/sms-settings/preferred-time',
  validateAccessToken,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { preferredTime } = req.body;

      // Validation
      if (!preferredTime) {
        return res.status(400).json({
          success: false,
          error: 'Preferred time is required',
        });
      }

      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(preferredTime)) {
        return res.status(400).json({
          success: false,
          error: 'Preferred time must be in HH:MM format (e.g., 09:00)',
        });
      }

      await updatePreferredTime(userId, preferredTime);

      res.json({
        success: true,
        message: 'Preferred time updated',
      });
    } catch (error) {
      console.error('Error updating preferred time:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/user/sms-settings
 * Disable SMS (remove phone number and key)
 */
router.delete('/sms-settings', validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    await disableSms(userId);

    res.json({
      success: true,
      message: 'SMS disabled successfully',
    });
  } catch (error) {
    console.error('Error disabling SMS:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export { router as smsSettingsRouter };
