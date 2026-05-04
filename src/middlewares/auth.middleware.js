import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";

const extractBearer = (req) => {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  return req.cookies?.accessToken || null;
};

// ── Owner ─────────────────────────────────────────────────────

export const verifyOwnerAccess = async (req, res, next) => {
  try {
    const token = extractBearer(req);
    if (!token) return next(new ApiError(401, "Access token required"));

    let payload;
    try {
      payload = jwt.verify(token, process.env.OWNER_ACCESS_SECRET);
    } catch (err) {
      return next(new ApiError(401, err.name === "TokenExpiredError" ? "Access token expired" : "Invalid access token"));
    }

    if (payload.role !== "owner") return next(new ApiError(403, "Owner access only"));

    req.user = {
      sub: payload.sub,
      role: "owner",
      restaurantId: payload.restaurantId ?? null,
    };
    next();
  } catch (err) {
    next(err);
  }
};

// ── Chef ──────────────────────────────────────────────────────

export const verifyChefAccess = async (req, res, next) => {
  try {
    const token = extractBearer(req);
    if (!token) return next(new ApiError(401, "Access token required"));

    let payload;
    try {
      payload = jwt.verify(token, process.env.CHEF_ACCESS_SECRET);
    } catch (err) {
      return next(new ApiError(401, err.name === "TokenExpiredError" ? "Access token expired" : "Invalid access token"));
    }

    if (payload.role !== "chef") return next(new ApiError(403, "Chef access only"));

    req.user = {
      sub: payload.sub,
      role: "chef",
      restaurantId: payload.restaurantId ?? null,
      kitchenId: payload.kitchenId ?? null,
    };
    next();
  } catch (err) {
    next(err);
  }
};

// ── Owner OR Chef ─────────────────────────────────────────────

export const verifyOwnerOrChef = async (req, res, next) => {
  try {
    const token = extractBearer(req);
    if (!token) return next(new ApiError(401, "Access token required"));

    let payload = null;
    let role = null;

    try {
      payload = jwt.verify(token, process.env.OWNER_ACCESS_SECRET);
      role = "owner";
    } catch {
      try {
        payload = jwt.verify(token, process.env.CHEF_ACCESS_SECRET);
        role = "chef";
      } catch (err) {
        return next(new ApiError(401, "Invalid or expired access token"));
      }
    }

    req.user = {
      sub: payload.sub,
      role,
      restaurantId: payload.restaurantId ?? null,
      kitchenId: payload.kitchenId ?? null,
    };
    next();
  } catch (err) {
    next(err);
  }
};