/**
 * Short Code Service
 *
 * Generates collision-resistant 4-character codes for SMS task references.
 * Uses GSI1 for fast lookup and collision detection.
 */

import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ShortCodeResult } from './sms.types';
import docClient from '../db/dynamo';

const TABLE_NAME = process.env.TABLE_NAME || 'TaskVision';
const MAX_RETRIES = 5;

// Character set excluding confusing characters (0, O, I, l, 1)
const CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

export class ShortCodeService {
  private dynamoClient: DynamoDBDocumentClient;

  constructor(dynamoClient?: DynamoDBDocumentClient) {
    // Use the shared docClient from db/dynamo.ts which has proper local config
    this.dynamoClient = dynamoClient || docClient;
  }

  /**
   * Generate a random 4-character short code
   */
  private generateCode(length: number = 4): string {
    let code = '';
    for (let i = 0; i < length; i++) {
      code += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
    return code;
  }

  /**
   * Check if a short code is already in use by querying GSI1
   */
  private async isCodeInUse(code: string, userId: string): Promise<boolean> {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsi1pk AND GSI1SK = :gsi1sk',
      ExpressionAttributeValues: {
        ':gsi1pk': `SHORTCODE#${code}`,
        ':gsi1sk': `USER#${userId}`,
      },
      Limit: 1,
    });

    const result = await this.dynamoClient.send(command);
    return (result.Items?.length ?? 0) > 0;
  }

  /**
   * Generate a unique short code for a user
   *
   * Attempts to generate a 4-character code, retrying up to MAX_RETRIES times.
   * If all retries fail, generates a 5-character code to reduce collision probability.
   *
   * @param userId - User ID to scope the short code
   * @returns ShortCodeResult with generated code and attempt count
   */
  async generateUniqueCode(userId: string): Promise<ShortCodeResult> {
    let attempts = 0;
    let codeLength = 4;

    while (attempts < MAX_RETRIES) {
      attempts++;
      const code = this.generateCode(codeLength);

      const inUse = await this.isCodeInUse(code, userId);

      if (!inUse) {
        return { code, attempts };
      }

      // After 3 failed attempts, switch to 5-character codes
      if (attempts === 3) {
        codeLength = 5;
      }
    }

    // Final fallback: generate a 6-character code (extremely rare)
    const fallbackCode = this.generateCode(6);
    return { code: fallbackCode, attempts };
  }

  /**
   * Look up a task by its short code
   *
   * @param code - Short code to look up
   * @param userId - User ID to scope the search
   * @returns Task ID if found, null otherwise
   */
  async lookupTaskByCode(code: string, userId: string): Promise<string | null> {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsi1pk AND GSI1SK = :gsi1sk',
      ExpressionAttributeValues: {
        ':gsi1pk': `SHORTCODE#${code}`,
        ':gsi1sk': `USER#${userId}`,
      },
      Limit: 1,
    });

    const result = await this.dynamoClient.send(command);

    if (result.Items && result.Items.length > 0) {
      // Extract TaskId from SK (format: TASK#{taskId})
      const sk = result.Items[0].SK as string;
      return sk.replace('TASK#', '');
    }

    return null;
  }

  /**
   * Validate short code format
   *
   * @param code - Code to validate
   * @returns true if valid format, false otherwise
   */
  validateCodeFormat(code: string): boolean {
    if (code.length < 4 || code.length > 6) {
      return false;
    }

    // Check that all characters are in the allowed set
    for (const char of code) {
      if (!CHARS.includes(char)) {
        return false;
      }
    }

    return true;
  }
}

// Export singleton instance
export const shortCodeService = new ShortCodeService();
