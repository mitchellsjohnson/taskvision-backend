import serverless from "serverless-http";
import { app } from "./index";
import { APIGatewayProxyHandler } from "aws-lambda";

const handler = serverless(app, {
  request: (req, event, context) => {
    req.headers["x-apigateway-event"] = JSON.stringify(event);
    req.headers["x-apigateway-context"] = JSON.stringify(context);
  },
});

export const main: APIGatewayProxyHandler = async (event, context) => {
  // Manually handle OPTIONS preflight with correct headers
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN_URL || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token",
        "Access-Control-Allow-Credentials": "true",
      },
      body: "",
    };
  }

  // For all other methods, use Express
  return handler(event, context) as any;
};