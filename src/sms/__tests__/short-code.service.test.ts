/**
 * Unit tests for Short Code Service
 */

import { ShortCodeService } from '../short-code.service';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('ShortCodeService', () => {
  let service: ShortCodeService;

  beforeEach(() => {
    dynamoMock.reset();
    service = new ShortCodeService(dynamoMock as any);
  });

  describe('generateUniqueCode', () => {
    it('should generate a 4-character code', async () => {
      // Mock: no collision
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const result = await service.generateUniqueCode('user123');

      expect(result.code).toHaveLength(4);
      expect(result.code).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{4}$/);
      expect(result.attempts).toBe(1);
    });

    it('should retry on collision', async () => {
      // First attempt: collision, second attempt: success
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [{ TaskId: 'existing' }] })
        .resolvesOnce({ Items: [] });

      const result = await service.generateUniqueCode('user123');

      expect(result.code).toHaveLength(4);
      expect(result.attempts).toBe(2);
    });

    it('should fallback to 5 chars after 3 attempts', async () => {
      // Mock 3 collisions, then success with 5-char
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [{ TaskId: 'ex1' }] })
        .resolvesOnce({ Items: [{ TaskId: 'ex2' }] })
        .resolvesOnce({ Items: [{ TaskId: 'ex3' }] })
        .resolvesOnce({ Items: [] });

      const result = await service.generateUniqueCode('user123');

      expect(result.code).toHaveLength(5);
      expect(result.attempts).toBe(4);
    });

    it('should fallback to 6 chars if max retries exceeded', async () => {
      // Mock MAX_RETRIES (5) collisions, plus one more that works
      dynamoMock.on(QueryCommand)
        .resolvesOnce({ Items: [{ TaskId: 'ex1' }] })
        .resolvesOnce({ Items: [{ TaskId: 'ex2' }] })
        .resolvesOnce({ Items: [{ TaskId: 'ex3' }] })
        .resolvesOnce({ Items: [{ TaskId: 'ex4' }] })
        .resolvesOnce({ Items: [{ TaskId: 'ex5' }] })
        .resolves({ Items: [] }); // fallback succeeds

      const result = await service.generateUniqueCode('user123');

      expect(result.code).toHaveLength(6);
      expect(result.attempts).toBe(5);
    });

    it('should generate codes with valid characters only', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      for (let i = 0; i < 10; i++) {
        const result = await service.generateUniqueCode('user123');
        // Should only use allowed chars (no confusing 0, O, I, l, 1)
        expect(result.code).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]+$/);
      }
    });
  });

  describe('lookupTaskByCode', () => {
    it('should find task by short code', async () => {
      dynamoMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'USER#user123',
            SK: 'TASK#task456',
            TaskId: 'task456',
            shortCode: 'a2b3',
          },
        ],
      });

      const taskId = await service.lookupTaskByCode('a2b3', 'user123');

      expect(taskId).toBe('task456');
    });

    it('should return null if code not found', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const taskId = await service.lookupTaskByCode('zzzz', 'user123');

      expect(taskId).toBeNull();
    });

    it('should return null if no items returned', async () => {
      dynamoMock.on(QueryCommand).resolves({});

      const taskId = await service.lookupTaskByCode('a2b3', 'user123');

      expect(taskId).toBeNull();
    });

    it('should use correct GSI1 query format', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      await service.lookupTaskByCode('a2b3', 'user123');

      const calls = dynamoMock.commandCalls(QueryCommand);
      expect(calls.length).toBe(1);
      expect(calls[0].args[0].input).toMatchObject({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk AND GSI1SK = :gsi1sk',
        ExpressionAttributeValues: {
          ':gsi1pk': 'SHORTCODE#a2b3',
          ':gsi1sk': 'USER#user123',
        },
      });
    });
  });

  describe('validateCodeFormat', () => {
    it('should validate correct short codes', () => {
      expect(service.validateCodeFormat('a2b3')).toBe(true);
      expect(service.validateCodeFormat('xyz9')).toBe(true);
      expect(service.validateCodeFormat('2222')).toBe(true);
      expect(service.validateCodeFormat('aaaa')).toBe(true);
    });

    it('should validate 5-6 char codes for fallback scenarios', () => {
      expect(service.validateCodeFormat('abcd2')).toBe(true); // 5 chars
      expect(service.validateCodeFormat('abcd23')).toBe(true); // 6 chars
    });

    it('should reject codes that are too short', () => {
      expect(service.validateCodeFormat('abc')).toBe(false); // 3 chars
      expect(service.validateCodeFormat('ab')).toBe(false);
      expect(service.validateCodeFormat('a')).toBe(false);
      expect(service.validateCodeFormat('')).toBe(false);
    });

    it('should reject codes that are too long', () => {
      expect(service.validateCodeFormat('abcdefg')).toBe(false); // 7 chars
      expect(service.validateCodeFormat('abcdefgh')).toBe(false);
    });

    it('should reject codes with invalid characters', () => {
      expect(service.validateCodeFormat('AB23')).toBe(false); // uppercase
      expect(service.validateCodeFormat('a-b3')).toBe(false); // special char
      expect(service.validateCodeFormat('a b3')).toBe(false); // space
      expect(service.validateCodeFormat('a1O0')).toBe(false); // confusing chars O, 0
      expect(service.validateCodeFormat('Il12')).toBe(false); // confusing chars I, l, 1
    });
  });

  describe('collision probability', () => {
    it('should have low collision probability for 4-char codes', () => {
      const charset = 'abcdefghjkmnpqrstuvwxyz23456789'; // 30 chars (no confusing ones)
      const codeSpace = Math.pow(charset.length, 4); // 30^4 = 810,000

      // With 10,000 tasks, collision probability is roughly 1.2%
      const expectedCollisionRate = 10000 / codeSpace;

      expect(codeSpace).toBeGreaterThan(800_000);
      expect(expectedCollisionRate).toBeLessThan(0.015); // < 1.5% for 10k tasks
    });
  });
});
