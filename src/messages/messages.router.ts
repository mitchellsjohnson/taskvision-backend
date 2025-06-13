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

messagesRouter.get("/debug-env", (req, res) => {
  res.status(200).json({
    AUTH0_DOMAIN: process.env.AUTH0_DOMAIN || "Not Set",
    AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE || "Not Set",
    CLIENT_ORIGIN_URL: process.env.CLIENT_ORIGIN_URL || "Not Set",
  });
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

