import { Request } from 'express';

export const getUserId = (req: Request): string | undefined => {
  // This assumes the user ID is in the `sub` claim of the JWT,
  // which is standard for Auth0. The `checkJwt` middleware should
  // have already verified the token and attached the payload to req.auth.
  return req.auth?.payload.sub;
}; 