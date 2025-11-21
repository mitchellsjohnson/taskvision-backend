/**
 * Unit tests for SMS Debug Router
 *
 * Tests the development-only endpoints for testing SMS functionality:
 * - GET /api/dev/sms-messages (retrieve mock messages)
 * - POST /api/dev/sms-messages/clear (clear mock messages)
 * - POST /api/dev/sms-simulate (simulate incoming SMS)
 */

// Set environment variables BEFORE importing router
process.env.ENABLE_SMS_DEBUG = 'true';
process.env.DISABLE_AUTH = 'true';

import request from 'supertest';
import express, { Express } from 'express';
import { smsDebugRouter } from '../sms-debug.router';
import * as smsSettingsOperations from '../sms-settings.operations';
import { smsParser } from '../../sms/sms.parser';
import { smsValidator } from '../../sms/sms.validator';
import { smsFormatter } from '../../sms/sms.formatter';
import { shortCodeService } from '../../sms/short-code.service';
import { createTask, getTask, updateTask, getTasksForUser, reprioritizeTasks } from '../../db/task-operations';

// Mock dependencies
jest.mock('../sms-settings.operations');
jest.mock('../../sms/sms.parser');
jest.mock('../../sms/sms.validator');
jest.mock('../../sms/sms.formatter');
jest.mock('../../sms/short-code.service');
jest.mock('../../db/task-operations');
jest.mock('../../middleware/auth0.middleware', () => ({
  validateAccessToken: (req: any, res: any, next: any) => next(),
}));
jest.mock('../../middleware/get-user-id', () => ({
  getUserId: (req: any, res: any, next: any) => {
    req.auth = { sub: 'test-user-123' };
    next();
  },
}));

describe('SMS Debug Router', () => {
  let app: Express;
  const originalEnv = process.env;

  beforeAll(() => {
    // Enable SMS debug mode for tests
    process.env = {
      ...originalEnv,
      ENABLE_SMS_DEBUG: 'true',
      DISABLE_AUTH: 'true',
    };

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api/dev', smsDebugRouter);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/dev/sms-messages', () => {
    it('should return all mock SMS messages', async () => {
      // Arrange
      const mockMessages = [
        { from: '+15551234567', body: 'Test message', direction: 'inbound', timestamp: '2025-01-01' },
        { from: '+15551234567', body: 'Response', direction: 'outbound', timestamp: '2025-01-01' },
      ];

      (smsSettingsOperations.getMockSmsMessages as jest.Mock).mockReturnValue(mockMessages);

      // Act
      const response = await request(app).get('/api/dev/sms-messages');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          messages: mockMessages,
          count: 2,
        },
      });
    });

    it('should return empty array when no messages exist', async () => {
      // Arrange
      (smsSettingsOperations.getMockSmsMessages as jest.Mock).mockReturnValue([]);

      // Act
      const response = await request(app).get('/api/dev/sms-messages');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.count).toBe(0);
    });

    it('should return 404 when SMS debug is disabled', async () => {
      // Arrange
      process.env.ENABLE_SMS_DEBUG = 'false';
      process.env.IS_OFFLINE = 'false';

      // Re-import router to pick up new env
      jest.resetModules();
      const { smsDebugRouter: newRouter } = require('../sms-debug.router');
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/api/dev', newRouter);

      // Act
      const response = await request(testApp).get('/api/dev/sms-messages');

      // Assert
      expect(response.status).toBe(404);

      // Cleanup
      process.env.ENABLE_SMS_DEBUG = 'true';
    });
  });

  describe('POST /api/dev/sms-messages/clear', () => {
    it('should clear all mock SMS messages', async () => {
      // Arrange
      (smsSettingsOperations.clearMockSmsMessages as jest.Mock).mockReturnValue(undefined);

      // Act
      const response = await request(app).post('/api/dev/sms-messages/clear');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Mock SMS messages cleared',
      });
      expect(smsSettingsOperations.clearMockSmsMessages).toHaveBeenCalled();
    });
  });

  describe('POST /api/dev/sms-simulate', () => {
    it('should simulate incoming SMS and create task', async () => {
      // Arrange
      const from = '+15555555555';
      const body = 'Test task MIT1 ID:8082';

      const mockCommand = {
        command: 'CREATE' as const,
        title: 'Test task',
        priority: 1,
        smsKey: '8082',
        phoneNumber: from,
      };

      const mockValidation = {
        valid: true,
        userId: 'test-user-123',
      };

      const mockTask = {
        TaskId: 'task-123',
        UserId: 'test-user-123',
        title: 'Test task',
        priority: 1,
        isMIT: true,
        status: 'Open' as const,
        createdAt: '2025-01-01',
        shortCode: 'abc1',
      };

      (smsSettingsOperations.storeMockSmsMessage as jest.Mock).mockReturnValue(undefined);
      (smsParser.parse as jest.Mock).mockReturnValue(mockCommand);
      (smsValidator.validateCredentials as jest.Mock).mockResolvedValue(mockValidation);
      (smsValidator.createAuditLog as jest.Mock).mockResolvedValue(undefined);
      (shortCodeService.generateUniqueCode as jest.Mock).mockResolvedValue({ code: 'abc1', attempts: 1 });
      (getTasksForUser as jest.Mock).mockResolvedValue([]);
      (createTask as jest.Mock).mockResolvedValue(mockTask);
      (reprioritizeTasks as jest.Mock).mockResolvedValue(undefined);
      (smsFormatter.formatCreateSuccess as jest.Mock).mockReturnValue('Task created: abc1 - Test task');

      // Act
      const response = await request(app)
        .post('/api/dev/sms-simulate')
        .send({ from, body });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.result).toContain('Task created');
      expect(smsSettingsOperations.storeMockSmsMessage).toHaveBeenCalledWith(from, body, 'inbound');
      expect(smsSettingsOperations.storeMockSmsMessage).toHaveBeenCalledWith(from, expect.any(String), 'outbound');
    });

    it('should return error for invalid phone format', async () => {
      // Act
      const response = await request(app)
        .post('/api/dev/sms-simulate')
        .send({
          from: '555-1234', // Invalid format
          body: 'Test message',
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('E.164 format');
    });

    it('should return error when from or body is missing', async () => {
      // Act
      const response = await request(app)
        .post('/api/dev/sms-simulate')
        .send({ from: '+15551234567' }); // Missing body

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    it('should handle CLOSE command', async () => {
      // Arrange
      const from = '+15555555555';
      const body = 'CLOSE abc1 ID:8082';

      const mockCommand = {
        command: 'CLOSE' as const,
        shortCode: 'abc1',
        smsKey: '8082',
        phoneNumber: from,
      };

      const mockValidation = {
        valid: true,
        userId: 'test-user-123',
      };

      const mockTask = {
        TaskId: 'task-123',
        UserId: 'test-user-123',
        title: 'Task to close',
        status: 'Open' as const,
        priority: 1,
        isMIT: true,
        createdAt: '2025-01-01',
      };

      (smsParser.parse as jest.Mock).mockReturnValue(mockCommand);
      (smsValidator.validateCredentials as jest.Mock).mockResolvedValue(mockValidation);
      (smsValidator.createAuditLog as jest.Mock).mockResolvedValue(undefined);
      (shortCodeService.lookupTaskByCode as jest.Mock).mockResolvedValue('task-123');
      (getTask as jest.Mock).mockResolvedValue(mockTask);
      (updateTask as jest.Mock).mockResolvedValue({ ...mockTask, status: 'Completed' as const });
      (smsFormatter.formatCloseSuccess as jest.Mock).mockReturnValue('Task closed: abc1');

      // Act
      const response = await request(app)
        .post('/api/dev/sms-simulate')
        .send({ from, body });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.result).toContain('closed');
    });

    it('should handle EDIT command', async () => {
      // Arrange
      const from = '+15555555555';
      const body = 'EDIT abc1 "Updated title" MIT2 ID:8082';

      const mockCommand = {
        command: 'EDIT' as const,
        shortCode: 'abc1',
        title: 'Updated title',
        priority: 2,
        smsKey: '8082',
        phoneNumber: from,
      };

      const mockValidation = {
        valid: true,
        userId: 'test-user-123',
      };

      const mockUpdatedTask = {
        TaskId: 'task-123',
        UserId: 'test-user-123',
        title: 'Updated title',
        priority: 2,
        isMIT: true,
        status: 'Open' as const,
        createdAt: '2025-01-01',
      };

      (smsParser.parse as jest.Mock).mockReturnValue(mockCommand);
      (smsValidator.validateCredentials as jest.Mock).mockResolvedValue(mockValidation);
      (smsValidator.createAuditLog as jest.Mock).mockResolvedValue(undefined);
      (shortCodeService.lookupTaskByCode as jest.Mock).mockResolvedValue('task-123');
      (updateTask as jest.Mock).mockResolvedValue(mockUpdatedTask);
      (smsFormatter.formatEditSuccess as jest.Mock).mockReturnValue('Task updated: abc1');

      // Act
      const response = await request(app)
        .post('/api/dev/sms-simulate')
        .send({ from, body });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.result).toContain('updated');
    });

    it('should handle LIST MIT command', async () => {
      // Arrange
      const from = '+15555555555';
      const body = 'LIST MIT ID:8082';

      const mockCommand = {
        command: 'LIST_MIT' as const,
        smsKey: '8082',
        phoneNumber: from,
      };

      const mockValidation = {
        valid: true,
        userId: 'test-user-123',
      };

      const mockMitTasks = [
        { TaskId: 't1', title: 'MIT1', priority: 1, isMIT: true, status: 'Open' as const },
        { TaskId: 't2', title: 'MIT2', priority: 2, isMIT: true, status: 'Open' as const },
      ];

      (smsParser.parse as jest.Mock).mockReturnValue(mockCommand);
      (smsValidator.validateCredentials as jest.Mock).mockResolvedValue(mockValidation);
      (smsValidator.createAuditLog as jest.Mock).mockResolvedValue(undefined);
      (getTasksForUser as jest.Mock).mockResolvedValue(mockMitTasks);
      (smsFormatter.formatListMitResponse as jest.Mock).mockReturnValue('MIT tasks: MIT1, MIT2');

      // Act
      const response = await request(app)
        .post('/api/dev/sms-simulate')
        .send({ from, body });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.result).toContain('MIT tasks');
    });

    it('should handle LIST ALL command', async () => {
      // Arrange
      const from = '+15555555555';
      const body = 'LIST ALL ID:8082';

      const mockCommand = {
        command: 'LIST_ALL' as const,
        smsKey: '8082',
        phoneNumber: from,
      };

      const mockValidation = {
        valid: true,
        userId: 'test-user-123',
      };

      const mockAllTasks = [
        { TaskId: 't1', title: 'MIT1', priority: 1, isMIT: true, status: 'Open' as const },
        { TaskId: 't2', title: 'LIT1', priority: 1, isMIT: false, status: 'Open' as const },
      ];

      (smsParser.parse as jest.Mock).mockReturnValue(mockCommand);
      (smsValidator.validateCredentials as jest.Mock).mockResolvedValue(mockValidation);
      (smsValidator.createAuditLog as jest.Mock).mockResolvedValue(undefined);
      (getTasksForUser as jest.Mock).mockResolvedValue(mockAllTasks);
      (smsFormatter.formatListResponse as jest.Mock).mockReturnValue('MIT: MIT1\nLIT: LIT1');

      // Act
      const response = await request(app)
        .post('/api/dev/sms-simulate')
        .send({ from, body });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.result).toContain('MIT:');
      expect(response.body.data.result).toContain('LIT:');
    });

    it('should handle HELP command without authentication', async () => {
      // Arrange
      const from = '+15555555555';
      const body = 'HELP';

      const mockCommand = {
        command: 'HELP' as const,
        smsKey: '0000',
        phoneNumber: from,
      };

      (smsParser.parse as jest.Mock).mockReturnValue(mockCommand);
      (smsValidator.createAuditLog as jest.Mock).mockResolvedValue(undefined);
      (smsFormatter.formatHelp as jest.Mock).mockReturnValue('SMS Commands: CREATE, CLOSE, EDIT, LIST');

      // Act
      const response = await request(app)
        .post('/api/dev/sms-simulate')
        .send({ from, body });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.result).toContain('SMS Commands');
      expect(smsValidator.validateCredentials).not.toHaveBeenCalled(); // HELP doesn't require auth
    });

    it('should handle parse failure', async () => {
      // Arrange
      const from = '+15555555555';
      const body = 'INVALID COMMAND';

      (smsParser.parse as jest.Mock).mockReturnValue(null);
      (smsValidator.createAuditLog as jest.Mock).mockResolvedValue(undefined);
      (smsFormatter.formatError as jest.Mock).mockReturnValue('Invalid format. Reply HELP for commands');

      // Act
      const response = await request(app)
        .post('/api/dev/sms-simulate')
        .send({ from, body });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.data.result).toContain('Invalid format');
    });

    it('should handle unauthorized credentials', async () => {
      // Arrange
      const from = '+15555555555';
      const body = 'Test task MIT1 ID:9999';

      const mockCommand = {
        command: 'CREATE' as const,
        title: 'Test task',
        priority: 1,
        smsKey: '9999',
        phoneNumber: from,
      };

      const mockValidation = {
        valid: false,
        error: 'Invalid SMS key',
      };

      (smsParser.parse as jest.Mock).mockReturnValue(mockCommand);
      (smsValidator.validateCredentials as jest.Mock).mockResolvedValue(mockValidation);
      (smsValidator.createAuditLog as jest.Mock).mockResolvedValue(undefined);
      (smsFormatter.formatError as jest.Mock).mockReturnValue('Unauthorized. Check your ID in Settings');

      // Act
      const response = await request(app)
        .post('/api/dev/sms-simulate')
        .send({ from, body });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.data.result).toContain('Unauthorized');
    });

    it('should handle task not found on CLOSE', async () => {
      // Arrange
      const from = '+15555555555';
      const body = 'CLOSE xyz9 ID:8082';

      const mockCommand = {
        command: 'CLOSE' as const,
        shortCode: 'xyz9',
        smsKey: '8082',
        phoneNumber: from,
      };

      const mockValidation = {
        valid: true,
        userId: 'test-user-123',
      };

      (smsParser.parse as jest.Mock).mockReturnValue(mockCommand);
      (smsValidator.validateCredentials as jest.Mock).mockResolvedValue(mockValidation);
      (smsValidator.createAuditLog as jest.Mock).mockResolvedValue(undefined);
      (shortCodeService.lookupTaskByCode as jest.Mock).mockResolvedValue(null);
      (smsFormatter.formatError as jest.Mock).mockReturnValue('Task code not found');

      // Act
      const response = await request(app)
        .post('/api/dev/sms-simulate')
        .send({ from, body });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.data.result).toContain('not found');
    });

    it('should handle exceptions gracefully', async () => {
      // Arrange
      const from = '+15555555555';
      const body = 'Test task MIT1 ID:8082';

      (smsParser.parse as jest.Mock).mockImplementation(() => {
        throw new Error('Unexpected error');
      });
      (smsValidator.createAuditLog as jest.Mock).mockResolvedValue(undefined);
      (smsFormatter.formatError as jest.Mock).mockReturnValue('Error processing. Try again later');

      // Act
      const response = await request(app)
        .post('/api/dev/sms-simulate')
        .send({ from, body });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.data.result).toContain('Error processing');
    });
  });
});
