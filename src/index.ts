import cors from "cors";
import * as dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import nocache from "nocache";
import fs from "fs";
import "./loadEnv";
import { messagesRouter } from "./messages/messages.router";
import { errorHandler } from "./middleware/error.middleware";
import { notFoundHandler } from "./middleware/not-found.middleware";

// Ensure required environment variables are present
if (!(process.env.PORT && process.env.CLIENT_ORIGIN_URL)) {
  throw new Error(
    "Missing required environment variables. Check docs for more info."
  );
}

const PORT = parseInt(process.env.PORT, 10);
const CLIENT_ORIGIN_URL = process.env.CLIENT_ORIGIN_URL;

export const app = express();
const apiRouter = express.Router();

// Core middleware
app.use(express.json());
app.set("json spaces", 2);

// Security headers
app.use(
  helmet({
    hsts: {
      maxAge: 31536000,
    },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'none'"],
        "frame-ancestors": ["'none'"],
      },
    },
    frameguard: {
      action: "deny",
    },
  })
);

// Default response type
app.use((req, res, next) => {
  res.contentType("application/json; charset=utf-8");
  next();
});

// Prevent caching
app.use(nocache());

// CORS setup
app.use(
  cors({
    origin: CLIENT_ORIGIN_URL,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Amz-Date",
      "X-Api-Key",
      "X-Amz-Security-Token"
    ],
    maxAge: 86400,
  })
);

// Handle all preflight OPTIONS requests
app.options("*", cors());

// API routes
app.use("/api", apiRouter);
apiRouter.use("/messages", messagesRouter);

// Error handling
app.use(errorHandler);
app.use(notFoundHandler);

// Start server unless in test environment
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
  });
}
