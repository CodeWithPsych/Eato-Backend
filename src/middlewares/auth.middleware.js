import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";

const extractBearer = (req) => {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  // Also check cookies as fallback
  return req.cookies?.accessToken || null;
};

// ── Owner ─────────────────────────────────────────────────────

export const verifyOwnerAccess = asyncHandler(async (req, _res, next) => {
  const token = extractBearer(req);
  if (!token) throw new ApiError(401, "Access token required");

  let payload;
  try {
    payload = jwt.verify(token, process.env.OWNER_ACCESS_SECRET);
  } catch (err) {
    throw new ApiError(401, err.name === "TokenExpiredError" ? "Access token expired" : "Invalid access token");
  }

  if (payload.role !== "owner") throw new ApiError(403, "Owner access only");

  req.user = {
    sub: payload.sub,
    role: "owner",
    restaurantId: payload.restaurantId ?? null,
  };
  next();
});

// ── Chef ──────────────────────────────────────────────────────

export const verifyChefAccess = asyncHandler(async (req, _res, next) => {
  const token = extractBearer(req);
  if (!token) throw new ApiError(401, "Access token required");

  let payload;
  try {
    payload = jwt.verify(token, process.env.CHEF_ACCESS_SECRET);
  } catch (err) {
    throw new ApiError(401, err.name === "TokenExpiredError" ? "Access token expired" : "Invalid access token");
  }

  if (payload.role !== "chef") throw new ApiError(403, "Chef access only");

  req.user = {
    sub: payload.sub,
    role: "chef",
    restaurantId: payload.restaurantId ?? null,
    kitchenId: payload.kitchenId ?? null,
  };
  next();
});

// ── Owner OR Chef (owner can see kitchen too) ─────────────────

export const verifyOwnerOrChef = asyncHandler(async (req, _res, next) => {
  const token = extractBearer(req);
  if (!token) throw new ApiError(401, "Access token required");

  // Try owner secret first, then chef
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
      throw new ApiError(401, "Invalid or expired access token");
    }
  }

  req.user = {
    sub: payload.sub,
    role,
    restaurantId: payload.restaurantId ?? null,
    kitchenId: payload.kitchenId ?? null,
  };
  next();
});