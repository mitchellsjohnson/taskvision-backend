// auth0.middleware.ts

import { auth } from 'express-oauth2-jwt-bearer';
import { Request, Response, NextFunction } from 'express';

// JWT validation middleware
const jwtCheck = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  audience: process.env.AUTH0_AUDIENCE,
  tokenSigningAlg: 'RS256'
});

// Role checker middleware
const checkRequiredRole = (role: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
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

// Optional alias
const validateAccessToken = jwtCheck;

export { jwtCheck, validateAccessToken, checkRequiredRole };