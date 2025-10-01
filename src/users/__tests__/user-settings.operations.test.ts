import { getUserSettings, updateUserSettings } from '../user-settings.operations';
import dynamoClient from '../../db/dynamo';
import { GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Mock the DynamoDB client
jest.mock('../../db/dynamo', () => ({
  __esModule: true,
  default: {
    send: jest.fn()
  }
}));

jest.mock('@aws-sdk/util-dynamodb', () => ({
  marshall: jest.fn(),
  unmarshall: jest.fn()
}));

const mockDynamoClient = dynamoClient as jest.Mocked<{ send: jest.MockedFunction<any> }>;
const mockMarshall = marshall as jest.MockedFunction<typeof marshall>;
const mockUnmarshall = unmarshall as jest.MockedFunction<typeof unmarshall>;

describe('user-settings.operations', () => {
  const mockUserId = 'test-user-123';
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserSettings', () => {
    it('should return default settings when no settings exist', async () => {
      // Mock DynamoDB returning no item
      mockDynamoClient.send.mockResolvedValue({ Item: undefined });
      mockMarshall.mockReturnValue({} as any);

      const result = await getUserSettings(mockUserId);

      expect(result).toEqual({
        userId: mockUserId,
        theme: 'system',
        fontSize: 'medium',
        accessibility: {
          reducedMotion: false,
          highContrast: false,
          alwaysShowFocus: false,
        },
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      expect(mockDynamoClient.send).toHaveBeenCalledWith(
        expect.any(GetItemCommand)
      );
    });

    it('should return existing settings when found', async () => {
      const mockItem = {
        userId: mockUserId,
        theme: 'dark',
        fontSize: 'large',
        accessibility: {
          reducedMotion: true,
          highContrast: false,
          alwaysShowFocus: true,
        },
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-02T00:00:00.000Z',
      };

      mockDynamoClient.send.mockResolvedValue({ Item: {} });
      mockMarshall.mockReturnValue({} as any);
      mockUnmarshall.mockReturnValue(mockItem);

      const result = await getUserSettings(mockUserId);

      expect(result).toEqual(mockItem);
      expect(mockUnmarshall).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      mockDynamoClient.send.mockRejectedValue(new Error('Database error'));
      mockMarshall.mockReturnValue({} as any);

      await expect(getUserSettings(mockUserId)).rejects.toThrow(
        'Failed to get user settings'
      );
    });
  });

  describe('updateUserSettings', () => {
    it('should update settings and return updated values', async () => {
      const mockCurrentSettings = {
        userId: mockUserId,
        theme: 'system' as const,
        fontSize: 'medium' as const,
        accessibility: {
          reducedMotion: false,
          highContrast: false,
          alwaysShowFocus: false,
        },
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      const updates = {
        theme: 'dark' as const,
        fontSize: 'large' as const,
      };

      // Mock first call (get current settings)
      mockDynamoClient.send
        .mockResolvedValueOnce({ Item: {} })
        .mockResolvedValueOnce({}); // put call

      mockMarshall.mockReturnValue({} as any);
      mockUnmarshall.mockReturnValue(mockCurrentSettings);

      const result = await updateUserSettings(mockUserId, updates);

      expect(result).toEqual({
        ...mockCurrentSettings,
        ...updates,
        updatedAt: expect.any(String),
      });

      expect(mockDynamoClient.send).toHaveBeenCalledTimes(2);
      expect(mockDynamoClient.send).toHaveBeenCalledWith(
        expect.any(GetItemCommand)
      );
      expect(mockDynamoClient.send).toHaveBeenCalledWith(
        expect.any(PutItemCommand)
      );
    });

    it('should set createdAt when creating new settings', async () => {
      // Mock no existing settings
      mockDynamoClient.send
        .mockResolvedValueOnce({ Item: undefined })
        .mockResolvedValueOnce({});

      mockMarshall.mockReturnValue({} as any);

      const updates = { theme: 'dark' as const };

      const result = await updateUserSettings(mockUserId, updates);

      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(result.theme).toBe('dark');
    });

    it('should handle database errors during update', async () => {
      mockDynamoClient.send
        .mockResolvedValueOnce({ Item: {} })
        .mockRejectedValueOnce(new Error('Database error'));

      mockMarshall.mockReturnValue({} as any);
      mockUnmarshall.mockReturnValue({
        userId: mockUserId,
        theme: 'system',
        fontSize: 'medium',
        accessibility: { reducedMotion: false, highContrast: false, alwaysShowFocus: false },
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      });

      await expect(
        updateUserSettings(mockUserId, { theme: 'dark' })
      ).rejects.toThrow('Failed to update user settings');
    });
  });
});


