import serverless from 'serverless-http';
import type { Request } from 'express';
import type {
  APIGatewayProxyEvent,
  Context,
  APIGatewayProxyResult,
} from 'aws-lambda';
import { app } from './index';

// Wrap Express app in serverless handler
const handler = serverless(app, {
  request: (
    req: Request,
    event: APIGatewayProxyEvent,
    context: Context
  ): void => {
    req.headers['x-apigateway-event'] = JSON.stringify(event);
    req.headers['x-apigateway-context'] = JSON.stringify(context);
  },
});

// Main Lambda entry point
export const main = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.CLIENT_ORIGIN_URL || 'https://taskvision.ai',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Requested-With, X-Amz-Date, X-Api-Key, X-Amz-Security-Token',
    'Access-Control-Allow-Credentials': 'true',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    // Pass through to Express app
    const result = (await handler(event, context)) as APIGatewayProxyResult;
    
    // Ensure CORS headers are always present
    return {
      ...result,
      headers: {
        ...corsHeaders,
        ...result.headers,
      },
    };
  } catch (error) {
    console.error('Lambda handler error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
