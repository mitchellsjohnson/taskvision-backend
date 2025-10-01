import dynamoClient from '../db/dynamo';
import { GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { UserSettings, UserSettingsUpdate } from './user-settings.types';

const TABLE_NAME = process.env.TABLE_NAME || "TaskVision";

/**
 * Get user settings by userId
 */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  try {
    const command = new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        PK: `USER#${userId}`,
        SK: 'SETTINGS'
      })
    });

    const result = await dynamoClient.send(command);
    
    if (!result.Item) {
      // Return default settings if none exist
      return {
        userId,
        theme: 'system',
        fontSize: 'medium',
        accessibility: {
          reducedMotion: false,
          highContrast: false,
          alwaysShowFocus: false,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const item = unmarshall(result.Item);
    return {
      userId: item.userId,
      theme: item.theme || 'system',
      fontSize: item.fontSize || 'medium',
      accessibility: item.accessibility || {
        reducedMotion: false,
        highContrast: false,
        alwaysShowFocus: false,
      },
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  } catch (error) {
    console.error('Error getting user settings:', error);
    throw new Error('Failed to get user settings');
  }
}

/**
 * Update user settings
 */
export async function updateUserSettings(
  userId: string, 
  updates: UserSettingsUpdate
): Promise<UserSettings> {
  try {
    // First get current settings
    const currentSettings = await getUserSettings(userId);
    
    // Merge updates with current settings
    const updatedSettings: UserSettings = {
      ...currentSettings,
      ...updates,
      userId, // Ensure userId is preserved
      updatedAt: new Date().toISOString(),
    };

    // If this is the first time saving settings, set createdAt
    if (!currentSettings.createdAt) {
      updatedSettings.createdAt = new Date().toISOString();
    }

    const command = new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall({
        PK: `USER#${userId}`,
        SK: 'SETTINGS',
        ...updatedSettings,
      })
    });

    await dynamoClient.send(command);
    return updatedSettings;
  } catch (error) {
    console.error('Error updating user settings:', error);
    throw new Error('Failed to update user settings');
  }
}
