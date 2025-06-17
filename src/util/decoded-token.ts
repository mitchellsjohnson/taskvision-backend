export interface DecodedToken {
  iss: string;
  sub: string;
  aud: string[];
  iat: number;
  exp: number;
  azp: string;
  scope: string;
  [key: string]: any; // Allow other properties
} 