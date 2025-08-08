import { TVAgentService } from '../tvagent.service';
import { createTask } from '../../db/task-operations';

// Mock the createTask function
jest.mock('../../db/task-operations', () => ({
  createTask: jest.fn(),
  updateTask: jest.fn(),
  deleteTask: jest.fn(),
  getTasksForUser: jest.fn()
}));

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }));
});

const mockCreateTask = createTask as jest.MockedFunction<typeof createTask>;

describe('TVAgent Multiple Task Creation', () => {
  let tvAgentService: TVAgentService;
  const userId = 'test-user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock environment variables
    process.env.OPENAI_API_KEY = 'test-key';
    tvAgentService = new TVAgentService();
  });

  describe('create_multiple_tasks function', () => {
    it('should create multiple tasks successfully', async () => {
      // Mock successful task creation
      mockCreateTask
        .mockResolvedValueOnce({
          TaskId: 'task-1',
          title: 'Buy groceries',
          status: 'Open',
          tags: ['Personal']
        } as any)
        .mockResolvedValueOnce({
          TaskId: 'task-2', 
          title: 'Call dentist',
          status: 'Open',
          tags: ['Personal', 'health']
        } as any);

      const result = await (tvAgentService as any).executeFunction(userId, 'create_multiple_tasks', {
        tasks: [
          {
            title: 'Buy groceries',
            tags: ['Personal']
          },
          {
            title: 'Call dentist',
            tags: ['Personal', 'health']
          }
        ]
      });

      expect(result.message).toContain('Successfully created 2 tasks');
      expect(result.message).toContain('Buy groceries');
      expect(result.message).toContain('Call dentist');
      expect(result.data.summary.total).toBe(2);
      expect(result.data.summary.successful).toBe(2);
      expect(result.data.summary.failed).toBe(0);
      expect(mockCreateTask).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures gracefully', async () => {
      // Mock one success, one failure
      mockCreateTask
        .mockResolvedValueOnce({
          TaskId: 'task-1',
          title: 'Buy groceries',
          status: 'Open',
          tags: ['Personal']
        } as any)
        .mockRejectedValueOnce(new Error('Validation failed'));

      const result = await (tvAgentService as any).executeFunction(userId, 'create_multiple_tasks', {
        tasks: [
          {
            title: 'Buy groceries',
            tags: ['Personal']
          },
          {
            title: 'Invalid task'
          }
        ]
      });

      expect(result.message).toContain('Successfully created 1 task');
      expect(result.message).toContain('Failed to create 1 task');
      expect(result.message).toContain('Buy groceries');
      expect(result.message).toContain('Invalid task');
      expect(result.data.summary.total).toBe(2);
      expect(result.data.summary.successful).toBe(1);
      expect(result.data.summary.failed).toBe(1);
    });

    it('should handle empty task list', async () => {
      const result = await (tvAgentService as any).executeFunction(userId, 'create_multiple_tasks', {
        tasks: []
      });

      expect(result.message).toBe('No tasks provided to create.');
      expect(result.data.summary.total).toBe(0);
      expect(result.data.summary.successful).toBe(0);
      expect(result.data.summary.failed).toBe(0);
      expect(mockCreateTask).not.toHaveBeenCalled();
    });

    it('should apply default values correctly', async () => {
      mockCreateTask.mockResolvedValueOnce({
        TaskId: 'task-1',
        title: 'Test task',
        status: 'Open',
        priority: 3,
        tags: []
      } as any);

      await (tvAgentService as any).executeFunction(userId, 'create_multiple_tasks', {
        tasks: [
          {
            title: 'Test task'
          }
        ]
      });

      expect(mockCreateTask).toHaveBeenCalledWith(userId, {
        title: 'Test task',
        description: undefined,
        dueDate: undefined,
        status: 'Open',
        isMIT: false,
        priority: 3,
        tags: []
      });
    });
  });
});