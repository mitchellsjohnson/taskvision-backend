export const TASK_LIMITS = {
  TITLE_MAX_LENGTH: 200,
  DESCRIPTION_MAX_LENGTH: 5000,
} as const;

export interface ValidationError {
  field: string;
  message: string;
  maxLength: number;
  currentLength: number;
}

export const validateTaskData = (taskData: { title?: string; description?: string }) => {
  const errors: ValidationError[] = [];
  
  if (taskData.title && taskData.title.length > TASK_LIMITS.TITLE_MAX_LENGTH) {
    errors.push({
      field: 'title',
      message: `Title exceeds maximum length of ${TASK_LIMITS.TITLE_MAX_LENGTH} characters`,
      maxLength: TASK_LIMITS.TITLE_MAX_LENGTH,
      currentLength: taskData.title.length,
    });
  }
  
  if (taskData.description && taskData.description.length > TASK_LIMITS.DESCRIPTION_MAX_LENGTH) {
    errors.push({
      field: 'description',
      message: `Description exceeds maximum length of ${TASK_LIMITS.DESCRIPTION_MAX_LENGTH} characters`,
      maxLength: TASK_LIMITS.DESCRIPTION_MAX_LENGTH,
      currentLength: taskData.description.length,
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}; 