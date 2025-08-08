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


  // Enhanced logging for production debugging
  console.log('=== LAMBDA REQUEST START ===');
  console.log('Lambda request details:', {
    method: event.httpMethod,
    path: event.path,
    queryStringParameters: event.queryStringParameters,
    origin: event.headers.origin || event.headers.Origin,
    userAgent: event.headers['user-agent'] || event.headers['User-Agent'],
    allowedOrigin: CLIENT_ORIGIN_URL,
    timestamp: new Date().toISOString(),
    requestId: context.awsRequestId
  });
  
  console.log('Request headers:', {
    origin: event.headers.origin || event.headers.Origin,
    referer: event.headers.referer || event.headers.Referer,
    host: event.headers.host || event.headers.Host,
    'content-type': event.headers['content-type'] || event.headers['Content-Type'],
    authorization: event.headers.authorization ? '[PRESENT]' : '[MISSING]'
  });
  
  console.log('CORS configuration:', {
    CLIENT_ORIGIN_URL,
    NODE_ENV: process.env.NODE_ENV,
  });

  // Let Express handle all CORS including OPTIONS preflight  }

  try {
    console.log('=== CALLING EXPRESS HANDLER ===');
    const startTime = Date.now();
    
    // Get response from Express (without CORS since we handle it here)
    const result = (await handler(event, context)) as APIGatewayProxyResult;
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('Express response received:', {
      statusCode: result.statusCode,
      headers: Object.keys(result.headers || {}),
      bodyLength: result.body ? result.body.length : 0,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    
    // Log response headers for debugging
    console.log('Express response headers:', result.headers);
    
    const finalResponse = {
      ...result,
      headers: {
        
        ...result.headers,
      },
    };
    
    console.log('Final Lambda response:', {
      statusCode: finalResponse.statusCode,
      headers: finalResponse.headers,
      bodyPreview: finalResponse.body ? finalResponse.body.substring(0, 200) + '...' : 'No body'
    });
    
    console.log('=== LAMBDA REQUEST COMPLETE ===');
    return finalResponse;
    
  } catch (error) {
    console.error('=== LAMBDA HANDLER ERROR ===');
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      name: error instanceof Error ? error.name : 'Unknown',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      timestamp: new Date().toISOString(),
      requestId: context.awsRequestId
    });
    
    const errorResponse = {
      statusCode: 500,
      headers: {
        
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId: context.awsRequestId,
        timestamp: new Date().toISOString()
      }),
    };
    
    console.error('Error response:', errorResponse);
    console.error('=== LAMBDA ERROR COMPLETE ===');
    return errorResponse;
  }
};
