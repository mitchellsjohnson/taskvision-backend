/**
 * SMS Settings Operations
 *
 * Database operations for SMS configuration management.
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const isOffline = process.env.IS_OFFLINE === 'true';
const dynamoClient = new DynamoDBClient(
  isOffline
    ? {
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: 'http://localhost:8000',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'fakeMyKeyId',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'fakeSecretAccessKey',
      },
    }
    : {}
);
import { SmsConfig } from './user-settings.types';
import { PinpointSMSVoiceV2Client, SendTextMessageCommand } from '@aws-sdk/client-pinpoint-sms-voice-v2';
import crypto from 'crypto';

const TABLE_NAME = process.env.TABLE_NAME || 'TaskVision';
const EUM_CONFIGURATION_SET = process.env.EUM_CONFIGURATION_SET || 'default';
const EUM_ORIGINATION_NUMBER = process.env.EUM_ORIGINATION_NUMBER;
const TEST_PHONE_NUMBER = process.env.TEST_PHONE_NUMBER || '+15555555555';
const ENABLE_SMS_DEBUG = process.env.ENABLE_SMS_DEBUG === 'true';

// Debug logging on startup
console.log('[SMS Operations] Environment variables loaded:', {
  ENABLE_SMS_DEBUG,
  TEST_PHONE_NUMBER,
  'ENABLE_SMS_DEBUG_RAW': process.env.ENABLE_SMS_DEBUG,
  HAS_EUM: !!EUM_ORIGINATION_NUMBER,
});

const smsClient = new PinpointSMSVoiceV2Client({});

// In-memory storage for mock SMS messages (local development only)
export interface MockSmsMessage {
  id: string;
  to: string;
  from: string;
  body: string;
  direction: 'outbound' | 'inbound';
  timestamp: string;
}

const mockSmsMessages: MockSmsMessage[] = [];

/**
 * Generate a random 4-digit SMS key
 */
function generateSmsKey(): string {
  return crypto.randomInt(1000, 9999).toString();
}

/**
 * Check if phone number is a test number
 */
function isTestPhoneNumber(phoneNumber: string): boolean {
  return ENABLE_SMS_DEBUG && phoneNumber === TEST_PHONE_NUMBER;
}

/**
 * Store mock SMS message (local development only)
 */
export function storeMockSmsMessage(to: string, body: string, direction: 'outbound' | 'inbound' = 'outbound'): void {
  console.log('[SMS Debug] storeMockSmsMessage called:', { to, body, direction, ENABLE_SMS_DEBUG });

  if (!ENABLE_SMS_DEBUG) {
    console.log('[SMS Debug] ENABLE_SMS_DEBUG is false, skipping storage');
    return;
  }

  const message: MockSmsMessage = {
    id: crypto.randomUUID(),
    to,
    from: direction === 'outbound' ? (EUM_ORIGINATION_NUMBER || '+15551234567') : to,
    body,
    direction,
    timestamp: new Date().toISOString(),
  };

  mockSmsMessages.unshift(message); // Add to beginning
  console.log('[SMS Debug] Message stored. Total messages:', mockSmsMessages.length);

  // Keep only last 100 messages
  if (mockSmsMessages.length > 100) {
    mockSmsMessages.pop();
  }
}

/**
 * Get all mock SMS messages (local development only)
 */
export function getMockSmsMessages(): MockSmsMessage[] {
  return [...mockSmsMessages];
}

/**
 * Clear all mock SMS messages (local development only)
 */
export function clearMockSmsMessages(): void {
  mockSmsMessages.length = 0;
}

/**
 * Generate a random 6-digit verification code
 */
function generateVerificationCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Store verification code in DynamoDB with 10-minute TTL
 */
async function storeVerificationCode(userId: string, phoneNumber: string, code: string): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + 600; // 10 minutes

  const command = new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall({
      PK: `USER#${userId}`,
      SK: `VERIFICATION#${phoneNumber}`,
      code,
      TTL: ttl,
      createdAt: new Date().toISOString(),
    }, { removeUndefinedValues: true }),
  });

  await dynamoClient.send(command);
}

/**
 * Get stored verification code
 */
async function getVerificationCode(userId: string, phoneNumber: string): Promise<string | null> {
  const command = new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: `USER#${userId}`,
      SK: `VERIFICATION#${phoneNumber}`,
    }),
  });

  const result = await dynamoClient.send(command);

  if (!result.Item) {
    return null;
  }

  const item = unmarshall(result.Item);
  return item.code;
}

/**
 * Get SMS configuration for a user
 */
export async function getSmsConfig(userId: string): Promise<SmsConfig | null> {
  try {
    const command = new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        PK: `USER#${userId}`,
        SK: 'SETTINGS',
      }),
    });

    const result = await dynamoClient.send(command);

    if (!result.Item) {
      return null;
    }

    const item = unmarshall(result.Item);
    return item.smsConfig || null;
  } catch (error) {
    console.error('Error getting SMS config:', error);
    throw new Error('Failed to get SMS configuration');
  }
}

/**
 * Initialize SMS configuration (generates SMS key, but phone not verified)
 */
export async function initializeSmsConfig(userId: string, phoneNumber: string): Promise<SmsConfig> {
  try {
    // Validate E.164 format
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(phoneNumber)) {
      throw new Error('Phone number must be in E.164 format (e.g., +15551234567)');
    }

    const smsKey = generateSmsKey();
    const now = new Date().toISOString();

    // Auto-verify test phone numbers in development
    const autoVerified = isTestPhoneNumber(phoneNumber);

    const smsConfig: SmsConfig = {
      phoneNumber,
      smsKey,
      verified: autoVerified,
      verificationCodeSentAt: undefined,
      enabledNotifications: {
        dailySummary: false,
        taskReminders: false,
        mitReminders: false,
      },
      preferredTime: '09:00',
      dailyLimitRemaining: 50,
      lastResetDate: now.split('T')[0], // YYYY-MM-DD
      createdAt: now,
      updatedAt: now,
    };

    // Update user settings with SMS config
    const command = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        PK: `USER#${userId}`,
        SK: 'SETTINGS',
      }),
      UpdateExpression: 'SET smsConfig = :smsConfig, GSI2PK = :gsi2pk, updatedAt = :updatedAt',
      ExpressionAttributeValues: marshall({
        ':smsConfig': smsConfig,
        ':gsi2pk': `PHONE#${phoneNumber}`, // For reverse phone lookup
        ':updatedAt': now,
      }, { removeUndefinedValues: true }),
    });

    await dynamoClient.send(command);

    return smsConfig;
  } catch (error) {
    console.error('Error initializing SMS config:', error);
    throw error;
  }
}

/**
 * Send verification code via SMS
 */
export async function sendVerificationCode(userId: string, phoneNumber: string): Promise<void> {
  try {
    const code = generateVerificationCode();

    // Store code in DynamoDB
    await storeVerificationCode(userId, phoneNumber, code);

    const message = `TaskVision verification code: ${code}\n\nThis code expires in 10 minutes.`;

    // Check if EUM is configured (production) or use mock mode (local)
    if (!EUM_ORIGINATION_NUMBER) {
      // MOCK MODE: Log to console instead of sending real SMS
      console.log('\n' + '='.repeat(60));
      console.log('📱 [MOCK SMS] Verification Code Sent');
      console.log('='.repeat(60));
      console.log(`To: ${phoneNumber}`);
      console.log(`Code: ${code}`);
      console.log(`Message: ${message}`);
      console.log('='.repeat(60) + '\n');

      // Store in mock SMS log
      storeMockSmsMessage(phoneNumber, message, 'outbound');
    } else {
      // PRODUCTION MODE: Send SMS via AWS End User Messaging SMS and Voice V2
      const command = new SendTextMessageCommand({
        DestinationPhoneNumber: phoneNumber,
        OriginationIdentity: EUM_ORIGINATION_NUMBER,
        MessageBody: message,
        MessageType: 'TRANSACTIONAL',
        ConfigurationSetName: EUM_CONFIGURATION_SET,
      });

      await smsClient.send(command);
    }

    // Update verificationCodeSentAt timestamp
    const updateCommand = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        PK: `USER#${userId}`,
        SK: 'SETTINGS',
      }),
      UpdateExpression: 'SET smsConfig.verificationCodeSentAt = :timestamp',
      ExpressionAttributeValues: marshall({
        ':timestamp': new Date().toISOString(),
      }, { removeUndefinedValues: true }),
    });

    await dynamoClient.send(updateCommand);
  } catch (error) {
    console.error('Error sending verification code:', error);
    throw new Error('Failed to send verification code');
  }
}

/**
 * Verify phone number with code
 */
export async function verifyPhoneNumber(
  userId: string,
  phoneNumber: string,
  code: string
): Promise<boolean> {
  try {
    const storedCode = await getVerificationCode(userId, phoneNumber);

    if (!storedCode || storedCode !== code) {
      return false;
    }

    // Mark phone as verified
    const command = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        PK: `USER#${userId}`,
        SK: 'SETTINGS',
      }),
      UpdateExpression: 'SET smsConfig.verified = :verified, smsConfig.updatedAt = :updatedAt',
      ExpressionAttributeValues: marshall({
        ':verified': true,
        ':updatedAt': new Date().toISOString(),
      }, { removeUndefinedValues: true }),
    });

    await dynamoClient.send(command);

    return true;
  } catch (error) {
    console.error('Error verifying phone number:', error);
    throw new Error('Failed to verify phone number');
  }
}

/**
 * Regenerate SMS key (for security if compromised)
 */
export async function regenerateSmsKey(userId: string): Promise<string> {
  try {
    const newSmsKey = generateSmsKey();

    const command = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        PK: `USER#${userId}`,
        SK: 'SETTINGS',
      }),
      UpdateExpression: 'SET smsConfig.smsKey = :smsKey, smsConfig.updatedAt = :updatedAt',
      ExpressionAttributeValues: marshall({
        ':smsKey': newSmsKey,
        ':updatedAt': new Date().toISOString(),
      }, { removeUndefinedValues: true }),
    });

    await dynamoClient.send(command);

    return newSmsKey;
  } catch (error) {
    console.error('Error regenerating SMS key:', error);
    throw new Error('Failed to regenerate SMS key');
  }
}

/**
 * Update SMS notification preferences
 */
export async function updateSmsNotifications(
  userId: string,
  notifications: {
    dailySummary?: boolean;
    taskReminders?: boolean;
    mitReminders?: boolean;
  }
): Promise<SmsConfig> {
  try {
    const current = await getSmsConfig(userId);

    if (!current) {
      throw new Error('SMS configuration not found');
    }

    const updatedNotifications = {
      ...current.enabledNotifications,
      ...notifications,
    };

    const command = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        PK: `USER#${userId}`,
        SK: 'SETTINGS',
      }),
      UpdateExpression:
        'SET smsConfig.enabledNotifications = :notifications, smsConfig.updatedAt = :updatedAt',
      ExpressionAttributeValues: marshall({
        ':notifications': updatedNotifications,
        ':updatedAt': new Date().toISOString(),
      }, { removeUndefinedValues: true }),
      ReturnValues: 'ALL_NEW',
    });

    const result = await dynamoClient.send(command);

    if (!result.Attributes) {
      throw new Error('Failed to update notifications');
    }

    const item = unmarshall(result.Attributes);
    return item.smsConfig;
  } catch (error) {
    console.error('Error updating SMS notifications:', error);
    throw error;
  }
}

/**
 * Update preferred time for daily summaries
 */
export async function updatePreferredTime(userId: string, preferredTime: string): Promise<void> {
  try {
    // Validate time format (HH:MM)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(preferredTime)) {
      throw new Error('Preferred time must be in HH:MM format (e.g., 09:00)');
    }

    const command = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        PK: `USER#${userId}`,
        SK: 'SETTINGS',
      }),
      UpdateExpression: 'SET smsConfig.preferredTime = :time, smsConfig.updatedAt = :updatedAt',
      ExpressionAttributeValues: marshall({
        ':time': preferredTime,
        ':updatedAt': new Date().toISOString(),
      }, { removeUndefinedValues: true }),
    });

    await dynamoClient.send(command);
  } catch (error) {
    console.error('Error updating preferred time:', error);
    throw error;
  }
}

/**
 * Disable SMS (removes phone number and key, but keeps preferences)
 */
export async function disableSms(userId: string): Promise<void> {
  try {
    const command = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        PK: `USER#${userId}`,
        SK: 'SETTINGS',
      }),
      UpdateExpression:
        'REMOVE smsConfig.phoneNumber, smsConfig.smsKey, smsConfig.verified, GSI2PK SET smsConfig.updatedAt = :updatedAt',
      ExpressionAttributeValues: marshall({
        ':updatedAt': new Date().toISOString(),
      }, { removeUndefinedValues: true }),
    });

    await dynamoClient.send(command);
  } catch (error) {
    console.error('Error disabling SMS:', error);
    throw new Error('Failed to disable SMS');
  }
}
