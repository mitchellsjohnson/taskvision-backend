/**
 * Unit tests for SMS Validator
 */

import { SmsValidator } from '../sms.validator';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('SmsValidator', () => {
  let validator: SmsValidator;

  beforeEach(() => {
    dynamoMock.reset();
    validator = new SmsValidator(dynamoMock as any);
  });

  describe('validateCredentials', () => {
    it('should validate correct phone and SMS key', async () => {
      dynamoMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'USER#user123',
            SK: 'SETTINGS',
            smsConfig: {
              phoneNumber: '+15551234567',
              smsKey: '1234',
              verified: true,
            },
          },
        ],
      });

      const result = await validator.validateCredentials('+15551234567', '1234');

      expect(result.valid).toBe(true);
      expect(result.userId).toBe('user123');
    });

    it('should reject unverified phone', async () => {
      dynamoMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'USER#user123',
            SK: 'SETTINGS',
            smsConfig: {
              phoneNumber: '+15551234567',
              smsKey: '1234',
              verified: false,
            },
          },
        ],
      });

      const result = await validator.validateCredentials('+15551234567', '1234');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Phone number not verified');
    });

    it('should reject wrong SMS key', async () => {
      dynamoMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'USER#user123',
            SK: 'SETTINGS',
            smsConfig: {
              phoneNumber: '+15551234567',
              smsKey: '1234',
              verified: true,
            },
          },
        ],
      });

      const result = await validator.validateCredentials('+15551234567', '5678');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid SMS key');
    });

    it('should reject phone not in system', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const result = await validator.validateCredentials('+15551234567', '1234');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Phone number not registered');
    });

    it('should use correct GSI2 query', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      await validator.validateCredentials('+15551234567', '1234');

      const calls = dynamoMock.commandCalls(QueryCommand);
      expect(calls.length).toBe(1);
      expect(calls[0].args[0].input).toMatchObject({
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :phone',
        ExpressionAttributeValues: {
          ':phone': 'PHONE#+15551234567',
        },
      });
    });

    it('should handle database errors gracefully', async () => {
      dynamoMock.on(QueryCommand).rejects(new Error('DB connection failed'));

      const result = await validator.validateCredentials('+15551234567', '1234');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Validation error');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow SMS within rate limit', async () => {
      // Mock 10 SMS in last hour (under 25 limit)
      const recentSms = Array(10).fill({
        PK: 'RATELIMIT#+15551234567',
        SK: 'SMS#1234567890',
        TTL: 1234570000,
      });

      dynamoMock.on(QueryCommand).resolves({ Items: recentSms });

      const result = await validator.checkRateLimit('+15551234567');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(14); // 25 - 10 - 1
    });

    it('should reject when rate limit exceeded', async () => {
      // Mock 25 SMS in last hour (at limit)
      const recentSms = Array(25).fill({
        PK: 'RATELIMIT#+15551234567',
        SK: 'SMS#1234567890',
        TTL: 1234570000,
      });

      dynamoMock.on(QueryCommand).resolves({ Items: recentSms });

      const result = await validator.checkRateLimit('+15551234567');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.resetTime).toBeDefined();
    });

    it('should handle no previous SMS', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const result = await validator.checkRateLimit('+15551234567');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(24); // 25 - 0 - 1
    });

    it('should handle database errors gracefully (fail open)', async () => {
      dynamoMock.on(QueryCommand).rejects(new Error('DB query failed'));

      const result = await validator.checkRateLimit('+15551234567');

      // Should fail open to avoid blocking legitimate users
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(25);
    });
  });

  describe('createAuditLog', () => {
    it('should create audit log for successful command', async () => {
      dynamoMock.on(PutCommand).resolves({});

      await validator.createAuditLog(
        '+15551234567',
        'CREATE "Task" MIT1 ID:1234',
        'CREATE',
        'Success',
        'user123',
        undefined,
        100
      );

      const calls = dynamoMock.commandCalls(PutCommand);
      expect(calls.length).toBe(1);
      expect(calls[0].args[0].input.Item).toMatchObject({
        phoneNumber: '+15551234567',
        action: 'CREATE',
        result: 'Success',
        userId: 'user123',
        responseLength: 100,
      });
    });

    it('should create audit log for failed command', async () => {
      dynamoMock.on(PutCommand).resolves({});

      await validator.createAuditLog(
        '+15551234567',
        'INVALID COMMAND',
        'HELP',
        'Error',
        undefined,
        'Invalid command format'
      );

      const calls = dynamoMock.commandCalls(PutCommand);
      expect(calls.length).toBe(1);
      expect(calls[0].args[0].input.Item).toMatchObject({
        phoneNumber: '+15551234567',
        result: 'Error',
        errorMessage: 'Invalid command format',
      });
    });

    it('should handle audit log errors gracefully', async () => {
      dynamoMock.on(PutCommand).rejects(new Error('DB write failed'));

      // Should not throw
      await expect(
        validator.createAuditLog('+15551234567', 'TEST', 'HELP', 'Success')
      ).resolves.not.toThrow();
    });

  });
});
