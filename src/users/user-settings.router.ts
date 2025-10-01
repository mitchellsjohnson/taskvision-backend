import { Request, Response, Router } from 'express';
import { validateAccessToken } from '../middleware/auth0.middleware';
import { getUserId } from '../middleware/get-user-id';
import { getUserSettings, updateUserSettings } from './user-settings.operations';
import { UserSettingsUpdate } from './user-settings.types';

const router = Router();

/**
 * GET /api/user/settings
 * Get user settings
 */
router.get('/settings', validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const settings = await getUserSettings(userId);

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * PUT /api/user/settings
 * Update user settings
 */
router.put('/settings', validateAccessToken, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    const { theme, fontSize, accessibility } = req.body;
    
    // Validate input
    if (theme && !['system', 'light', 'dark'].includes(theme)) {
      return res.status(400).json({ 
        success: false,
        error: 'theme must be one of: system, light, dark' 
      });
    }

    if (fontSize && !['small', 'medium', 'large', 'extra-large', 'extra-extra-large'].includes(fontSize)) {
      return res.status(400).json({ 
        success: false,
        error: 'fontSize must be one of: small, medium, large, extra-large, extra-extra-large' 
      });
    }

    if (accessibility && typeof accessibility !== 'object') {
      return res.status(400).json({ 
        success: false,
        error: 'accessibility must be an object' 
      });
    }

    const updates: UserSettingsUpdate = {};
    if (theme !== undefined) updates.theme = theme;
    if (fontSize !== undefined) updates.fontSize = fontSize;
    if (accessibility !== undefined) updates.accessibility = accessibility;

    const result = await updateUserSettings(userId, updates);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error updating user settings:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

export { router as userSettingsRouter };
