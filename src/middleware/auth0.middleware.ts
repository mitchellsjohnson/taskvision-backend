// auth0.middleware.ts

import { auth } from 'express-oauth2-jwt-bearer';
import { Request, Response, NextFunction } from 'express';

// JWT validation middleware (can be bypassed for local)
const jwtCheck =
  process.env.DISABLE_AUTH === 'true'
    ? (req: Request, res: Response, next: NextFunction) => {
        console.warn('[Auth Bypassed] DISABLE_AUTH=true');
        next();
      }
    : auth({
        issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
        audience: process.env.AUTH0_AUDIENCE,
        tokenSigningAlg: 'RS256'
      });

// Permission checker middleware (stub, accepts permission array)
const checkRequiredPermissions =
  (permissions: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (process.env.DISABLE_AUTH === 'true') {
      console.warn('[Permission Bypassed] DISABLE_AUTH=true');
      return next();
    }

    // TODO: Check actual user claims against `permissions` array
    console.log('[Permissions Required]:', permissions);
    next();
  };

// Optional alias
const validateAccessToken = jwtCheck;

export { jwtCheck, validateAccessToken, checkRequiredPermissions };
