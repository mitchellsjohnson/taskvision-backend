import { Request, Response, NextFunction } from 'express';
import {
  InvalidTokenError,
  UnauthorizedError,
  InsufficientScopeError,
} from 'express-oauth2-jwt-bearer';
import { errorHandler } from '../error.middleware';

describe('Error Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('InsufficientScopeError', () => {
    it('should handle InsufficientScopeError with correct status and message', () => {
      const error = new InsufficientScopeError(['read:tasks']);
      error.status = 403;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Permission denied' });
    });

    it('should handle InsufficientScopeError with different status code', () => {
      const error = new InsufficientScopeError(['write:tasks']);
      error.status = 401;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Permission denied' });
    });
  });

  describe('InvalidTokenError', () => {
    it('should handle InvalidTokenError with correct status and message', () => {
      const error = new InvalidTokenError('Token is invalid');
      error.status = 401;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Bad credentials' });
    });

    it('should handle InvalidTokenError with different status code', () => {
      const error = new InvalidTokenError('Token expired');
      error.status = 403;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Bad credentials' });
    });
  });

  describe('UnauthorizedError', () => {
    it('should handle UnauthorizedError with correct status and message', () => {
      const error = new UnauthorizedError('No authorization header');
      error.status = 401;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Requires authentication' });
    });

    it('should handle UnauthorizedError with different status code', () => {
      const error = new UnauthorizedError('Missing token');
      error.status = 400;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Requires authentication' });
    });
  });

  describe('Generic errors', () => {
    it('should handle generic Error with 500 status', () => {
      const error = new Error('Something went wrong');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });

    it('should handle string error with 500 status', () => {
      const error = 'String error message';

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });

    it('should handle null error with 500 status', () => {
      const error = null;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });

    it('should handle undefined error with 500 status', () => {
      const error = undefined;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });

    it('should handle object error with 500 status', () => {
      const error = { message: 'Custom error object', code: 'CUSTOM_ERROR' };

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });
  });

  describe('Response method chaining', () => {
    it('should properly chain response methods', () => {
      const error = new Error('Test error');
      const statusSpy = jest.fn().mockReturnValue(mockResponse);
      const jsonSpy = jest.fn().mockReturnValue(mockResponse);
      
      mockResponse.status = statusSpy;
      mockResponse.json = jsonSpy;

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });
  });

  describe('Error precedence', () => {
    it('should prioritize InsufficientScopeError over other error types', () => {
      // Create an error that could match multiple conditions
      const error = new InsufficientScopeError(['read:tasks']);
      error.status = 403;
      // Add properties that might confuse the handler
      (error as any).name = 'UnauthorizedError';

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Permission denied' });
    });

    it('should prioritize InvalidTokenError over UnauthorizedError', () => {
      const error = new InvalidTokenError('Invalid token');
      error.status = 401;
      // Add properties that might confuse the handler
      (error as any).name = 'UnauthorizedError';

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Bad credentials' });
    });
  });
});
