import { Request, Response, NextFunction } from "express";
import { auth } from "express-oauth2-jwt-bearer";
import { DecodedToken } from "../util/decoded-token";

const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE as string;

export const checkRoles = (requiredRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRoles = (req.auth?.payload as DecodedToken)?.[AUTH0_AUDIENCE + "/roles"];

    if (!userRoles || !Array.isArray(userRoles)) {
      return res.status(403).json({ message: "Forbidden: No roles found in token." });
    }

    const hasRequiredRole = requiredRoles.some(requiredRole => userRoles.includes(requiredRole));

    if (hasRequiredRole) {
      return next();
    }

    return res.status(403).json({ message: "Forbidden: Insufficient permissions." });
  };
}; 