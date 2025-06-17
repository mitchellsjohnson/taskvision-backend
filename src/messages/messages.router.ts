import express from "express";
import {
  validateAccessToken,
  checkRequiredRole,
} from "../middleware/auth0.middleware";
import {
  getAdminMessage,
  getEcosystemAdminMessage,
  getProtectedMessage,
  getPublicMessage,
} from "./messages.service";
import { Message } from "./message.model";

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
  checkRequiredRole("admin"),
  (req, res) => {
    const message = getAdminMessage();

    res.status(200).json(message);
  }
);

messagesRouter.get(
  "/ecosystem-admin",
  validateAccessToken,
  checkRequiredRole("ecosystem-admin"),
  (req, res) => {
    const message = getEcosystemAdminMessage();

    res.status(200).json(message);
  }
);

