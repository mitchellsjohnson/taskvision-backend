import * as dotenv from "dotenv";
dotenv.config(); // Ensure env vars are loaded early

import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import nocache from "nocache";
import cors from "cors";
import "./loadEnv";
import { messagesRouter } from "./messages/messages.router";
import { errorHandler } from "./middleware/error.middleware";
import { notFoundHandler } from "./middleware/not-found.middleware";

// Validate required env vars
const PORT = parseInt(process.env.PORT || "3000", 10);
const CLIENT_ORIGIN_URL = process.env.CLIENT_ORIGIN_URL;

if (!CLIENT_ORIGIN_URL) {
  throw new Error("Missing CLIENT_ORIGIN_URL environment variable.");
}

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

// Unified CORS configuration
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

// Error handling
app.use(errorHandler);
app.use(notFoundHandler);

// Local dev server (skipped in tests or Lambda)
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
  });
}
