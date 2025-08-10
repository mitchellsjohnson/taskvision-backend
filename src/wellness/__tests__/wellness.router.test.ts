import request from 'supertest';
import express from 'express';
import wellnessRouter from '../wellness.router';
import * as WellnessOperations from '../wellness-operations';

// Mock the middleware
jest.mock('../../middleware/auth0.middleware', () => ({
  validateAccessToken: jest.fn((req, res, next) => {
    req.auth = { payload: { sub: 'test-user-id' } };
    next();
  }),
}));

jest.mock('../../middleware/get-user-id', () => ({
  getUserId: jest.fn(() => 'test-user-id'),
}));

// Mock wellness operations
jest.mock('../wellness-operations');

const mockedWellnessOperations = WellnessOperations as jest.Mocked<typeof WellnessOperations>;

const app = express();
app.use(express.json());
app.use('/api/wellness', wellnessRouter);

describe('Wellness Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/wellness/practices', () => {
    it('should return practice instances for valid date range', async () => {
      const mockPractices = [
        {
          id: 'practice-1',
          practice: 'Gratitude',
          completed: true,
          date: '2024-01-01',
        },
      ];

      mockedWellnessOperations.getPracticeInstances.mockResolvedValue(mockPractices as any);

      const response = await request(app)
        .get('/api/wellness/practices')
        .query({ startDate: '2024-01-01', endDate: '2024-01-07' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockPractices);
      expect(mockedWellnessOperations.getPracticeInstances).toHaveBeenCalledWith(
        'test-user-id',
        '2024-01-01',
        '2024-01-07'
      );
    });

    it('should return 400 for missing date parameters', async () => {
      const response = await request(app)
        .get('/api/wellness/practices')
        .query({ startDate: '2024-01-01' }); // Missing endDate

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('startDate and endDate query parameters are required');
    });

    it('should return 400 for invalid date format', async () => {
      const response = await request(app)
        .get('/api/wellness/practices')
        .query({ startDate: '01/01/2024', endDate: '2024-01-07' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Dates must be in YYYY-MM-DD format');
    });
  });

  describe('POST /api/wellness/practices', () => {
    it('should create a new practice instance', async () => {
      const newPractice = {
        id: 'practice-1',
        practice: 'Gratitude',
        date: '2024-01-01',
        completed: false,
      };

      mockedWellnessOperations.createPracticeInstance.mockResolvedValue(newPractice as any);

      const response = await request(app)
        .post('/api/wellness/practices')
        .send({
          date: '2024-01-01',
          practice: 'Gratitude',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(newPractice);
      expect(mockedWellnessOperations.createPracticeInstance).toHaveBeenCalledWith(
        'test-user-id',
        {
          date: '2024-01-01',
          practice: 'Gratitude',
          linkedTaskId: undefined,
        }
      );
    });

    it('should create practice with linked task', async () => {
      const newPractice = {
        id: 'practice-1',
        practice: 'Meditation',
        date: '2024-01-01',
        linkedTaskId: 'task-123',
        completed: false,
      };

      mockedWellnessOperations.createPracticeInstance.mockResolvedValue(newPractice as any);

      const response = await request(app)
        .post('/api/wellness/practices')
        .send({
          date: '2024-01-01',
          practice: 'Meditation',
          linkedTaskId: 'task-123',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.linkedTaskId).toBe('task-123');
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/wellness/practices')
        .send({
          date: '2024-01-01',
          // Missing practice
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('date and practice are required');
    });

    it('should return 400 for invalid practice type', async () => {
      const response = await request(app)
        .post('/api/wellness/practices')
        .send({
          date: '2024-01-01',
          practice: 'InvalidPractice',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid practice');
    });

    it('should return 409 for duplicate practice', async () => {
      const error = new Error('Practice instance already exists for this date and practice');
      mockedWellnessOperations.createPracticeInstance.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/wellness/practices')
        .send({
          date: '2024-01-01',
          practice: 'Gratitude',
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });

    it('should return 400 for invalid date format error', async () => {
      const error = new Error('Date must be in YYYY-MM-DD format');
      mockedWellnessOperations.createPracticeInstance.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/wellness/practices')
        .send({
          date: '01/01/2024',
          practice: 'Gratitude',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Date must be');
    });
  });

  describe('PUT /api/wellness/practices/:date/:practice', () => {
    it('should update practice completion status', async () => {
      const updatedPractice = {
        id: 'practice-1',
        practice: 'Gratitude',
        completed: true,
        completedAt: '2024-01-01T10:00:00.000Z',
      };

      mockedWellnessOperations.updatePracticeInstance.mockResolvedValue(updatedPractice as any);

      const response = await request(app)
        .put('/api/wellness/practices/2024-01-01/Gratitude')
        .send({ completed: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(updatedPractice);
      expect(mockedWellnessOperations.updatePracticeInstance).toHaveBeenCalledWith(
        'test-user-id',
        '2024-01-01',
        'Gratitude',
        { completed: true, linkedTaskId: undefined, journal: undefined }
      );
    });

    it('should update linked task ID', async () => {
      const updatedPractice = {
        id: 'practice-1',
        practice: 'Meditation',
        linkedTaskId: 'new-task-456',
      };

      mockedWellnessOperations.updatePracticeInstance.mockResolvedValue(updatedPractice as any);

      const response = await request(app)
        .put('/api/wellness/practices/2024-01-01/Meditation')
        .send({ linkedTaskId: 'new-task-456' });

      expect(response.status).toBe(200);
      expect(response.body.data.linkedTaskId).toBe('new-task-456');
    });

    it('should update journal entry', async () => {
      const updatedPractice = {
        id: 'practice-1',
        practice: 'Gratitude',
        journal: 'Grateful for sunny weather today',
      };

      mockedWellnessOperations.updatePracticeInstance.mockResolvedValue(updatedPractice as any);

      const response = await request(app)
        .put('/api/wellness/practices/2024-01-01/Gratitude')
        .send({ journal: 'Grateful for sunny weather today' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(updatedPractice);
      expect(mockedWellnessOperations.updatePracticeInstance).toHaveBeenCalledWith(
        'test-user-id',
        '2024-01-01',
        'Gratitude',
        { completed: undefined, linkedTaskId: undefined, journal: 'Grateful for sunny weather today' }
      );
    });

    it('should return 400 for invalid practice type', async () => {
      const response = await request(app)
        .put('/api/wellness/practices/2024-01-01/InvalidPractice')
        .send({ completed: true });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid practice');
    });

    it('should return 400 when no fields provided', async () => {
      const response = await request(app)
        .put('/api/wellness/practices/2024-01-01/Gratitude')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('At least one field');
    });
  });

  describe('DELETE /api/wellness/practices/:date/:practice', () => {
    it('should delete practice instance', async () => {
      mockedWellnessOperations.deletePracticeInstance.mockResolvedValue({
        success: true,
        message: 'Deleted successfully',
      });

      const response = await request(app)
        .delete('/api/wellness/practices/2024-01-01/Gratitude');

      expect(response.status).toBe(204);
      expect(mockedWellnessOperations.deletePracticeInstance).toHaveBeenCalledWith(
        'test-user-id',
        '2024-01-01',
        'Gratitude'
      );
    });

    it('should return 400 for invalid practice type', async () => {
      const response = await request(app)
        .delete('/api/wellness/practices/2024-01-01/InvalidPractice');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid practice');
    });
  });

  describe('GET /api/wellness/scores', () => {
    it('should return weekly scores', async () => {
      const mockScores = [
        {
          weekStart: '2024-01-01',
          score: 75,
          breakdown: { Gratitude: 10, Meditation: 15 },
        },
      ];

      mockedWellnessOperations.getWeeklyScores.mockResolvedValue(mockScores as any);

      const response = await request(app)
        .get('/api/wellness/scores')
        .query({ weeks: '4' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockScores);
      expect(mockedWellnessOperations.getWeeklyScores).toHaveBeenCalledWith('test-user-id', 4, 'America/New_York');
    });

    it('should use default weeks parameter', async () => {
      mockedWellnessOperations.getWeeklyScores.mockResolvedValue([]);

      const response = await request(app).get('/api/wellness/scores');

      expect(response.status).toBe(200);
      expect(mockedWellnessOperations.getWeeklyScores).toHaveBeenCalledWith('test-user-id', 12, 'America/New_York');
    });

    it('should return 400 for invalid weeks parameter', async () => {
      const response = await request(app)
        .get('/api/wellness/scores')
        .query({ weeks: '100' }); // Too high

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('weeks parameter must be between 1 and 52');
    });
  });

  describe('GET /api/wellness/status', () => {
    it('should return wellness status for current week', async () => {
      const mockPractices = [
        { practice: 'Gratitude', completed: true },
        { practice: 'Meditation', completed: false },
      ];
      const mockScores = [
        { weekStart: '2024-01-01', score: 25 },
      ];

      mockedWellnessOperations.getPracticeInstances.mockResolvedValue(mockPractices as any);
      mockedWellnessOperations.getWeeklyScores.mockResolvedValue(mockScores as any);
      mockedWellnessOperations.getWeekStart.mockReturnValue('2024-01-01');

      const response = await request(app).get('/api/wellness/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('currentScore', 25);
      expect(response.body.data).toHaveProperty('practiceStatus');
      expect(response.body.data).toHaveProperty('incompletePractices');
      expect(response.body.data.totalPractices).toBe(2);
      expect(response.body.data.completedPractices).toBe(1);
    });
  });

  describe('GET /api/wellness/settings', () => {
    it('should return user wellness settings', async () => {
      const mockSettings = {
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

      mockedWellnessOperations.getUserWellnessSettings.mockResolvedValue(mockSettings as any);

      const response = await request(app).get('/api/wellness/settings');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockSettings);
      expect(mockedWellnessOperations.getUserWellnessSettings).toHaveBeenCalledWith('test-user-id');
    });
  });

  describe('PUT /api/wellness/settings', () => {
    it('should update wellness settings', async () => {
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
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockedWellnessOperations.updateUserWellnessSettings.mockResolvedValue(updatedSettings as any);

      const response = await request(app)
        .put('/api/wellness/settings')
        .send({
          enabledPractices: ['Gratitude', 'Meditation'],
          weeklyGoals: {
            'Gratitude': 5,
            'Meditation': 5,
            'Kindness': 2,
            'Social Outreach': 2,
            'Novelty Challenge': 2,
            'Savoring Reflection': 7
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedSettings);
      expect(mockedWellnessOperations.updateUserWellnessSettings).toHaveBeenCalledWith(
        'test-user-id',
        {
          enabledPractices: ['Gratitude', 'Meditation'],
          weeklyGoals: {
            'Gratitude': 5,
            'Meditation': 5,
            'Kindness': 2,
            'Social Outreach': 2,
            'Novelty Challenge': 2,
            'Savoring Reflection': 7
          },
        }
      );
    });

    it('should return 400 for invalid enabledPractices type', async () => {
      const response = await request(app)
        .put('/api/wellness/settings')
        .send({
          enabledPractices: 'invalid', // Should be array
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('enabledPractices must be an array');
    });

    it('should return 400 for invalid weeklyGoals type', async () => {
      const response = await request(app)
        .put('/api/wellness/settings')
        .send({
          weeklyGoals: 'invalid', // Should be object
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('weeklyGoals must be an object');
    });

    it('should accept valid settings', async () => {
      const updatedSettings = {
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

      mockedWellnessOperations.updateUserWellnessSettings.mockResolvedValue(updatedSettings as any);

      const response = await request(app)
        .put('/api/wellness/settings')
        .send({
          enabledPractices: ['Gratitude', 'Meditation'],
        });

      expect(response.status).toBe(200);
      expect(response.body.enabledPractices).toEqual(['Gratitude', 'Meditation']);
    });
  });
}); 