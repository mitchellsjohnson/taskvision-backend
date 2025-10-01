import { TVAgentService } from '../tvagent.service';
import { createTask, updateTask, deleteTask, getTasksForUser } from '../../db/task-operations';
import { logAuditEvent } from '../../db/audit-operations';

// Mock dependencies
jest.mock('../../db/task-operations');
jest.mock('../../db/audit-operations');
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
const mockUpdateTask = updateTask as jest.MockedFunction<typeof updateTask>;
const mockDeleteTask = deleteTask as jest.MockedFunction<typeof deleteTask>;
const mockGetTasksForUser = getTasksForUser as jest.MockedFunction<typeof getTasksForUser>;
const mockLogAuditEvent = logAuditEvent as jest.MockedFunction<typeof logAuditEvent>;

describe('TVAgentService', () => {
  let tvAgentService: TVAgentService;
  const userId = 'test-user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock environment variables
    process.env.OPENAI_API_KEY = 'test-key';
    tvAgentService = new TVAgentService();
  });

  afterEach(() => {
    // Clean up any intervals
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should throw error if OPENAI_API_KEY is not provided', () => {
      delete process.env.OPENAI_API_KEY;
      expect(() => new TVAgentService()).toThrow('OPENAI_API_KEY environment variable is required');
    });

    it('should initialize with API key', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      expect(() => new TVAgentService()).not.toThrow();
    });
  });

  describe('suggest_next_action function', () => {
    it('should suggest MIT focus when no MITs exist', async () => {
      mockGetTasksForUser
        .mockResolvedValueOnce([]) // No active tasks
        .mockResolvedValueOnce([]); // No completed tasks

      const result = await (tvAgentService as any).executeFunction(userId, 'suggest_next_action', {
        suggestion_type: 'mit_focus',
        reasoning: 'You need to focus'
      });

      expect(result.message).toContain('No MITs set yet');
      expect(result.data.mitCount).toBe(0);
      expect(result.data.totalTasks).toBe(0);
    });

    it('should suggest MIT focus with existing MITs', async () => {
      const mockTasks = [
        { TaskId: '1', title: 'Important Task', isMIT: true, status: 'Open' },
        { TaskId: '2', title: 'Regular Task', isMIT: false, status: 'Open' }
      ];
      
      mockGetTasksForUser
        .mockResolvedValueOnce(mockTasks) // Active tasks
        .mockResolvedValueOnce([]); // No completed tasks

      const result = await (tvAgentService as any).executeFunction(userId, 'suggest_next_action', {
        suggestion_type: 'mit_focus',
        reasoning: 'Focus on your priorities'
      });

      expect(result.message).toContain('You have 1 MIT(s) active');
      expect(result.message).toContain('Important Task');
      expect(result.data.mitCount).toBe(1);
      expect(result.data.totalTasks).toBe(2);
    });

    it('should handle quick_win suggestion', async () => {
      mockGetTasksForUser
        .mockResolvedValueOnce([]) // No active tasks
        .mockResolvedValueOnce([]); // No completed tasks

      const result = await (tvAgentService as any).executeFunction(userId, 'suggest_next_action', {
        suggestion_type: 'quick_win',
        reasoning: 'Build momentum',
        suggested_tasks: ['Email replies', 'File documents']
      });

      expect(result.message).toContain('⚡');
      expect(result.message).toContain('Build momentum');
      expect(result.message).toContain('Email replies, File documents');
    });

    it('should handle self_care suggestion', async () => {
      mockGetTasksForUser
        .mockResolvedValueOnce([]) // No active tasks
        .mockResolvedValueOnce([]); // No completed tasks

      const result = await (tvAgentService as any).executeFunction(userId, 'suggest_next_action', {
        suggestion_type: 'self_care',
        reasoning: 'You need a break'
      });

      expect(result.message).toContain('🧘');
      expect(result.message).toContain('yoga');
      expect(result.message).toContain('well-being fuels your productivity');
    });

    it('should handle errors gracefully', async () => {
      mockGetTasksForUser.mockRejectedValue(new Error('Database error'));

      const result = await (tvAgentService as any).executeFunction(userId, 'suggest_next_action', {
        suggestion_type: 'mit_focus',
        reasoning: 'Focus time'
      });

      expect(result.message).toContain('focus on your most important task first');
      expect(result.message).toContain('Focus time');
    });
  });

  describe('ask_for_clarification function', () => {
    it('should return the question as message', async () => {
      const result = await (tvAgentService as any).executeFunction(userId, 'ask_for_clarification', {
        question: 'What did you mean by urgent?'
      });

      expect(result.message).toBe('What did you mean by urgent?');
    });
  });

  describe('create_task function', () => {
    it('should create a task successfully', async () => {
      const mockTask = {
        TaskId: 'task-123',
        title: 'New Task',
        description: 'Task description',
        status: 'Open'
      };

      mockCreateTask.mockResolvedValue(mockTask as any);

      const result = await (tvAgentService as any).executeFunction(userId, 'create_task', {
        title: 'New Task',
        description: 'Task description',
        dueDate: '2024-12-31',
        status: 'Open',
        isMIT: true,
        priority: 1,
        tags: ['work']
      });

      expect(result.message).toBe('Task "New Task" created successfully!');
      expect(result.data).toEqual(mockTask);
      expect(mockCreateTask).toHaveBeenCalledWith(userId, {
        title: 'New Task',
        description: 'Task description',
        dueDate: '2024-12-31',
        status: 'Open',
        isMIT: true,
        priority: 1,
        tags: ['work']
      });
    });

    it('should handle task creation errors', async () => {
      mockCreateTask.mockRejectedValue(new Error('Creation failed'));

      const result = await (tvAgentService as any).executeFunction(userId, 'create_task', {
        title: 'New Task'
      });

      expect(result.message).toBe('Failed to create task: Creation failed');
    });

    it('should apply default values', async () => {
      const mockTask = { TaskId: 'task-123', title: 'Simple Task' };
      mockCreateTask.mockResolvedValue(mockTask as any);

      await (tvAgentService as any).executeFunction(userId, 'create_task', {
        title: 'Simple Task'
      });

      expect(mockCreateTask).toHaveBeenCalledWith(userId, {
        title: 'Simple Task',
        description: undefined,
        dueDate: undefined,
        status: undefined,
        isMIT: false,
        priority: 3,
        tags: []
      });
    });
  });

  describe('update_task function', () => {
    it('should update a task successfully', async () => {
      const mockUpdatedTask = {
        TaskId: 'task-123',
        title: 'Updated Task',
        status: 'Completed'
      };

      mockUpdateTask.mockResolvedValue(mockUpdatedTask as any);

      const result = await (tvAgentService as any).executeFunction(userId, 'update_task', {
        taskId: 'task-123',
        title: 'Updated Task',
        status: 'Completed'
      });

      expect(result.message).toBe('Task updated successfully!');
      expect(result.data).toEqual(mockUpdatedTask);
      expect(mockUpdateTask).toHaveBeenCalledWith(userId, 'task-123', {
        title: 'Updated Task',
        status: 'Completed',
        completedDate: expect.any(String)
      });
    });

    it('should handle task not found', async () => {
      mockUpdateTask.mockResolvedValue(null);

      const result = await (tvAgentService as any).executeFunction(userId, 'update_task', {
        taskId: 'nonexistent',
        title: 'Updated Task'
      });

      expect(result.message).toBe('Task not found or could not be updated.');
    });

    it('should handle update errors', async () => {
      mockUpdateTask.mockRejectedValue(new Error('Update failed'));

      const result = await (tvAgentService as any).executeFunction(userId, 'update_task', {
        taskId: 'task-123',
        title: 'Updated Task'
      });

      expect(result.message).toBe('Failed to update task: Update failed');
    });
  });

  describe('delete_task function', () => {
    it('should delete a task successfully', async () => {
      // The service code checks if (success), so we need to return a truthy value
      mockDeleteTask.mockResolvedValue({ success: true, message: "Task deleted successfully" } as any);

      const result = await (tvAgentService as any).executeFunction(userId, 'delete_task', {
        taskId: 'task-123'
      });

      expect(result.message).toBe('Task deleted successfully!');
      expect(mockDeleteTask).toHaveBeenCalledWith(userId, 'task-123');
    });

    it('should handle delete errors', async () => {
      mockDeleteTask.mockRejectedValue(new Error('Delete failed'));

      const result = await (tvAgentService as any).executeFunction(userId, 'delete_task', {
        taskId: 'task-123'
      });

      expect(result.message).toBe('Failed to delete task: Delete failed');
    });
  });

  describe('get_tasks function', () => {
    it('should return tasks with encouraging message', async () => {
      const mockTasks = [
        { TaskId: '1', title: 'Task 1', status: 'Open', isMIT: true },
        { TaskId: '2', title: 'Task 2', status: 'Open', isMIT: false }
      ];

      mockGetTasksForUser.mockResolvedValue(mockTasks as any);

      const result = await (tvAgentService as any).executeFunction(userId, 'get_tasks', {
        status: ['Open']
      });

      expect(result.message).toContain('Your top 1 MIT');
      expect(result.message).toContain('Task 1');
      expect(result.data).toEqual(mockTasks);
    });

    it('should handle no tasks found', async () => {
      mockGetTasksForUser.mockResolvedValue([]);

      const result = await (tvAgentService as any).executeFunction(userId, 'get_tasks', {});

      expect(result.message).toContain("You're all caught up!");
      expect(result.data).toEqual([]);
    });

    it('should handle overdue tasks', async () => {
      mockGetTasksForUser.mockResolvedValue([]);

      const result = await (tvAgentService as any).executeFunction(userId, 'get_tasks', {
        dateFilter: 'pastDue'
      });

      expect(result.message).toContain("Great news! You don't have any overdue tasks");
      expect(result.data).toEqual([]);
    });

    it('should handle tasks due today', async () => {
      const mockTasks = [
        { TaskId: '1', title: 'Today Task', status: 'Open', isMIT: true, dueDate: '2024-01-01' }
      ];

      mockGetTasksForUser.mockResolvedValue(mockTasks as any);

      const result = await (tvAgentService as any).executeFunction(userId, 'get_tasks', {
        dateFilter: 'dueToday'
      });

      expect(result.message).toContain('You have 1 task due today');
      expect(result.message).toContain('Your MITs for today: **Today Task**');
      expect(result.data).toEqual(mockTasks);
    });

    it('should handle errors gracefully', async () => {
      mockGetTasksForUser.mockRejectedValue(new Error('Database error'));

      const result = await (tvAgentService as any).executeFunction(userId, 'get_tasks', {});

      expect(result.message).toContain("I'm having trouble fetching your tasks");
    });
  });

  describe('unknown function', () => {
    it('should handle unknown function names', async () => {
      const result = await (tvAgentService as any).executeFunction(userId, 'unknown_function', {});

      expect(result.message).toBe('Unknown function: unknown_function');
    });
  });
});
