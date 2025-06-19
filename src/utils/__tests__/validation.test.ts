import { TASK_LIMITS, validateTaskData } from '../validation';

describe('backend validation utilities', () => {
  describe('TASK_LIMITS', () => {
    it('should have correct limit values', () => {
      expect(TASK_LIMITS.TITLE_MAX_LENGTH).toBe(200);
      expect(TASK_LIMITS.DESCRIPTION_MAX_LENGTH).toBe(5000);
    });
  });

  describe('validateTaskData', () => {
    it('should validate valid task data', () => {
      const taskData = {
        title: 'Valid title',
        description: 'Valid description',
      };
      
      const result = validateTaskData(taskData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate task with only title', () => {
      const taskData = {
        title: 'Valid title',
      };
      
      const result = validateTaskData(taskData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate task with only description', () => {
      const taskData = {
        description: 'Valid description',
      };
      
      const result = validateTaskData(taskData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate empty task data', () => {
      const taskData = {};
      
      const result = validateTaskData(taskData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should invalidate title over limit', () => {
      const taskData = {
        title: 'x'.repeat(250), // Over 200 limit
      };
      
      const result = validateTaskData(taskData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      
      const titleError = result.errors[0];
      expect(titleError.field).toBe('title');
      expect(titleError.message).toBe('Title exceeds maximum length of 200 characters');
      expect(titleError.maxLength).toBe(200);
      expect(titleError.currentLength).toBe(250);
    });

    it('should invalidate description over limit', () => {
      const taskData = {
        description: 'x'.repeat(5500), // Over 5000 limit
      };
      
      const result = validateTaskData(taskData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      
      const descError = result.errors[0];
      expect(descError.field).toBe('description');
      expect(descError.message).toBe('Description exceeds maximum length of 5000 characters');
      expect(descError.maxLength).toBe(5000);
      expect(descError.currentLength).toBe(5500);
    });

    it('should invalidate both title and description over limit', () => {
      const taskData = {
        title: 'x'.repeat(250),
        description: 'x'.repeat(5500),
      };
      
      const result = validateTaskData(taskData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      
      const titleError = result.errors.find(e => e.field === 'title');
      expect(titleError).toBeDefined();
      expect(titleError!.currentLength).toBe(250);
      
      const descError = result.errors.find(e => e.field === 'description');
      expect(descError).toBeDefined();
      expect(descError!.currentLength).toBe(5500);
    });

    it('should validate title at exact limit', () => {
      const taskData = {
        title: 'x'.repeat(200), // Exactly 200
      };
      
      const result = validateTaskData(taskData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate description at exact limit', () => {
      const taskData = {
        description: 'x'.repeat(5000), // Exactly 5000
      };
      
      const result = validateTaskData(taskData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    describe('edge cases', () => {
      it('should handle empty strings', () => {
        const taskData = {
          title: '',
          description: '',
        };
        
        const result = validateTaskData(taskData);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should handle undefined values', () => {
        const taskData = {
          title: undefined,
          description: undefined,
        };
        
        const result = validateTaskData(taskData);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should handle unicode characters', () => {
        const taskData = {
          title: '🚀'.repeat(100), // 100 unicode chars
          description: '✨'.repeat(2500), // 2500 unicode chars
        };
        
        const result = validateTaskData(taskData);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should handle mixed content', () => {
        const taskData = {
          title: 'Task with emojis 🚀✨ and text',
          description: 'Description with\nnewlines\n\nand tabs\t\tand unicode 🎯',
        };
        
        const result = validateTaskData(taskData);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });
}); 