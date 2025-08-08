const mockSend = jest.fn();

const mockDynamoDBClient = { send: mockSend };

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn(() => mockDynamoDBClient),
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: mockSend,
    })),
  },
  PutCommand: jest.fn(input => ({ type: 'Put', input })),
  QueryCommand: jest.fn(input => ({ type: 'Query', input })),
  UpdateCommand: jest.fn(input => ({ type: 'Update', input })),
  DeleteCommand: jest.fn(input => ({ type: 'Delete', input })),
  GetCommand: jest.fn(input => ({ type: 'Get', input })),
}));

import {
  createPracticeInstance,
  getPracticeInstances,
  updatePracticeInstance,
  deletePracticeInstance,
  updateWeeklyScore,
  getWeeklyScores,
  getUserWellnessSettings,
  updateUserWellnessSettings,
  getWeekStart,
} from "../wellness-operations";
import { WellnessPractice } from "../../types";

describe("Wellness Operations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getWeekStart", () => {
    it("should return Monday for various days of the week", () => {
      // Test a Tuesday (2024-01-02)
      expect(getWeekStart(new Date('2024-01-02'))).toBe('2024-01-01');
      
      // Test a Sunday (2024-01-07)
      expect(getWeekStart(new Date('2024-01-07'))).toBe('2024-01-01');
      
      // Test a Monday (2024-01-01)
      expect(getWeekStart(new Date('2024-01-01'))).toBe('2024-01-01');
      
      // Test a Friday (2024-01-05)
      expect(getWeekStart(new Date('2024-01-05'))).toBe('2024-01-01');
    });
  });

  describe("createPracticeInstance", () => {
    it("should create a new practice instance successfully", async () => {
      const practiceData = {
        date: '2024-01-02',
        practice: 'Gratitude' as WellnessPractice,
      };

      // Mock successful creation and score update
      mockSend
        .mockResolvedValueOnce({}) // PutCommand for practice
        .mockResolvedValueOnce({ Items: [] }) // QueryCommand for score calculation
        .mockResolvedValueOnce({}); // PutCommand for score update

      const result = await createPracticeInstance('test-user-id', practiceData);

      expect(result).toBeDefined();
      expect(result.userId).toBe('test-user-id');
      expect(result.date).toBe('2024-01-02');
      expect(result.practice).toBe('Gratitude');
      expect(result.completed).toBe(false);
      expect(result.createdAt).toBeDefined();
      expect(result.PK).toBe('USER#test-user-id');
      expect(result.SK).toBe('PRACTICE#2024-01-02#Gratitude');
    });

    it("should throw error for invalid date format", async () => {
      const practiceData = {
        date: '01/02/2024', // Wrong format
        practice: 'Gratitude' as WellnessPractice,
      };

      await expect(createPracticeInstance('test-user-id', practiceData))
        .rejects.toThrow('Date must be in YYYY-MM-DD format');
    });

    it("should throw error when practice already exists", async () => {
      const practiceData = {
        date: '2024-01-02',
        practice: 'Gratitude' as WellnessPractice,
      };

      const error = new Error('Conditional check failed');
      error.name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValueOnce(error);

      await expect(createPracticeInstance('test-user-id', practiceData))
        .rejects.toThrow('Practice instance already exists for this date and practice');
    });

    it("should create practice with linked task", async () => {
      const practiceData = {
        date: '2024-01-02',
        practice: 'Meditation' as WellnessPractice,
        linkedTaskId: 'task-123',
      };

      mockSend
        .mockResolvedValueOnce({}) // PutCommand for practice
        .mockResolvedValueOnce({ Items: [] }) // QueryCommand for score calculation
        .mockResolvedValueOnce({}); // PutCommand for score update

      const result = await createPracticeInstance('test-user-id', practiceData);

      expect(result.linkedTaskId).toBe('task-123');
    });
  });

  describe("getPracticeInstances", () => {
    it("should return practice instances for date range", async () => {
      const mockPractices = [
        {
          PK: 'USER#test-user-id',
          SK: 'PRACTICE#2024-01-01#Gratitude',
          id: 'practice-1',
          practice: 'Gratitude',
          completed: true,
        },
        {
          PK: 'USER#test-user-id',
          SK: 'PRACTICE#2024-01-02#Meditation',
          id: 'practice-2',
          practice: 'Meditation',
          completed: false,
        },
      ];

      mockSend.mockResolvedValueOnce({ Items: mockPractices });

      const result = await getPracticeInstances('test-user-id', '2024-01-01', '2024-01-07');

      expect(result).toEqual(mockPractices);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Query',
          input: expect.objectContaining({
            KeyConditionExpression: 'PK = :pk AND SK BETWEEN :startSK AND :endSK',
            ExpressionAttributeValues: {
              ':pk': 'USER#test-user-id',
              ':startSK': 'PRACTICE#2024-01-01',
              ':endSK': 'PRACTICE#2024-01-07#~',
            },
          }),
        })
      );
    });

    it("should return empty array when no practices found", async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await getPracticeInstances('test-user-id', '2024-01-01', '2024-01-07');

      expect(result).toEqual([]);
    });
  });

  describe("updatePracticeInstance", () => {
    it("should update practice completion status", async () => {
      const updatedPractice = {
        PK: 'USER#test-user-id',
        SK: 'PRACTICE#2024-01-02#Gratitude',
        completed: true,
        completedAt: '2024-01-02T10:00:00.000Z',
      };

      mockSend
        .mockResolvedValueOnce({ Attributes: updatedPractice }) // UpdateCommand
        .mockResolvedValueOnce({ Items: [] }) // QueryCommand for score calculation
        .mockResolvedValueOnce({}); // PutCommand for score update

      const result = await updatePracticeInstance(
        'test-user-id',
        '2024-01-02',
        'Gratitude',
        { completed: true }
      );

      expect(result).toEqual(updatedPractice);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Update',
          input: expect.objectContaining({
            Key: {
              PK: 'USER#test-user-id',
              SK: 'PRACTICE#2024-01-02#Gratitude',
            },
            UpdateExpression: expect.stringContaining('completed = :completed'),
          }),
        })
      );
    });

    it("should update linked task ID", async () => {
      const updatedPractice = {
        PK: 'USER#test-user-id',
        SK: 'PRACTICE#2024-01-02#Meditation',
        linkedTaskId: 'new-task-123',
      };

      mockSend.mockResolvedValueOnce({ Attributes: updatedPractice });

      const result = await updatePracticeInstance(
        'test-user-id',
        '2024-01-02',
        'Meditation',
        { linkedTaskId: 'new-task-123' }
      );

      expect(result.linkedTaskId).toBe('new-task-123');
    });

    it("should clear completedAt when marking as incomplete", async () => {
      const updatedPractice = {
        PK: 'USER#test-user-id',
        SK: 'PRACTICE#2024-01-02#Gratitude',
        completed: false,
        completedAt: null,
      };

      mockSend
        .mockResolvedValueOnce({ Attributes: updatedPractice }) // UpdateCommand
        .mockResolvedValueOnce({ Items: [] }) // QueryCommand for score calculation
        .mockResolvedValueOnce({}); // PutCommand for score update

      const result = await updatePracticeInstance(
        'test-user-id',
        '2024-01-02',
        'Gratitude',
        { completed: false }
      );

      expect(result.completed).toBe(false);
      expect(result.completedAt).toBeNull();
    });
  });

  describe("deletePracticeInstance", () => {
    it("should delete practice instance successfully", async () => {
      mockSend
        .mockResolvedValueOnce({}) // DeleteCommand
        .mockResolvedValueOnce({ Items: [] }) // QueryCommand for score calculation
        .mockResolvedValueOnce({}); // PutCommand for score update

      const result = await deletePracticeInstance('test-user-id', '2024-01-02', 'Gratitude');

      expect(result).toEqual({
        success: true,
        message: 'Practice instance deleted successfully',
      });
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Delete',
          input: expect.objectContaining({
            Key: {
              PK: 'USER#test-user-id',
              SK: 'PRACTICE#2024-01-02#Gratitude',
            },
          }),
        })
      );
    });
  });

  describe("updateWeeklyScore", () => {
    it("should calculate and store correct score for mixed practices", async () => {
      const mockPractices = [
        // Daily practices (Gratitude: 2/7, Meditation: 1/7)
        { practice: 'Gratitude', completed: true },
        { practice: 'Gratitude', completed: true },
        { practice: 'Meditation', completed: true },
        // Weekly practices (Kindness: 1/2)
        { practice: 'Kindness', completed: true },
      ];

      mockSend
        .mockResolvedValueOnce({ Items: mockPractices }) // Query practices
        .mockResolvedValueOnce({}); // Put score

      await updateWeeklyScore('test-user-id', '2024-01-01');

      // Verify the score was stored correctly
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Put',
          input: expect.objectContaining({
            Item: expect.objectContaining({
              PK: 'USER#test-user-id',
              SK: 'SCORE#2024-01-01',
              userId: 'test-user-id',
              weekStart: '2024-01-01',
              score: expect.any(Number),
              breakdown: expect.any(Object)
            }),
          }),
        })
      );
    });

    it("should handle perfect score", async () => {
      const mockPractices = [
        // All daily practices completed
        ...Array(7).fill(null).map(() => ({ practice: 'Gratitude', completed: true })),
        ...Array(7).fill(null).map(() => ({ practice: 'Meditation', completed: true })),
        ...Array(7).fill(null).map(() => ({ practice: 'Savoring Reflection', completed: true })),
        // All weekly practices completed
        ...Array(2).fill(null).map(() => ({ practice: 'Kindness', completed: true })),
        ...Array(2).fill(null).map(() => ({ practice: 'Social Outreach', completed: true })),
        ...Array(2).fill(null).map(() => ({ practice: 'Novelty Challenge', completed: true })),
      ];

      mockSend
        .mockResolvedValueOnce({ Items: mockPractices })
        .mockResolvedValueOnce({});

      await updateWeeklyScore('test-user-id', '2024-01-01');

      // Verify perfect score was stored
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Put',
          input: expect.objectContaining({
            Item: expect.objectContaining({
              score: 100
            }),
          }),
        })
      );
    });

    it("should handle zero score", async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [] }) // No practices
        .mockResolvedValueOnce({});

      await updateWeeklyScore('test-user-id', '2024-01-01');

      // Verify zero score was stored
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Put',
          input: expect.objectContaining({
            Item: expect.objectContaining({
              score: 0
            }),
          }),
        })
      );
    });
  });

  describe("getWeeklyScores", () => {
    it("should return weekly scores for specified weeks", async () => {
      const mockScores = [
        {
          PK: 'USER#test-user-id',
          SK: 'SCORE#2024-01-01',
          weekStart: '2024-01-01',
          score: 75,
        },
        {
          PK: 'USER#test-user-id',
          SK: 'SCORE#2024-01-08',
          weekStart: '2024-01-08',
          score: 82,
        },
      ];

      mockSend.mockResolvedValueOnce({ Items: mockScores });

      const result = await getWeeklyScores('test-user-id', 4);

      expect(result).toEqual(mockScores);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Query',
          input: expect.objectContaining({
            KeyConditionExpression: 'PK = :pk AND SK BETWEEN :startSK AND :endSK',
          }),
        })
      );
    });
  });

  describe("getUserWellnessSettings", () => {
    it("should return existing settings", async () => {
      const existingSettings = {
        userId: 'test-user-id',
        enabledPractices: ['Gratitude', 'Meditation'],
        weeklyGoals: { 
          'Gratitude': 7, 
          'Meditation': 7,
          'Kindness': 2,
          'Social Outreach': 2,
          'Novelty Challenge': 2,
          'Savoring Reflection': 7
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValueOnce({ Item: existingSettings });

      const result = await getUserWellnessSettings('test-user-id');

      expect(result).toEqual(existingSettings);
    });

    it("should create default settings when none exist", async () => {
      mockSend
        .mockResolvedValueOnce({}) // GetCommand returns no item
        .mockResolvedValueOnce({}); // UpdateCommand for default settings

      const result = await getUserWellnessSettings('test-user-id');

      expect(result.userId).toBe('test-user-id');
      expect(result.enabledPractices).toEqual(['Gratitude', 'Meditation', 'Kindness', 'Social Outreach', 'Novelty Challenge', 'Savoring Reflection', 'Exercise']);
      expect(result.createdAt).toBeDefined();
    });
  });

  describe("updateUserWellnessSettings", () => {
    it("should update wellness settings", async () => {
      const updatedSettings = {
        userId: 'test-user-id',
        enabledPractices: ['Gratitude', 'Meditation'],
        weeklyGoals: { 
          'Gratitude': 5, 
          'Meditation': 5,
          'Kindness': 2,
          'Social Outreach': 2,
          'Novelty Challenge': 2,
          'Savoring Reflection': 7
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      mockSend.mockResolvedValueOnce({ Attributes: updatedSettings });

      const result = await updateUserWellnessSettings('test-user-id', {
        enabledPractices: ['Gratitude', 'Meditation'],
        weeklyGoals: { 
          'Gratitude': 5, 
          'Meditation': 5,
          'Kindness': 2,
          'Social Outreach': 2,
          'Novelty Challenge': 2,
          'Savoring Reflection': 7,
          'Exercise': 7
        },
      });

      expect(result).toEqual(updatedSettings);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Update',
          input: expect.objectContaining({
            Key: {
              PK: 'USER#test-user-id',
              SK: 'SETTINGS#WELLNESS',
            },
            UpdateExpression: expect.stringContaining('enabledPractices = :enabledPractices'),
          }),
        })
      );
    });
  });
}); 