import express from "express";
import {
  checkRequiredPermissions,
  validateAccessToken,
} from "../middleware/auth0.middleware";
import { AdminMessagesPermissions, AdminFeaturesPermissions } from "./messages.permissions";
import {
  getAdminMessage,
  getProtectedMessage,
  getPublicMessage,
  getAdminFeaturesFlag,
} from "./messages.service";

export const messagesRouter = express.Router();

// Handle CORS preflight requests
messagesRouter.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', process.env.CLIENT_ORIGIN_URL);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
});

messagesRouter.get("/public", (req, res) => {
  const message = getPublicMessage();

  res.status(200).json(message);
});

messagesRouter.get("/protected", validateAccessToken, (req, res) => {
  const message = getProtectedMessage();

  res.status(200).json(message);
});

messagesRouter.get(
  "/admin",
  validateAccessToken,
  checkRequiredPermissions([AdminMessagesPermissions.Read]),
  (req, res) => {
    const message = getAdminMessage();

    res.status(200).json(message);
  }
);

messagesRouter.get(
  "/admin-features",
  validateAccessToken,
  checkRequiredPermissions([AdminFeaturesPermissions.Read]),
  (req, res) => {
    const message = getAdminFeaturesFlag();

    res.status(200).json(message);
  }
);

