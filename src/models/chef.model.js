import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const SALT_ROUNDS = 12;

const chefSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, trim: true, lowercase: true },
    kitchenId: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    refreshToken: { type: String, default: null, select: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Per-restaurant unique username (owner can't create duplicate usernames in same restaurant)
chefSchema.index({ restaurantId: 1, username: 1 }, { unique: true });

// Globally unique kitchenId — so chefs can log in without specifying a restaurant
chefSchema.index({ kitchenId: 1 }, { unique: true, sparse: true });

// Auto-fill kitchenId = username if not provided
chefSchema.pre("validate", function (next) {
  if (!this.kitchenId) this.kitchenId = this.username;
  next();
});

// ── Password ──────────────────────────────────────────────────

chefSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, SALT_ROUNDS);
};

chefSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

// ── JWT ───────────────────────────────────────────────────────

chefSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      sub: this._id.toString(),
      role: "chef",
      restaurantId: this.restaurantId.toString(),
      kitchenId: this.kitchenId,
    },
    process.env.CHEF_ACCESS_SECRET,
    { expiresIn: process.env.CHEF_ACCESS_EXPIRES_IN || "8h" }
  );
};

chefSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      sub: this._id.toString(),
      role: "chef",
      restaurantId: this.restaurantId.toString(),
    },
    process.env.CHEF_REFRESH_SECRET,
    { expiresIn: process.env.CHEF_REFRESH_EXPIRES_IN || "7d" }
  );
};

export default mongoose.model("Chef", chefSchema);