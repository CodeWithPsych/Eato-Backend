import crypto from "crypto";
import Owner from "../models/owner.model.js";
import Restaurant from "../models/restaurant.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { COOKIE_OPTIONS } from "../constants.js";
import logger from "../utils/logger.js";

// ── Helpers ───────────────────────────────────────────────────

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const issueTokens = async (owner) => {
  const accessToken = owner.generateAccessToken();
  const refreshToken = owner.generateRefreshToken();
  owner.refreshToken = refreshToken;
  await owner.save({ validateBeforeSave: false });
  return { accessToken, refreshToken };
};

const setRefreshCookie = (res, token) =>
  res.cookie("ownerRefreshToken", token, {
    ...COOKIE_OPTIONS,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

// ── Register ──────────────────────────────────────────────────

export const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password, confirmPassword } = req.body;

  if (!name?.trim() || !email?.trim() || !phone?.trim() || !password) {
    throw new ApiError(400, "name, email, phone and password are required");
  }
  if (password !== confirmPassword) {
    throw new ApiError(400, "Passwords do not match");
  }
  if (password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters");
  }

  const exists = await Owner.findOne({ email: email.toLowerCase().trim() });
  if (exists) throw new ApiError(409, "Email already registered");

  const owner = new Owner({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    isVerified: false,
  });

  await owner.setPassword(password);

  // Send OTP immediately after registration
  const code = generateOtp();
  owner.setOtp(code, 10);
  await owner.save();

  // In production wire this to your email provider (Nodemailer, Resend, etc.)
  if (process.env.NODE_ENV !== "production") {
    logger.info(`[DEV OTP] ${owner.email} → ${code}`);
  }

  return res.status(201).json(
    new ApiResponse(201, { ownerId: owner._id, email: owner.email }, "Registered — OTP sent")
  );
});

// ── Resend OTP ────────────────────────────────────────────────

export const resendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) throw new ApiError(400, "email is required");

  const owner = await Owner.findOne({ email: email.toLowerCase().trim() }).select("+otp +otpExpiresAt");
  if (!owner) throw new ApiError(404, "Owner not found");
  if (owner.isVerified) throw new ApiError(400, "Account already verified");

  const code = generateOtp();
  owner.setOtp(code, 10);
  await owner.save({ validateBeforeSave: false });

  if (process.env.NODE_ENV !== "production") {
    logger.info(`[DEV OTP resend] ${owner.email} → ${code}`);
  }

  return res.status(200).json(new ApiResponse(200, {}, "OTP resent"));
});

// ── Verify OTP ────────────────────────────────────────────────

export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  if (!email?.trim() || !code?.trim()) {
    throw new ApiError(400, "email and code are required");
  }

  const owner = await Owner.findOne({ email: email.toLowerCase().trim() }).select("+otp +otpExpiresAt +passwordHash");
  if (!owner) throw new ApiError(404, "Owner not found");

  if (!owner.verifyOtp(code)) {
    throw new ApiError(400, "Invalid or expired OTP");
  }

  owner.isVerified = true;
  owner.clearOtp();
  const { accessToken, refreshToken } = await issueTokens(owner);

  setRefreshCookie(res, refreshToken);

  return res.status(200).json(
    new ApiResponse(200, { ownerId: owner._id, accessToken, refreshToken }, "Verified successfully")
  );
});

// ── Login ─────────────────────────────────────────────────────

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password) throw new ApiError(400, "email and password are required");

  const owner = await Owner.findOne({ email: email.toLowerCase().trim() }).select("+passwordHash");
  if (!owner) throw new ApiError(401, "Invalid credentials");
  if (!owner.isVerified) throw new ApiError(403, "Email not verified. Please complete OTP verification");

  const ok = await owner.comparePassword(password);
  if (!ok) throw new ApiError(401, "Invalid credentials");

  const { accessToken, refreshToken } = await issueTokens(owner);
  setRefreshCookie(res, refreshToken);

  return res.status(200).json(
    new ApiResponse(200, {
      ownerId: owner._id,
      name: owner.name,
      email: owner.email,
      restaurantId: owner.restaurantId,
      accessToken,
      refreshToken,
    }, "Login successful")
  );
});

// ── Refresh Access Token ──────────────────────────────────────

export const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingToken = req.cookies?.ownerRefreshToken || req.body?.refreshToken;
  if (!incomingToken) throw new ApiError(401, "Refresh token required");

  let payload;
  try {
    const jwt = (await import("jsonwebtoken")).default;
    payload = jwt.verify(incomingToken, process.env.OWNER_REFRESH_SECRET);
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const owner = await Owner.findById(payload.sub).select("+refreshToken");
  if (!owner || owner.refreshToken !== incomingToken) {
    throw new ApiError(401, "Refresh token reuse detected — please login again");
  }

  const { accessToken, refreshToken } = await issueTokens(owner);
  setRefreshCookie(res, refreshToken);

  return res.status(200).json(
    new ApiResponse(200, { accessToken, refreshToken }, "Token refreshed")
  );
});

// ── Logout ────────────────────────────────────────────────────

export const logout = asyncHandler(async (req, res) => {
  await Owner.findByIdAndUpdate(req.user.sub, { $set: { refreshToken: null } }, { new: true });
  res.clearCookie("ownerRefreshToken", COOKIE_OPTIONS);
  return res.status(200).json(new ApiResponse(200, {}, "Logged out"));
});

// ── Get current owner ─────────────────────────────────────────

export const getMe = asyncHandler(async (req, res) => {
  const owner = await Owner.findById(req.user.sub).populate("restaurantId", "name setupStep setupCompleted isPublished");
  if (!owner) throw new ApiError(404, "Owner not found");

  return res.status(200).json(
    new ApiResponse(200, {
      ownerId: owner._id,
      name: owner.name,
      email: owner.email,
      phone: owner.phone,
      restaurantId: owner.restaurantId,
      isVerified: owner.isVerified,
    }, "Owner profile")
  );
});