import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";

const bearer = (req) => {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
};

export const verifyOwnerAccess = asyncHandler(async (req, _res, next) => {
  const token = bearer(req);
  if (!token) throw new ApiError(401, "No access token");

  let payload;
  try {
    payload = jwt.verify(token, process.env.OWNER_ACCESS_SECRET);
  } catch {
    throw new ApiError(401, "Invalid or expired owner access token");
  }

  if (payload.role !== "owner") {
    throw new ApiError(403, "Owner access only");
  }

  req.user = {
    sub: payload.sub,
    role: "owner",
    restaurantId: payload.restaurantId ?? null,
  };

  next();
});

export const verifyChefAccess = asyncHandler(async (req, _res, next) => {
  const token = bearer(req);
  if (!token) throw new ApiError(401, "No access token");

  let payload;
  try {
    payload = jwt.verify(token, process.env.CHEF_ACCESS_SECRET);
  } catch {
    throw new ApiError(401, "Invalid or expired chef access token");
  }

  if (payload.role !== "chef") {
    throw new ApiError(403, "Chef access only");
  }

  req.user = {
    sub: payload.sub,
    role: "chef",
    restaurantId: payload.restaurantId ?? null,
    kitchenId: payload.kitchenId ?? null,
  };

  next();
});