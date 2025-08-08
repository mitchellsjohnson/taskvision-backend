// auth0.middleware.ts

import { auth } from 'express-oauth2-jwt-bearer';
import { Request, Response, NextFunction } from 'express';

// JWT validation middleware - only initialize if auth is not disabled
const jwtCheck = process.env.DISABLE_AUTH === 'true' 
  ? null 
  : auth({
      issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
      audience: process.env.AUTH0_AUDIENCE,
      tokenSigningAlg: 'RS256'
    });

// Role checker middleware
const checkRequiredRole = (role: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check if auth is disabled
    if (process.env.DISABLE_AUTH === 'true') {
      return next();
    }
    
    const namespace = process.env.AUTH0_AUDIENCE;
    // @ts-ignore
    const userRoles = req.auth.payload[`${namespace}/roles`] as string[] || [];

    if (userRoles.includes(role)) {
      next();
    } else {
      res.status(403).send({ message: 'Insufficient role' });
    }
  };
};

// Validation middleware that respects DISABLE_AUTH
const validateAccessToken = (req: Request, res: Response, next: NextFunction) => {
  // Check if auth is disabled
  if (process.env.DISABLE_AUTH === 'true') {
    // Mock a basic auth object for compatibility
    req.auth = {
      payload: { sub: 'dev-user-id' },
      header: {},
      token: 'mock-token'
    };
    return next();
  }
  
  // Otherwise use normal JWT validation
  if (!jwtCheck) {
    return res.status(500).json({ message: 'Auth configuration error' });
  }
  return jwtCheck(req, res, next);
};

export { jwtCheck, validateAccessToken, checkRequiredRole };