/**
 * Unit tests for SMS Formatter
 */

import { SmsFormatter } from '../sms.formatter';
import { Task } from '../../types';

describe('SmsFormatter', () => {
  let formatter: SmsFormatter;

  beforeEach(() => {
    formatter = new SmsFormatter();
  });

  const createMockTask = (overrides: Partial<Task> = {}): Task => ({
    TaskId: 'task123',
    UserId: 'user123',
    title: 'Test task',
    description: null,
    status: 'Open',
    creationDate: '2025-01-01T00:00:00Z',
    modifiedDate: '2025-01-01T00:00:00Z',
    completedDate: null,
    dueDate: null,
    priority: 0,
    isMIT: true,
    tags: [],
    shortCode: 'a2b3',
    ...overrides,
  });

  describe('formatListResponse', () => {
    it('should format empty lists', () => {
      const result = formatter.formatListResponse([], []);
      expect(result).toContain('MIT: None');
      expect(result).toContain('LIT: None');
    });

    it('should format MIT tasks only', () => {
      const mitTasks = [
        createMockTask({ title: 'Complete report', priority: 1, shortCode: 'a2b3' }),
        createMockTask({ title: 'Review PR', priority: 2, shortCode: 'c3d4' }),
      ];

      const result = formatter.formatListResponse(mitTasks, []);

      expect(result).toContain('MIT');
      expect(result).toContain('Complete report');
      expect(result).toContain('Review PR');
    });

    it('should format both MIT and LIT tasks', () => {
      const mitTasks = [
        createMockTask({ title: 'Important task', priority: 1, shortCode: 'a2b3' }),
      ];
      const litTasks = [
        createMockTask({ title: 'Minor task', priority: 0, shortCode: 'c3d4' }),
      ];

      const result = formatter.formatListResponse(mitTasks, litTasks);

      expect(result).toContain('Important task');
      expect(result).toContain('Minor task');
    });

    it('should stay under 250 character limit', () => {
      const mitTasks = Array.from({ length: 10 }, (_, i) =>
        createMockTask({
          title: `Task ${i + 1}`,
          priority: 1,
          shortCode: `t${i}ab`
        })
      );

      const result = formatter.formatListResponse(mitTasks, []);

      expect(result.length).toBeLessThanOrEqual(250);
    });
  });

  describe('formatListMitResponse', () => {
    it('should format MIT-only list', () => {
      const mitTasks = [
        createMockTask({ title: 'Task 1', priority: 1 }),
        createMockTask({ title: 'Task 2', priority: 2 }),
      ];

      const result = formatter.formatListMitResponse(mitTasks);

      expect(result).toContain('Task 1');
      expect(result).toContain('Task 2');
    });
  });

  describe('formatCreateSuccess', () => {
    it('should format task created with short code', () => {
      const task = createMockTask({
        title: 'New task',
        shortCode: 'a2b3',
        priority: 1
      });

      const result = formatter.formatCreateSuccess(task);

      expect(result).toContain('Task created');
      expect(result).toContain('a2b3');
      expect(result).toContain('New task');
    });

    it('should stay under 250 characters', () => {
      const task = createMockTask({
        title: 'Task with very long title that needs to be formatted properly',
        shortCode: 'a2b3'
      });

      const result = formatter.formatCreateSuccess(task);

      expect(result.length).toBeLessThanOrEqual(250);
    });
  });

  describe('formatCloseSuccess', () => {
    it('should format task closed message', () => {
      const result = formatter.formatCloseSuccess('a2b3', 'Test task');

      expect(result).toContain('a2b3');
      expect(result).toContain('closed');
    });

    it('should stay under 250 characters', () => {
      const result = formatter.formatCloseSuccess('a2b3', 'Test task');

      expect(result.length).toBeLessThanOrEqual(250);
    });
  });

  describe('formatEditSuccess', () => {
    it('should format task updated message', () => {
      const task = createMockTask({
        title: 'Updated task',
        shortCode: 'a2b3',
        priority: 2
      });

      const result = formatter.formatEditSuccess(task);

      expect(result).toContain('Updated');
      expect(result).toContain('a2b3');
    });

    it('should stay under 250 characters', () => {
      const task = createMockTask({
        title: 'Very long updated task title',
        shortCode: 'a2b3'
      });

      const result = formatter.formatEditSuccess(task);

      expect(result.length).toBeLessThanOrEqual(250);
    });
  });

  describe('formatError', () => {
    it('should format error message', () => {
      const result = formatter.formatError('Invalid command format');

      expect(result).toContain('Invalid command format');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should stay under 250 characters', () => {
      const longError = 'This is a very long error message that might exceed the character limit';
      const result = formatter.formatError(longError);

      expect(result.length).toBeLessThanOrEqual(250);
    });

    it('should truncate very long error messages', () => {
      const veryLongError = 'A'.repeat(300);
      const result = formatter.formatError(veryLongError);

      expect(result.length).toBeLessThanOrEqual(250);
    });
  });

  describe('formatHelp', () => {
    it('should format help message', () => {
      const result = formatter.formatHelp();

      expect(result).toContain('Commands');
      expect(result).toContain('CREATE');
      expect(result).toContain('CLOSE');
      expect(result).toContain('EDIT');
      expect(result).toContain('LIST');
    });

    it('should stay under 250 characters', () => {
      const result = formatter.formatHelp();

      expect(result.length).toBeLessThanOrEqual(250);
    });
  });
});
