/**
 * SMS Security Validator
 *
 * Validates SMS requests for:
 * - Phone number + smsKey authentication
 * - Rate limiting (25 requests per hour)
 * - Audit logging
 */

import { DynamoDBDocumentClient, GetCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SmsValidationResult, SmsRateLimitResult, AuditLog, RateLimitEntry, SmsCommand } from './sms.types';
import { v4 as uuidv4 } from 'uuid';
import docClient from '../db/dynamo';

const TABLE_NAME = process.env.TABLE_NAME || 'TaskVision';
const RATE_LIMIT_MAX = 25; // Max requests per hour
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
const DAILY_LIMIT_MAX = 50; // Max SMS per day per user

export class SmsValidator {
  private dynamoClient: DynamoDBDocumentClient;

  constructor(dynamoClient?: DynamoDBDocumentClient) {
    // Use the shared docClient from db/dynamo.ts which has proper local config
    this.dynamoClient = dynamoClient || docClient;
  }

  /**
   * Validate phone number + smsKey combination
   *
   * Queries DynamoDB to find a user with matching phone and smsKey.
   * Returns userId if valid, null otherwise.
   */
  async validateCredentials(phoneNumber: string, smsKey: string): Promise<SmsValidationResult> {
    try {
      // Query for users with this phone number
      // Assuming user settings are stored with PK: USER#{userId}, SK: SETTINGS
      // We need to scan/query for phone number - using GSI2 if available
      // For now, we'll use a query pattern - this should be optimized with a GSI

      const command = new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2', // Assuming GSI2 is set up for phone number lookups
        KeyConditionExpression: 'GSI2PK = :phone',
        ExpressionAttributeValues: {
          ':phone': `PHONE#${phoneNumber}`,
        },
        Limit: 1,
      });

      const result = await this.dynamoClient.send(command);

      if (!result.Items || result.Items.length === 0) {
        return {
          valid: false,
          error: 'Phone number not registered',
        };
      }

      const userSettings = result.Items[0];
      const storedSmsKey = userSettings.smsConfig?.smsKey;

      if (storedSmsKey !== smsKey) {
        return {
          valid: false,
          error: 'Invalid SMS key',
        };
      }

      // Check if phone is verified
      if (!userSettings.smsConfig?.verified) {
        return {
          valid: false,
          error: 'Phone number not verified',
        };
      }

      // Extract userId from PK (format: USER#{userId})
      const userId = userSettings.PK.replace('USER#', '');

      return {
        valid: true,
        userId,
      };
    } catch (error) {
      console.error('Error validating credentials:', error);
      return {
        valid: false,
        error: 'Validation error',
      };
    }
  }

  /**
   * Check rate limit for phone number
   *
   * Returns whether the request is allowed and remaining quota.
   * Uses DynamoDB TTL for automatic cleanup.
   */
  async checkRateLimit(phoneNumber: string): Promise<SmsRateLimitResult> {
    try {
      const now = Math.floor(Date.now() / 1000); // Unix timestamp
      const windowStart = now - RATE_LIMIT_WINDOW;

      // Query for rate limit entries in the last hour
      const command = new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK > :windowStart',
        ExpressionAttributeValues: {
          ':pk': `RATELIMIT#${phoneNumber}`,
          ':windowStart': `SMS#${windowStart}`,
        },
      });

      const result = await this.dynamoClient.send(command);
      const count = result.Items?.length || 0;

      if (count >= RATE_LIMIT_MAX) {
        // Find the oldest entry to determine reset time
        const oldestEntry = result.Items?.[0];
        const resetTime = oldestEntry ? new Date((oldestEntry.TTL - RATE_LIMIT_WINDOW) * 1000).toISOString() : undefined;

        return {
          allowed: false,
          remaining: 0,
          resetTime,
        };
      }

      return {
        allowed: true,
        remaining: RATE_LIMIT_MAX - count - 1, // -1 for current request
      };
    } catch (error) {
      console.error('Error checking rate limit:', error);
      // Fail open to avoid blocking legitimate users
      return {
        allowed: true,
        remaining: RATE_LIMIT_MAX,
      };
    }
  }

  /**
   * Record a rate limit entry
   *
   * Creates a new rate limit entry with TTL for automatic cleanup.
   */
  async recordRateLimitEntry(phoneNumber: string): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const ttl = now + RATE_LIMIT_WINDOW;

      const entry: RateLimitEntry = {
        PK: `RATELIMIT#${phoneNumber}`,
        SK: `SMS#${now}`,
        TTL: ttl,
        count: 1,
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: entry,
      });

      await this.dynamoClient.send(command);
    } catch (error) {
      console.error('Error recording rate limit entry:', error);
      // Non-fatal, continue processing
    }
  }

  /**
   * Check daily SMS limit for user
   *
   * Prevents abuse by limiting total SMS per day.
   */
  async checkDailyLimit(userId: string): Promise<boolean> {
    try {
      // Get user settings to check daily limit
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: 'SETTINGS',
        },
      });

      const result = await this.dynamoClient.send(command);

      if (!result.Item) return true; // Fail open

      const smsConfig = result.Item.smsConfig;
      if (!smsConfig) return true;

      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Reset daily limit if it's a new day
      if (smsConfig.lastResetDate !== today) {
        return true; // Will be reset when recording audit log
      }

      const remaining = smsConfig.dailyLimitRemaining ?? DAILY_LIMIT_MAX;
      return remaining > 0;
    } catch (error) {
      console.error('Error checking daily limit:', error);
      return true; // Fail open
    }
  }

  /**
   * Create audit log entry
   *
   * Logs all SMS activity for security and debugging.
   */
  async createAuditLog(
    phoneNumber: string,
    rawMessage: string,
    action: SmsCommand,
    result: 'Success' | 'Error' | 'Unauthorized' | 'RateLimited',
    userId?: string,
    errorMessage?: string,
    responseLength?: number
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const logId = uuidv4();

      const auditLog: AuditLog = {
        PK: `AUDIT#${phoneNumber}`,
        SK: `SMS#${Date.now()}`,
        logId,
        timestamp,
        phoneNumber,
        rawMessage,
        action,
        result,
        userId,
        errorMessage,
        responseLength,
      };

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: auditLog,
      });

      await this.dynamoClient.send(command);
    } catch (error) {
      // Silently skip audit logging in local dev (credentials may not be configured)
      // Non-fatal, continue processing
    }
  }

  /**
   * Validate phone number format (E.164)
   *
   * E.164 format: +[country code][number]
   * Example: +15551234567
   */
  validatePhoneFormat(phoneNumber: string): boolean {
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber);
  }

  /**
   * Validate SMS key format (4 digits)
   */
  validateSmsKeyFormat(smsKey: string): boolean {
    return /^\d{4}$/.test(smsKey);
  }
}

// Export singleton instance
export const smsValidator = new SmsValidator();
