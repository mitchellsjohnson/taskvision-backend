import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import nocache from "nocache";
import cors from "cors";
import { messagesRouter } from "./messages/messages.router";
import { tasksRouter } from "./tasks/tasks.router";
import { tvagentRouter } from "./tvagent/tvagent.router";
import tvagentV2Router from "./tvagent/tvagent-v2.router";
import wellnessRouter from "./wellness/wellness.router";
import { userSettingsRouter } from "./users/user-settings.router";
import { errorHandler } from "./middleware/error.middleware";
import { notFoundHandler } from "./middleware/not-found.middleware";

// Validate required env vars
const PORT = parseInt(process.env.PORT || "6060", 10);
let CLIENT_ORIGIN_URL = process.env.CLIENT_ORIGIN_URL;



if (process.env.NODE_ENV !== 'production' && !CLIENT_ORIGIN_URL) {
  console.warn('CLIENT_ORIGIN_URL not set, defaulting to http://localhost:4040 for local development.');
  CLIENT_ORIGIN_URL = 'http://localhost:4040';
}

if (!CLIENT_ORIGIN_URL) {
  throw new Error("Missing CLIENT_ORIGIN_URL environment variable.");
}

console.log('CORS configured for origin:', CLIENT_ORIGIN_URL);

export const app = express();
const apiRouter = express.Router();

// Core middleware
app.use(express.json());
app.set("json spaces", 2);

// Production monitoring middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  console.log(`=== EXPRESS REQUEST START [${requestId}] ===`);
  console.log('Request details:', {
    requestId,
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    origin: req.get('origin'),
    referer: req.get('referer'),
    userAgent: req.get('user-agent'),
    host: req.get('host'),
    contentType: req.get('content-type'),
    authorization: req.get('authorization') ? '[PRESENT]' : '[MISSING]',
    timestamp: new Date().toISOString()
  });
  
  // Log all headers for debugging
  console.log('All request headers:', req.headers);
  
  // Override res.json to log responses
  const originalJson = res.json;
  res.json = function(body: any) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Express response [${requestId}]:`, {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      bodyPreview: typeof body === 'object' ? JSON.stringify(body).substring(0, 200) + '...' : body,
      headers: res.getHeaders(),
      timestamp: new Date().toISOString()
    });
    
    console.log(`=== EXPRESS REQUEST COMPLETE [${requestId}] ===`);
    return originalJson.call(this, body);
  };
  
  // Override res.send to log responses
  const originalSend = res.send;
  res.send = function(body: any) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Express response [${requestId}]:`, {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      bodyPreview: typeof body === 'string' ? body.substring(0, 200) + '...' : body,
      headers: res.getHeaders(),
      timestamp: new Date().toISOString()
    });
    
    console.log(`=== EXPRESS REQUEST COMPLETE [${requestId}] ===`);
    return originalSend.call(this, body);
  };
  
  next();
});

// Security headers
app.use(
  helmet({
    hsts: { maxAge: 31536000 },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'none'"],
        "frame-ancestors": ["'none'"],
      },
    },
    frameguard: { action: "deny" },
  })
);

// CORS configuration for local development
const corsOptions: cors.CorsOptions = {
  origin: CLIENT_ORIGIN_URL,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Authorization",
    "Content-Type",
    "X-Amz-Date",
    "X-Api-Key",
    "X-Amz-Security-Token",
  ],
  credentials: true,
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Standard content type
app.use((req: Request, res: Response, next: NextFunction) => {
  res.contentType("application/json; charset=utf-8");
  next();
});

// Disable caching
app.use(nocache());

// Routes
app.use("/api", apiRouter);
apiRouter.use("/messages", messagesRouter);
apiRouter.use("/tasks", tasksRouter);
apiRouter.use("/tvagent", tvagentRouter);
apiRouter.use("/tvagent/v2", tvagentV2Router);
apiRouter.use("/wellness", wellnessRouter);
apiRouter.use("/user", userSettingsRouter);

// Error handling
app.use(errorHandler);
app.use(notFoundHandler);

// Local dev server (skipped in tests or Lambda)
if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
}
