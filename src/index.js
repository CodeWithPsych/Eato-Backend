import "dotenv/config";
import http from "http";
import { Server as SocketIOServer } from "socket.io";

import { app } from "./app.js";
import connectDB from "./db/index.js";
import { registerSocketHandlers } from "./sockets/socketHandler.js";
import logger from "./utils/logger.js";

const PORT = process.env.PORT || 8000;

// ── Create HTTP server (needed to attach Socket.io) ───────────
const server = http.createServer(app);

// ── Socket.io setup ───────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Path is /socket.io by default — matches Socket.io client default
});

// Make io available to controllers via req.app.get("io")
app.set("io", io);

registerSocketHandlers(io);

// ── Boot sequence ─────────────────────────────────────────────
connectDB().then(() => {
  server.listen(PORT, () => {
    logger.info(`🍽️  Eato API running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
    logger.info(`🔌  Socket.io listening on same port`);
  });
});

// ── Graceful shutdown ─────────────────────────────────────────
const shutdown = (signal) => {
  logger.warn(`${signal} received — shutting down`);
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled rejection: ${err.message}`, { stack: err.stack });
});