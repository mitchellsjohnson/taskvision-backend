import { Request, Response, NextFunction } from 'express';

process.env.AUTH0_AUDIENCE = 'https://taskvision.com';

describe('Auth0 Middleware', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let nextFunction: NextFunction = jest.fn();
    let mockAuth: jest.Mock;

    beforeEach(() => {
        mockAuth = jest.fn();
        jest.doMock('express-oauth2-jwt-bearer', () => ({
            auth: (options: any) => {
                mockAuth(options);
                return (req: Request, res: Response, next: NextFunction) => {
                    if (req.headers.authorization === 'Bearer valid-token') {
                        // @ts-ignore
                        req.auth = { payload: { sub: 'test-user' } };
                        next();
                    } else if (req.headers.authorization === 'Bearer invalid-token') {
                        res.status(401).send({ message: 'Unauthorized' });
                    } else {
                        next();
                    }
                };
            },
        }));

        mockRequest = { headers: {} };
        mockResponse = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
        };
        nextFunction = jest.fn();
    });

    afterEach(() => {
        jest.resetModules();
    });

    it('should call next() if a valid token is provided', () => {
        const { validateAccessToken } = require('./auth0.middleware');
        mockRequest.headers = { authorization: 'Bearer valid-token' };
        validateAccessToken(mockRequest as Request, mockResponse as Response, nextFunction);
        expect(nextFunction).toHaveBeenCalled();
        expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should return 401 if an invalid token is provided', () => {
        const { validateAccessToken } = require('./auth0.middleware');
        mockRequest.headers = { authorization: 'Bearer invalid-token' };
        validateAccessToken(mockRequest as Request, mockResponse as Response, nextFunction);
        expect(nextFunction).not.toHaveBeenCalled();
        expect(mockResponse.status).toHaveBeenCalledWith(401);
        expect(mockResponse.send).toHaveBeenCalledWith({ message: 'Unauthorized' });
    });

    it('should be configured with correct Auth0 options', () => {
        const { validateAccessToken } = require('./auth0.middleware');
        const expectedOptions = {
            issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
            audience: process.env.AUTH0_AUDIENCE,
            tokenSigningAlg: 'RS256'
        };
        expect(mockAuth).toHaveBeenCalledWith(expectedOptions);
    });
});

describe('checkRequiredRole Middleware', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let nextFunction: NextFunction = jest.fn();

    beforeEach(() => {
        mockRequest = {
            // @ts-ignore
            auth: {
                payload: {
                    'https://taskvision.com/roles': []
                }
            }
        };
        mockResponse = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
        };
        nextFunction = jest.fn();
    });

    it('should call next() if user has the required role', () => {
        const { checkRequiredRole } = require('./auth0.middleware');
        const requiredRole = 'admin';
        // @ts-ignore
        mockRequest.auth.payload['https://taskvision.com/roles'] = [requiredRole];
        const middleware = checkRequiredRole(requiredRole);
        middleware(mockRequest as Request, mockResponse as Response, nextFunction);
        expect(nextFunction).toHaveBeenCalled();
    });

    it('should return 403 if user does not have the required role', () => {
        const { checkRequiredRole } = require('./auth0.middleware');
        const requiredRole = 'admin';
        // @ts-ignore
        mockRequest.auth.payload[`${process.env.AUTH0_AUDIENCE}/roles`] = ['user'];
        const middleware = checkRequiredRole(requiredRole);
        middleware(mockRequest as Request, mockResponse as Response, nextFunction);
        expect(mockResponse.status).toHaveBeenCalledWith(403);
        expect(mockResponse.send).toHaveBeenCalledWith({ message: 'Insufficient role' });
    });

    it('should call next() if auth is disabled', () => {
        process.env.DISABLE_AUTH = 'true';
        const { checkRequiredRole } = require('./auth0.middleware');
        const middleware = checkRequiredRole('any-role');
        middleware(mockRequest as Request, mockResponse as Response, nextFunction);
        expect(nextFunction).toHaveBeenCalled();
        delete process.env.DISABLE_AUTH; // Cleanup
    });
}); 