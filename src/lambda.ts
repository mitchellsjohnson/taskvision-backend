import serverless from 'serverless-http';
import { app } from './index';

// Export the Lambda handler using serverless-http
export const handler = serverless(app);
