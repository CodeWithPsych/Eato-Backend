import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import errorHandler from "./middlewares/errorHandler.js";
import logger from "./utils/logger.js";

// Routes
import ownerAuthRoutes from "./routes/ownerAuth.routes.js";
import restaurantSetupRoutes from "./routes/restaurantSetup.routes.js";
import ownerDashboardRoutes from "./routes/ownerDashboard.routes.js";
import chefRoutes from "./routes/chef.routes.js";
import customerRoutes from "./routes/customer.routes.js";

const app = express();

// ── Security headers ──────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// ── Rate limiting ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests — try again later" },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many auth attempts — try again later" },
});

app.use(limiter);

// ── Body / cookie parsing ─────────────────────────────────────
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());
app.use(express.static("public"));

// ── HTTP request logging ──────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan("dev", {
      stream: { write: (msg) => logger.http(msg.trim()) },
    })
  );
}

// ── Health check ──────────────────────────────────────────────
app.get("/health", (_req, res) =>
  res.status(200).json({ success: true, message: "Eato API is running 🍽️" })
);

// ── Routes ────────────────────────────────────────────────────
app.use("/api/v1/owner/auth", authLimiter, ownerAuthRoutes);
app.use("/api/v1/owner/setup", restaurantSetupRoutes);
app.use("/api/v1/owner", ownerDashboardRoutes);
app.use("/api/v1/chef", chefRoutes);
app.use("/api/v1/customer", customerRoutes);

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) =>
  res.status(404).json({ success: false, message: "Route not found" })
);

// ── Global error handler ──────────────────────────────────────
app.use(errorHandler);

export { app };