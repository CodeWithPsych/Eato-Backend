// models/owner.model.js
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const SALT_ROUNDS = 10;

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

    // OTP verification flow (signup -> send otp -> verify otp -> setup)
    isVerified: { type: Boolean, default: false },

    otp: { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null, select: false },

    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      default: null,
    },
  },
  { timestamps: true }
);

ownerSchema.methods.setPassword = async function (plainPassword) {
  this.passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
};

ownerSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

ownerSchema.methods.setOtp = function (otpCode, expiresInMinutes = 10) {
  this.otp = otpCode;
  this.otpExpiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
};

ownerSchema.methods.verifyOtp = function (candidateOtp) {
  if (!this.otp || !this.otpExpiresAt) return false;
  if (this.otpExpiresAt < new Date()) return false;
  return this.otp === candidateOtp;
};

ownerSchema.methods.clearOtp = function () {
  this.otp = null;
  this.otpExpiresAt = null;
};

ownerSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      sub: this._id.toString(),
      role: "owner",
      restaurantId: this.restaurantId?.toString() ?? null,
    },
    process.env.OWNER_ACCESS_SECRET,
    { expiresIn: process.env.OWNER_ACCESS_EXPIRES_IN || "15m" }
  );
};

ownerSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      sub: this._id.toString(),
      role: "owner",
      restaurantId: this.restaurantId?.toString() ?? null,
    },
    process.env.OWNER_REFRESH_SECRET,
    { expiresIn: process.env.OWNER_REFRESH_EXPIRES_IN || "30d" }
  );
};

export default mongoose.model("Owner", ownerSchema);