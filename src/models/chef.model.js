// models/chef.model.js
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const SALT_ROUNDS = 10;

const chefSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    name: { type: String, required: true, trim: true },

    // Owner creates this (used in owner profile list)
    username: { type: String, required: true, trim: true, lowercase: true },

    // Chef login screen asks "Kitchen ID" (can be same as username)
    kitchenId: { type: String, trim: true, lowercase: true },

    passwordHash: { type: String, required: true, select: false },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

chefSchema.index({ restaurantId: 1, username: 1 }, { unique: true });

chefSchema.pre("validate", function (next) {
  if (!this.kitchenId) this.kitchenId = this.username;
  next();
});

// password is set/reset by owner only
chefSchema.methods.setPasswordByOwner = async function (plainPassword) {
  this.passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
};

chefSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

chefSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      sub: this._id.toString(),
      role: "chef",
      restaurantId: this.restaurantId.toString(),
      kitchenId: this.kitchenId,
    },
    process.env.CHEF_ACCESS_SECRET,
    { expiresIn: process.env.CHEF_ACCESS_EXPIRES_IN || "15m" }
  );
};

chefSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      sub: this._id.toString(),
      role: "chef",
      restaurantId: this.restaurantId.toString(),
      kitchenId: this.kitchenId,
    },
    process.env.CHEF_REFRESH_SECRET,
    { expiresIn: process.env.CHEF_REFRESH_EXPIRES_IN || "30d" }
  );
};

export default mongoose.model("Chef", chefSchema);