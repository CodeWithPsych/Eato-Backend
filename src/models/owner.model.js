import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const SALT_ROUNDS = 12;

const ownerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    phone: { type: String, required: true, trim: true },

    passwordHash: { type: String, required: true, select: false },

    isVerified: { type: Boolean, default: false },

    // OTP for signup verification
    otp: { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null, select: false },

    // Refresh token stored server-side (invalidated on logout)
    refreshToken: { type: String, default: null, select: false },

    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      default: null,
    },
  },
  { timestamps: true }
);

// ── Password ──────────────────────────────────────────────────

ownerSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, SALT_ROUNDS);
};

ownerSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

// ── OTP ───────────────────────────────────────────────────────

ownerSchema.methods.setOtp = function (code, expiresInMinutes = 10) {
  this.otp = code;
  this.otpExpiresAt = new Date(Date.now() + expiresInMinutes * 60_000);
};

ownerSchema.methods.verifyOtp = function (candidate) {
  if (!this.otp || !this.otpExpiresAt) return false;
  if (this.otpExpiresAt < new Date()) return false;
  return this.otp === String(candidate).trim();
};

ownerSchema.methods.clearOtp = function () {
  this.otp = null;
  this.otpExpiresAt = null;
};

// ── JWT ───────────────────────────────────────────────────────

ownerSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { sub: this._id.toString(), role: "owner", restaurantId: this.restaurantId?.toString() ?? null },
    process.env.OWNER_ACCESS_SECRET,
    { expiresIn: process.env.OWNER_ACCESS_EXPIRES_IN || "15m" }
  );
};

ownerSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { sub: this._id.toString(), role: "owner" },
    process.env.OWNER_REFRESH_SECRET,
    { expiresIn: process.env.OWNER_REFRESH_EXPIRES_IN || "30d" }
  );
};

export default mongoose.model("Owner", ownerSchema);