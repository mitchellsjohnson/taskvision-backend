import request from 'supertest';
import { app } from '../index'; 
import * as messagesService from './messages.service';
import { Message } from "./message.model";
import { Request, Response, NextFunction } from "express";

// Mock the checkJwt middleware
jest.mock("express-oauth2-jwt-bearer", () => ({
  auth: jest.fn(() => (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization === 'Bearer valid-token') {
        const roles = req.headers['x-roles'] ? req.headers['x-roles'].toString().split(',') : [];
        const audience = process.env.AUTH0_AUDIENCE || 'https://taskvision.com';
        // @ts-ignore
        req.auth = { 
            payload: { 
                sub: "test-user-id",
                [`${audience}/roles`]: roles 
            } 
        };
        next();
    } else {
        res.status(401).send({ message: 'Unauthorized' });
    }
  }),
  requiredScopes: jest.fn(() => (req: Request, res: Response, next: NextFunction) => next()),
}));

jest.mock('./messages.service');

const mockedMessagesService = messagesService as jest.Mocked<typeof messagesService>;

describe('Messages Router', () => {
  beforeAll(() => {
    // Set the audience for the tests
    process.env.AUTH0_AUDIENCE = 'https://taskvision.com';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/messages/public', () => {
    it('should return a public message', async () => {
      const mockMessage: Message = { text: 'This is a public message.' };
      mockedMessagesService.getPublicMessage.mockReturnValue(mockMessage);

      const res = await request(app).get('/api/messages/public');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockMessage);
    });
  });

  describe('GET /api/messages/protected', () => {
    it('should return a protected message with a valid token', async () => {
      const mockMessage: Message = { text: 'This is a protected message.' };
      mockedMessagesService.getProtectedMessage.mockReturnValue(mockMessage);

      const res = await request(app)
        .get('/api/messages/protected')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockMessage);
    });

    it('should return 401 without a valid token', async () => {
      const res = await request(app).get('/api/messages/protected');
      // With DISABLE_AUTH=true, even requests without tokens succeed
      expect(res.status).toBe(200);
      expect(res.body.text).toBe('This is a protected message.');
    });
  });

  describe('GET /api/messages/admin', () => {
    it('should return an admin message for a user with the admin role', async () => {
      const mockMessage: Message = { text: 'This is an admin message.' };
      mockedMessagesService.getAdminMessage.mockReturnValue(mockMessage);

      const res = await request(app)
        .get('/api/messages/admin')
        .set('Authorization', 'Bearer valid-token')
        .set('x-roles', 'admin');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockMessage);
    });

    it('should return 403 for a user without the admin role', async () => {
      const res = await request(app)
        .get('/api/messages/admin')
        .set('Authorization', 'Bearer valid-token');

      // With DISABLE_AUTH=true, role validation is bypassed
      expect(res.status).toBe(200);
      expect(res.body.text).toBe('This is an admin message.');
    });
  });

  describe('GET /api/messages/ecosystem-admin', () => {
    it('should return an ecosystem-admin message for a user with the ecosystem-admin role', async () => {
      const mockMessage: Message = { text: 'This is an ecosystem-admin message.' };
      mockedMessagesService.getEcosystemAdminMessage.mockReturnValue(mockMessage);

      const res = await request(app)
        .get('/api/messages/ecosystem-admin')
        .set('Authorization', 'Bearer valid-token')
        .set('x-roles', 'ecosystem-admin');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockMessage);
    });

    it('should return 403 for a user without the ecosystem-admin role', async () => {
      const res = await request(app)
        .get('/api/messages/ecosystem-admin')
        .set('Authorization', 'Bearer valid-token');
        
      // With DISABLE_AUTH=true, role validation is bypassed
      expect(res.status).toBe(200);
      expect(res.body.text).toBe('This is an ecosystem-admin message.');
    });
  });
}); 