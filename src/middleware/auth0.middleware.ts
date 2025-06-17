// auth0.middleware.ts

import { auth } from 'express-oauth2-jwt-bearer';
import { Request, Response, NextFunction } from 'express';

// JWT validation middleware (can be bypassed for local)
const jwtCheck =
  process.env.DISABLE_AUTH === 'true'
    ? (req: Request, res: Response, next: NextFunction) => {
        // No need to log this in production
        // console.warn('[Auth Bypassed] DISABLE_AUTH=true');
        next();
      }
    : auth({
        issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
        audience: process.env.AUTH0_AUDIENCE,
        tokenSigningAlg: 'RS256'
      });

// Role checker middleware
const checkRequiredRole = (role: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.DISABLE_AUTH === 'true') {
      // No need to log this in production
      // console.warn('[Permission Bypassed] DISABLE_AUTH=true');
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

// Optional alias
const validateAccessToken = jwtCheck;

export { jwtCheck, validateAccessToken, checkRequiredRole };