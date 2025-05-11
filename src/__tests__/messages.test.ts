import request from 'supertest';
import { app } from '../index';

describe('Messages API', () => {
  describe('GET /api/messages/public', () => {
    it('should return public message', async () => {
      const response = await request(app)
        .get('/api/messages/public')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('text');
      expect(response.body.text).toBe('This is a public message.');
    });
  });

  describe('GET /api/messages/protected', () => {
    it('should return 401 without auth token', async () => {
      await request(app)
        .get('/api/messages/protected')
        .expect(401);
    });
  });

  describe('GET /api/messages/admin', () => {
    it('should return 401 without auth token', async () => {
      await request(app)
        .get('/api/messages/admin')
        .expect(401);
    });
  });
}); 