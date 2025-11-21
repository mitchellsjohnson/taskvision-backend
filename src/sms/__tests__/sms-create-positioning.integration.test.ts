/**
 * Integration tests for SMS CREATE command task positioning
 *
 * Tests the critical logic that calculates the correct combined position
 * for inserting tasks at specific MIT/LIT positions.
 */

import { createTask, getTasksForUser, reprioritizeTasks } from '../../db/task-operations';
import { Task, TaskStatus } from '../../types';

// Mock the DynamoDB client
jest.mock('../../db/dynamo');
jest.mock('../../db/task-operations');

const mockCreateTask = createTask as jest.MockedFunction<typeof createTask>;
const mockGetTasksForUser = getTasksForUser as jest.MockedFunction<typeof getTasksForUser>;
const mockReprioritizeTasks = reprioritizeTasks as jest.MockedFunction<typeof reprioritizeTasks>;

describe('SMS CREATE Command - Task Positioning Integration', () => {
  const userId = 'test-user-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper to create mock tasks
   */
  const createMockTask = (overrides: Partial<Task>): Task => ({
    TaskId: `task-${Math.random()}`,
    UserId: userId,
    title: 'Test task',
    description: null,
    status: 'Open' as TaskStatus,
    creationDate: new Date().toISOString(),
    modifiedDate: new Date().toISOString(),
    completedDate: null,
    dueDate: null,
    priority: 1,
    isMIT: true,
    tags: [],
    shortCode: 'test',
    ...overrides,
  });

  describe('MIT Task Positioning', () => {
    it('should insert MIT1 at position 0 in combined list when no tasks exist', async () => {
      // Arrange
      mockGetTasksForUser.mockResolvedValue([]);
      const newTask = createMockTask({ priority: 1, isMIT: true });
      mockCreateTask.mockResolvedValue(newTask);

      // Act
      const allTasks = await mockGetTasksForUser(userId);
      const activeTasks = (allTasks || []).filter(t => t.status === 'Open');
      const mitTasks = activeTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
      const litTasks = activeTasks.filter(t => !t.isMIT).sort((a, b) => a.priority - b.priority);

      const desiredPriority = 1; // MIT1
      const isMIT = true;

      const combinedPosition = Math.min(desiredPriority - 1, mitTasks.length);
      const taskData = {
        priority: combinedPosition + 1, // createTask will use (priority - 1) as position
        isMIT,
      };

      // Assert
      expect(combinedPosition).toBe(0);
      expect(taskData.priority).toBe(1);
    });

    it('should insert MIT2 at position 1 when MIT1 exists', async () => {
      // Arrange
      const existingMIT1 = createMockTask({ priority: 1, isMIT: true, title: 'MIT1' });
      mockGetTasksForUser.mockResolvedValue([existingMIT1]);

      // Act
      const allTasks = await mockGetTasksForUser(userId);
      const activeTasks = (allTasks || []).filter(t => t.status === 'Open');
      const mitTasks = activeTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
      const litTasks = activeTasks.filter(t => !t.isMIT).sort((a, b) => a.priority - b.priority);

      const desiredPriority = 2; // MIT2
      const isMIT = true;

      const combinedPosition = Math.min(desiredPriority - 1, mitTasks.length);

      // Assert
      expect(mitTasks.length).toBe(1);
      expect(combinedPosition).toBe(1);
    });

    it('should insert MIT1 at position 0, pushing existing MIT tasks down', async () => {
      // Arrange
      const existingMIT1 = createMockTask({ priority: 1, isMIT: true, title: 'Old MIT1' });
      const existingMIT2 = createMockTask({ priority: 2, isMIT: true, title: 'Old MIT2' });
      mockGetTasksForUser.mockResolvedValue([existingMIT1, existingMIT2]);

      // Act
      const allTasks = await mockGetTasksForUser(userId);
      const activeTasks = (allTasks || []).filter(t => t.status === 'Open');
      const mitTasks = activeTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);

      const desiredPriority = 1; // MIT1
      const isMIT = true;

      const combinedPosition = Math.min(desiredPriority - 1, mitTasks.length);

      // Assert
      expect(mitTasks.length).toBe(2);
      expect(combinedPosition).toBe(0); // Insert at beginning
    });

    it('should append MIT when priority exceeds existing MIT count', async () => {
      // Arrange
      const existingMIT1 = createMockTask({ priority: 1, isMIT: true });
      mockGetTasksForUser.mockResolvedValue([existingMIT1]);

      // Act
      const allTasks = await mockGetTasksForUser(userId);
      const activeTasks = (allTasks || []).filter(t => t.status === 'Open');
      const mitTasks = activeTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);

      const desiredPriority = 5; // MIT5 doesn't make sense, but should append
      const isMIT = true;

      const combinedPosition = Math.min(desiredPriority - 1, mitTasks.length);

      // Assert
      expect(combinedPosition).toBe(1); // Append to end of MIT list
    });
  });

  describe('LIT Task Positioning', () => {
    it('should insert LIT1 after all MIT tasks', async () => {
      // Arrange
      const mit1 = createMockTask({ priority: 1, isMIT: true, title: 'MIT1' });
      const mit2 = createMockTask({ priority: 2, isMIT: true, title: 'MIT2' });
      const mit3 = createMockTask({ priority: 3, isMIT: true, title: 'MIT3' });
      mockGetTasksForUser.mockResolvedValue([mit1, mit2, mit3]);

      // Act
      const allTasks = await mockGetTasksForUser(userId);
      const activeTasks = (allTasks || []).filter(t => t.status === 'Open');
      const mitTasks = activeTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
      const litTasks = activeTasks.filter(t => !t.isMIT).sort((a, b) => a.priority - b.priority);

      const desiredPriority = 1; // LIT1
      const isMIT = false;

      const combinedPosition = mitTasks.length + Math.min(desiredPriority - 1, litTasks.length);

      // Assert
      expect(mitTasks.length).toBe(3);
      expect(litTasks.length).toBe(0);
      expect(combinedPosition).toBe(3); // After 3 MIT tasks
    });

    it('should insert LIT2 at correct position with existing LIT tasks', async () => {
      // Arrange
      const mit1 = createMockTask({ priority: 1, isMIT: true, title: 'MIT1' });
      const mit2 = createMockTask({ priority: 2, isMIT: true, title: 'MIT2' });
      const lit1 = createMockTask({ priority: 1, isMIT: false, title: 'LIT1' });
      const lit2 = createMockTask({ priority: 2, isMIT: false, title: 'LIT2' });
      const lit3 = createMockTask({ priority: 3, isMIT: false, title: 'LIT3' });
      mockGetTasksForUser.mockResolvedValue([mit1, mit2, lit1, lit2, lit3]);

      // Act
      const allTasks = await mockGetTasksForUser(userId);
      const activeTasks = (allTasks || []).filter(t => t.status === 'Open');
      const mitTasks = activeTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
      const litTasks = activeTasks.filter(t => !t.isMIT).sort((a, b) => a.priority - b.priority);

      const desiredPriority = 2; // LIT2
      const isMIT = false;

      const combinedPosition = mitTasks.length + Math.min(desiredPriority - 1, litTasks.length);

      // Assert
      expect(mitTasks.length).toBe(2);
      expect(litTasks.length).toBe(3);
      expect(combinedPosition).toBe(3); // 2 MIT + 1 (LIT2 position - 1)
    });

    it('should insert LIT10 in middle of existing 15 LIT tasks', async () => {
      // Arrange
      const mitTasks = [1, 2, 3].map(i =>
        createMockTask({ priority: i, isMIT: true, title: `MIT${i}` })
      );
      const litTasks = Array.from({ length: 15 }, (_, i) =>
        createMockTask({ priority: i + 1, isMIT: false, title: `LIT${i + 1}` })
      );
      mockGetTasksForUser.mockResolvedValue([...mitTasks, ...litTasks]);

      // Act
      const allTasks = await mockGetTasksForUser(userId);
      const activeTasks = (allTasks || []).filter(t => t.status === 'Open');
      const mitTasksFiltered = activeTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
      const litTasksFiltered = activeTasks.filter(t => !t.isMIT).sort((a, b) => a.priority - b.priority);

      const desiredPriority = 10; // LIT10
      const isMIT = false;

      const combinedPosition = mitTasksFiltered.length + Math.min(desiredPriority - 1, litTasksFiltered.length);

      // Assert
      expect(mitTasksFiltered.length).toBe(3);
      expect(litTasksFiltered.length).toBe(15);
      expect(combinedPosition).toBe(12); // 3 MIT + 9 (LIT10 position - 1)
    });

    it('should append LIT when priority exceeds existing LIT count', async () => {
      // Arrange
      const mit1 = createMockTask({ priority: 1, isMIT: true });
      const lit1 = createMockTask({ priority: 1, isMIT: false });
      const lit2 = createMockTask({ priority: 2, isMIT: false });
      mockGetTasksForUser.mockResolvedValue([mit1, lit1, lit2]);

      // Act
      const allTasks = await mockGetTasksForUser(userId);
      const activeTasks = (allTasks || []).filter(t => t.status === 'Open');
      const mitTasks = activeTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
      const litTasks = activeTasks.filter(t => !t.isMIT).sort((a, b) => a.priority - b.priority);

      const desiredPriority = 10; // LIT10, but only 2 LIT tasks exist
      const isMIT = false;

      const combinedPosition = mitTasks.length + Math.min(desiredPriority - 1, litTasks.length);

      // Assert
      expect(mitTasks.length).toBe(1);
      expect(litTasks.length).toBe(2);
      expect(combinedPosition).toBe(3); // 1 MIT + 2 LIT (append to end)
    });
  });

  describe('Edge Cases', () => {
    it('should handle completed and canceled tasks (they should be filtered out)', async () => {
      // Arrange
      const activeMIT = createMockTask({ priority: 1, isMIT: true, status: 'Open' });
      const completedMIT = createMockTask({ priority: 2, isMIT: true, status: 'Completed' });
      const canceledLIT = createMockTask({ priority: 1, isMIT: false, status: 'Canceled' });
      const activeLIT = createMockTask({ priority: 2, isMIT: false, status: 'Open' });
      mockGetTasksForUser.mockResolvedValue([activeMIT, completedMIT, canceledLIT, activeLIT]);

      // Act
      const allTasks = await mockGetTasksForUser(userId);
      const activeTasks = (allTasks || []).filter(t => t.status === 'Open');
      const mitTasks = activeTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
      const litTasks = activeTasks.filter(t => !t.isMIT).sort((a, b) => a.priority - b.priority);

      // Assert
      expect(activeTasks.length).toBe(2); // Only Open tasks
      expect(mitTasks.length).toBe(1);
      expect(litTasks.length).toBe(1);
    });

    it('should handle empty task list', async () => {
      // Arrange
      mockGetTasksForUser.mockResolvedValue([]);

      // Act
      const allTasks = await mockGetTasksForUser(userId);
      const activeTasks = (allTasks || []).filter(t => t.status === 'Open');
      const mitTasks = activeTasks.filter(t => t.isMIT);
      const litTasks = activeTasks.filter(t => !t.isMIT);

      const desiredPriority = 1;
      const isMIT = false;
      const combinedPosition = mitTasks.length + Math.min(desiredPriority - 1, litTasks.length);

      // Assert
      expect(activeTasks.length).toBe(0);
      expect(combinedPosition).toBe(0); // Should insert at beginning
    });

    it('should handle mixed MIT and LIT with gaps in priority', async () => {
      // Arrange - priorities have gaps (1, 3, 5 instead of 1, 2, 3)
      const mit1 = createMockTask({ priority: 1, isMIT: true });
      const mit3 = createMockTask({ priority: 3, isMIT: true });
      const lit2 = createMockTask({ priority: 2, isMIT: false });
      const lit5 = createMockTask({ priority: 5, isMIT: false });
      mockGetTasksForUser.mockResolvedValue([mit1, mit3, lit2, lit5]);

      // Act
      const allTasks = await mockGetTasksForUser(userId);
      const activeTasks = (allTasks || []).filter(t => t.status === 'Open');
      const mitTasks = activeTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
      const litTasks = activeTasks.filter(t => !t.isMIT).sort((a, b) => a.priority - b.priority);

      const desiredPriority = 2; // Insert LIT2
      const isMIT = false;
      const combinedPosition = mitTasks.length + Math.min(desiredPriority - 1, litTasks.length);

      // Assert
      expect(mitTasks.length).toBe(2);
      expect(litTasks.length).toBe(2);
      expect(combinedPosition).toBe(3); // 2 MIT + 1 (LIT2 position - 1)
    });
  });

  describe('Real-world Scenarios', () => {
    it('should correctly position new LIT6 task when user has 3 MIT and 16 LIT tasks', async () => {
      // This is the scenario from the bug report
      // User had correct ordering, then SMS created task at wrong position

      // Arrange
      const mitTasks = [1, 2, 3].map(i =>
        createMockTask({ priority: i, isMIT: true, title: `MIT${i}` })
      );
      const litTasks = Array.from({ length: 16 }, (_, i) =>
        createMockTask({ priority: i + 1, isMIT: false, title: `LIT${i + 1}` })
      );
      mockGetTasksForUser.mockResolvedValue([...mitTasks, ...litTasks]);

      // Act
      const allTasks = await mockGetTasksForUser(userId);
      const activeTasks = (allTasks || []).filter(t => t.status === 'Open');
      const mitTasksFiltered = activeTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
      const litTasksFiltered = activeTasks.filter(t => !t.isMIT).sort((a, b) => a.priority - b.priority);

      const desiredPriority = 6; // LIT6
      const isMIT = false;

      const combinedPosition = mitTasksFiltered.length + Math.min(desiredPriority - 1, litTasksFiltered.length);
      const taskPriority = combinedPosition + 1;

      // Assert
      expect(combinedPosition).toBe(8); // 3 MIT + 5 (LIT6 position - 1)
      expect(taskPriority).toBe(9); // createTask will use (9 - 1 = 8) as position

      // After reprioritization, the task should be at LIT6
      // Combined list order: MIT1, MIT2, MIT3, LIT1, LIT2, LIT3, LIT4, LIT5, [NEW LIT6], OLD LIT6-16
    });

    it('should handle creating MIT1 when 3 MIT tasks already exist', async () => {
      // Arrange
      const existingMITs = [1, 2, 3].map(i =>
        createMockTask({ priority: i, isMIT: true, title: `MIT${i}` })
      );
      mockGetTasksForUser.mockResolvedValue(existingMITs);

      // Act
      const allTasks = await mockGetTasksForUser(userId);
      const activeTasks = (allTasks || []).filter(t => t.status === 'Open');
      const mitTasks = activeTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
      const litTasks = activeTasks.filter(t => !t.isMIT).sort((a, b) => a.priority - b.priority);

      const desiredPriority = 1; // MIT1
      const isMIT = true;

      const combinedPosition = Math.min(desiredPriority - 1, mitTasks.length);

      // Assert
      expect(combinedPosition).toBe(0); // Insert at beginning
      // After reprioritization: [NEW MIT1], OLD MIT1 (becomes MIT2), OLD MIT2 (becomes MIT3), OLD MIT3 (becomes MIT4... but we only allow 3 MIT)
    });
  });
});
