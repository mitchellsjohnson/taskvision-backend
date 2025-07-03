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
  // Get the same CLIENT_ORIGIN_URL that Express uses
  let CLIENT_ORIGIN_URL = process.env.CLIENT_ORIGIN_URL;
  if (process.env.NODE_ENV !== 'production' && !CLIENT_ORIGIN_URL) {
    CLIENT_ORIGIN_URL = 'http://localhost:4040';
  }
  if (!CLIENT_ORIGIN_URL) {
    CLIENT_ORIGIN_URL = 'https://taskvision.ai'; // fallback
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': CLIENT_ORIGIN_URL,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Amz-Date, X-Api-Key, X-Amz-Security-Token',
  };

  console.log('Lambda request:', {
    method: event.httpMethod,
    path: event.path,
    origin: event.headers.origin || event.headers.Origin,
    allowedOrigin: CLIENT_ORIGIN_URL
  });

  // Handle OPTIONS preflight at Lambda level
  if (event.httpMethod === 'OPTIONS') {
    console.log('Handling OPTIONS preflight at Lambda level');
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Access-Control-Max-Age': '86400',
      },
      body: '',
    };
  }

  try {
    // Get response from Express (without CORS since we handle it here)
    const result = (await handler(event, context)) as APIGatewayProxyResult;
    
    console.log('Express response:', {
      statusCode: result.statusCode,
      headers: Object.keys(result.headers || {})
    });
    
    // Add CORS headers to all responses
    return {
      ...result,
      headers: {
        ...corsHeaders,
        ...result.headers,
      },
    };
  } catch (error) {
    console.error('Lambda handler error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
};
