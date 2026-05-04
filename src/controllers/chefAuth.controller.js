import Chef from "../models/chef.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { COOKIE_OPTIONS } from "../constants.js";

// ── Helpers ───────────────────────────────────────────────────

const issueTokens = async (chef) => {
  const accessToken = chef.generateAccessToken();
  const refreshToken = chef.generateRefreshToken();
  chef.refreshToken = refreshToken;
  await chef.save({ validateBeforeSave: false });
  return { accessToken, refreshToken };
};

const setRefreshCookie = (res, token) =>
  res.cookie("chefRefreshToken", token, {
    ...COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

// ── Kitchen Login (called from chef/index.jsx) ────────────────
// Uses kitchenId + password

export const chefLogin = asyncHandler(async (req, res) => {
  const { kitchenId, password, restaurantId } = req.body;
  if (!kitchenId?.trim() || !password) {
    throw new ApiError(400, "kitchenId and password are required");
  }

  const query = { kitchenId: kitchenId.toLowerCase().trim(), isActive: true };
  if (restaurantId) query.restaurantId = restaurantId;

  const chef = await Chef.findOne(query).select("+passwordHash");
  if (!chef) throw new ApiError(401, "Invalid Kitchen ID or password");

  const ok = await chef.comparePassword(password);
  if (!ok) throw new ApiError(401, "Invalid Kitchen ID or password");

  const { accessToken, refreshToken } = await issueTokens(chef);
  setRefreshCookie(res, refreshToken);

  return res.status(200).json(
    new ApiResponse(200, {
      chefId: chef._id,
      name: chef.name,
      kitchenId: chef.kitchenId,
      restaurantId: chef.restaurantId,
      accessToken,
      refreshToken,
    }, "Kitchen login successful")
  );
});

// ── Refresh access token ──────────────────────────────────────

export const refreshChefAccessToken = asyncHandler(async (req, res) => {
  const incomingToken = req.cookies?.chefRefreshToken || req.body?.refreshToken;
  if (!incomingToken) throw new ApiError(401, "Refresh token required");

  let payload;
  try {
    const jwt = (await import("jsonwebtoken")).default;
    payload = jwt.verify(incomingToken, process.env.CHEF_REFRESH_SECRET);
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const chef = await Chef.findById(payload.sub).select("+refreshToken");
  if (!chef || chef.refreshToken !== incomingToken) {
    throw new ApiError(401, "Refresh token reuse detected — please login again");
  }

  const { accessToken, refreshToken } = await issueTokens(chef);
  setRefreshCookie(res, refreshToken);

  return res.status(200).json(
    new ApiResponse(200, { accessToken, refreshToken }, "Token refreshed")
  );
});

// ── Logout ────────────────────────────────────────────────────

export const chefLogout = asyncHandler(async (req, res) => {
  await Chef.findByIdAndUpdate(req.user.sub, { $set: { refreshToken: null } });
  res.clearCookie("chefRefreshToken", COOKIE_OPTIONS);
  return res.status(200).json(new ApiResponse(200, {}, "Logged out"));
});

// ── Get current chef ──────────────────────────────────────────

export const getChefMe = asyncHandler(async (req, res) => {
  const chef = await Chef.findById(req.user.sub);
  if (!chef) throw new ApiError(404, "Chef not found");
  return res.status(200).json(
    new ApiResponse(200, {
      chefId: chef._id,
      name: chef.name,
      kitchenId: chef.kitchenId,
      restaurantId: chef.restaurantId,
    }, "Chef profile")
  );
});