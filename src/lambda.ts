import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { app } from './index';
import * as express from 'express';

// Export the Lambda handler
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  // Create a mock Express request and response
  const req = {
    method: event.httpMethod,
    path: event.path,
    headers: event.headers,
    query: event.queryStringParameters,
    body: event.body ? JSON.parse(event.body) : undefined
  } as express.Request;

  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader: (name: string, value: string) => {
      res.headers[name] = value;
    },
    end: (data: string) => {
      res.body = data;
    }
  } as any;

  // Handle the request using Express app
  await new Promise<void>((resolve) => {
    app(req, res, () => {
      resolve();
    });
  });

  // Return API Gateway response
  return {
    statusCode: res.statusCode,
    headers: {
      ...res.headers,
      'Access-Control-Allow-Origin': process.env.CLIENT_ORIGIN_URL || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS,POST,PUT,DELETE',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    },
    body: typeof res.body === 'string' ? res.body : JSON.stringify(res.body)
  };
}; 