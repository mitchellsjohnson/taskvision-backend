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

// CORS is handled by Lambda function to avoid serverless-http issues
// Express CORS middleware doesn't work reliably with serverless-http
// const corsOptions: cors.CorsOptions = {
//   origin: CLIENT_ORIGIN_URL,
//   methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//   allowedHeaders: [
//     "Authorization",
//     "Content-Type",
//     "X-Amz-Date",
//     "X-Api-Key",
//     "X-Amz-Security-Token",
//   ],
//   credentials: true,
//   maxAge: 86400,
// };

// app.use(cors(corsOptions));
// app.options("*", cors(corsOptions));

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
