/**
 * Unit tests for SMS Service
 *
 * Tests the main orchestration service that handles:
 * - M2M token management
 * - Task API calls
 * - SMS response sending via Pinpoint
 * - Command routing
 */

import { SmsService } from '../sms.service';
import { smsFormatter } from '../sms.formatter';
import { shortCodeService } from '../short-code.service';
import { Task } from '../../types';

// Mock dependencies
jest.mock('../sms.formatter');
jest.mock('../short-code.service');
jest.mock('@aws-sdk/client-pinpoint-sms-voice-v2');

// Mock fetch globally
global.fetch = jest.fn();

// Helper to create valid Task objects for tests
const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  TaskId: 't1',
  UserId: 'u1',
  title: 'Test Task',
  description: null,
  status: 'Open',
  creationDate: '2025-01-01',
  modifiedDate: '2025-01-01',
  completedDate: null,
  dueDate: null,
  priority: 1,
  isMIT: true,
  tags: [],
  ...overrides,
});

describe('SmsService', () => {
  let service: SmsService;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  // Mock environment variables
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      TASKVISION_API_URL: 'http://localhost:8000',
      AUTH0_DOMAIN: 'test.auth0.com',
      AUTH0_CLIENT_ID: 'test-client-id',
      AUTH0_CLIENT_SECRET: 'test-client-secret',
      AUTH0_AUDIENCE: 'test-audience',
      EUM_CONFIGURATION_SET: 'default',
      EUM_ORIGINATION_NUMBER: '+15551234567',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SmsService();
  });

  describe('M2M Token Management', () => {
    it('should fetch M2M token from Auth0', async () => {
      // Arrange
      const mockToken = {
        access_token: 'test-access-token',
        expires_in: 3600,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockToken,
      } as Response);

      // Act - call private method via reflection
      const token = await (service as any).getM2MToken();

      // Assert
      expect(token).toBe('test-access-token');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-domain.auth0.com/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('client_credentials'),
        })
      );
    });

    it('should cache M2M token and reuse if not expired', async () => {
      // Arrange
      const mockToken = {
        access_token: 'cached-token',
        expires_in: 3600,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockToken,
      } as Response);

      // Act - call twice
      const token1 = await (service as any).getM2MToken();
      const token2 = await (service as any).getM2MToken();

      // Assert
      expect(token1).toBe('cached-token');
      expect(token2).toBe('cached-token');
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only called once, second time uses cache
    });

    it('should refresh M2M token when expired', async () => {
      // Arrange
      const firstToken = {
        access_token: 'first-token',
        expires_in: -1, // Already expired
      };
      const secondToken = {
        access_token: 'second-token',
        expires_in: 3600,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => firstToken,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => secondToken,
        } as Response);

      // Act
      const token1 = await (service as any).getM2MToken();
      const token2 = await (service as any).getM2MToken();

      // Assert
      expect(token1).toBe('first-token');
      expect(token2).toBe('second-token');
      expect(mockFetch).toHaveBeenCalledTimes(2); // Called twice due to expiration
    });

    it('should throw error when Auth0 token request fails', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      } as Response);

      // Act & Assert
      await expect((service as any).getM2MToken()).rejects.toThrow('Authentication failed');
    });
  });

  describe('API Call Method', () => {
    it('should make authenticated API call with M2M token', async () => {
      // Arrange
      const mockToken = {
        access_token: 'test-token',
        expires_in: 3600,
      };
      const mockApiResponse = { data: 'test-data' };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToken,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockApiResponse,
        } as Response);

      // Act
      const result = await (service as any).apiCall('GET', '/api/test', 'user123');

      // Assert
      expect(result).toEqual(mockApiResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
            'X-User-Id': 'user123',
          }),
        })
      );
    });

    it('should include request body in POST requests', async () => {
      // Arrange
      const mockToken = {
        access_token: 'test-token',
        expires_in: 3600,
      };
      const requestBody = { title: 'Test task' };
      const mockApiResponse = { success: true };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToken,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockApiResponse,
        } as Response);

      // Act
      await (service as any).apiCall('POST', '/api/tasks', 'user123', requestBody);

      // Assert
      expect(mockFetch).toHaveBeenLastCalledWith(
        'http://localhost:8000/api/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestBody),
        })
      );
    });

    it('should throw error when API call fails', async () => {
      // Arrange
      const mockToken = {
        access_token: 'test-token',
        expires_in: 3600,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockToken,
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          statusText: 'Not Found',
        } as Response);

      // Act & Assert
      await expect((service as any).apiCall('GET', '/api/invalid', 'user123')).rejects.toThrow(
        'API call failed'
      );
    });
  });

  describe('Handle CREATE Command', () => {
    it('should create MIT task with correct positioning', async () => {
      // Arrange
      const mockToken = { access_token: 'test-token', expires_in: 3600 };
      const mockShortCode = { code: 'abc1', attempts: 1 };
      const mockExistingTasks: Task[] = [
        createMockTask({ TaskId: 't1', title: 'MIT1', priority: 1 }),
        createMockTask({ TaskId: 't2', title: 'MIT2', priority: 2 }),
      ];
      const mockCreatedTask: Task = createMockTask({
        TaskId: 't3',
        title: 'New MIT1',
        priority: 1,
        isMIT: true,
        shortCode: 'abc1',
      });

      (shortCodeService.generateUniqueCode as jest.Mock).mockResolvedValue(mockShortCode);
      (smsFormatter.formatCreateSuccess as jest.Mock).mockReturnValue('Task created: abc1 - New MIT1');

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockToken } as Response) // M2M token
        .mockResolvedValueOnce({ ok: true, json: async () => mockExistingTasks } as Response) // GET tasks
        .mockResolvedValueOnce({ ok: true, json: async () => mockCreatedTask } as Response); // POST task

      // Act
      const result = await (service as any).handleCreate(
        { command: 'CREATE', title: 'New MIT1', priority: 1, smsKey: '1234' },
        'u1'
      );

      // Assert
      expect(result).toBe('Task created: abc1 - New MIT1');
      expect(shortCodeService.generateUniqueCode).toHaveBeenCalledWith('u1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/tasks?status=Open',
        expect.anything()
      );
    });

    it('should create LIT task after MIT tasks', async () => {
      // Arrange
      const mockToken = { access_token: 'test-token', expires_in: 3600 };
      const mockShortCode = { code: 'xyz9', attempts: 1 };
      const mockExistingTasks: Task[] = [
        createMockTask({ TaskId: 't1', title: 'MIT1', priority: 1, isMIT: true }),
        createMockTask({ TaskId: 't2', title: 'LIT1', priority: 1, isMIT: false }),
      ];
      const mockCreatedTask: Task = createMockTask({
        TaskId: 't3',
        title: 'New LIT1',
        priority: 2,
        isMIT: false,
        shortCode: 'xyz9',
      });

      (shortCodeService.generateUniqueCode as jest.Mock).mockResolvedValue(mockShortCode);
      (smsFormatter.formatCreateSuccess as jest.Mock).mockReturnValue('Task created: xyz9 - New LIT1');

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockToken } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => mockExistingTasks } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => mockCreatedTask } as Response);

      // Act
      const result = await (service as any).handleCreate(
        { command: 'CREATE', title: 'New LIT1', priority: 5, smsKey: '1234' }, // LIT5
        'u1'
      );

      // Assert
      expect(result).toContain('xyz9');
      // Combined position should be: 1 MIT + min(5-1, 1) = 1 MIT + 1 = 2
    });

    it('should default to MIT1 when no priority specified', async () => {
      // Arrange
      const mockToken = { access_token: 'test-token', expires_in: 3600 };
      const mockShortCode = { code: 'def2', attempts: 1 };
      const mockCreatedTask: Task = createMockTask({
        title: 'Default task',
        shortCode: 'def2',
      });

      (shortCodeService.generateUniqueCode as jest.Mock).mockResolvedValue(mockShortCode);
      (smsFormatter.formatCreateSuccess as jest.Mock).mockReturnValue('Task created');

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockToken } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => mockCreatedTask } as Response);

      // Act
      const result = await (service as any).handleCreate(
        { command: 'CREATE', title: 'Default task', smsKey: '1234' }, // No priority
        'u1'
      );

      // Assert - should create MIT task
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/tasks',
        expect.objectContaining({
          body: expect.stringContaining('"isMIT":true'),
        })
      );
    });
  });

  describe('Handle CLOSE Command', () => {
    it('should close task by short code', async () => {
      // Arrange
      const mockToken = { access_token: 'test-token', expires_in: 3600 };
      const mockTask: Task = createMockTask({
        title: 'Task to close',
      });

      (shortCodeService.lookupTaskByCode as jest.Mock).mockResolvedValue('t1');
      (smsFormatter.formatCloseSuccess as jest.Mock).mockReturnValue('Task closed');

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockToken } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => mockTask } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);

      // Act
      const result = await (service as any).handleClose(
        { command: 'CLOSE', shortCode: 'abc1', smsKey: '1234' },
        'u1'
      );

      // Assert
      expect(result).toBe('Task closed');
      expect(shortCodeService.lookupTaskByCode).toHaveBeenCalledWith('abc1', 'u1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/tasks/t1',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"status":"Completed"'),
        })
      );
    });

    it('should return error when task code not found', async () => {
      // Arrange
      (shortCodeService.lookupTaskByCode as jest.Mock).mockResolvedValue(null);
      (smsFormatter.formatError as jest.Mock).mockReturnValue('Task code not found');

      // Act
      const result = await (service as any).handleClose(
        { command: 'CLOSE', shortCode: 'invalid', smsKey: '1234' },
        'u1'
      );

      // Assert
      expect(result).toBe('Task code not found');
      expect(smsFormatter.formatError).toHaveBeenCalledWith('Task code not found');
    });
  });

  describe('Handle EDIT Command', () => {
    it('should edit task title and priority', async () => {
      // Arrange
      const mockToken = { access_token: 'test-token', expires_in: 3600 };
      const mockUpdatedTask: Task = createMockTask({
        title: 'Updated title',
        priority: 2,
      });

      (shortCodeService.lookupTaskByCode as jest.Mock).mockResolvedValue('t1');
      (smsFormatter.formatEditSuccess as jest.Mock).mockReturnValue('Task updated');

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockToken } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => mockUpdatedTask } as Response);

      // Act
      const result = await (service as any).handleEdit(
        { command: 'EDIT', shortCode: 'abc1', title: 'Updated title', priority: 2, smsKey: '1234' },
        'u1'
      );

      // Assert
      expect(result).toBe('Task updated');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/tasks/t1',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"title":"Updated title"'),
        })
      );
    });
  });

  describe('Handle LIST Commands', () => {
    it('should list MIT tasks only', async () => {
      // Arrange
      const mockToken = { access_token: 'test-token', expires_in: 3600 };
      const mockMitTasks: Task[] = [
        createMockTask({ TaskId: 't1', title: 'MIT1', priority: 1 }),
        createMockTask({ TaskId: 't2', title: 'MIT2', priority: 2 }),
      ];

      (smsFormatter.formatListMitResponse as jest.Mock).mockReturnValue('MIT: MIT1, MIT2');

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockToken } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => mockMitTasks } as Response);

      // Act
      const result = await (service as any).handleListMit({ command: 'LIST_MIT', smsKey: '1234' }, 'u1');

      // Assert
      expect(result).toBe('MIT: MIT1, MIT2');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/tasks?isMIT=true&status=Open',
        expect.anything()
      );
    });

    it('should list all tasks (MIT and LIT)', async () => {
      // Arrange
      const mockToken = { access_token: 'test-token', expires_in: 3600 };
      const mockAllTasks: Task[] = [
        createMockTask({ TaskId: 't1', title: 'MIT1', priority: 1, isMIT: true }),
        createMockTask({ TaskId: 't2', title: 'LIT1', priority: 1, isMIT: false }),
      ];

      (smsFormatter.formatListResponse as jest.Mock).mockReturnValue('MIT: MIT1\nLIT: LIT1');

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockToken } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => mockAllTasks } as Response);

      // Act
      const result = await (service as any).handleListAll({ command: 'LIST_ALL', smsKey: '1234' }, 'u1');

      // Assert
      expect(result).toContain('MIT: MIT1');
      expect(result).toContain('LIT: LIT1');
    });
  });

  describe('Handle HELP Command', () => {
    it('should return help text', async () => {
      // Arrange
      (smsFormatter.formatHelp as jest.Mock).mockReturnValue('SMS Commands: ...');

      // Act
      const result = await (service as any).handleHelp({ command: 'HELP' });

      // Assert
      expect(result).toBe('SMS Commands: ...');
      expect(smsFormatter.formatHelp).toHaveBeenCalled();
    });
  });
});
