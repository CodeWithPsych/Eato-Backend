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
    // Kitchen ID shown on the login screen — defaults to username
    kitchenId: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    refreshToken: { type: String, default: null, select: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

chefSchema.index({ restaurantId: 1, username: 1 }, { unique: true });

// Auto-fill kitchenId = username if not provided
chefSchema.pre("validate", function (next) {
  if (!this.kitchenId) this.kitchenId = this.username;
  next();
});

// ── Password (set by owner only) ──────────────────────────────

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
    { sub: this._id.toString(), role: "chef", restaurantId: this.restaurantId.toString() },
    process.env.CHEF_REFRESH_SECRET,
    { expiresIn: process.env.CHEF_REFRESH_EXPIRES_IN || "7d" }
  );
};

export default mongoose.model("Chef", chefSchema);