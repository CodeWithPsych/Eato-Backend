// models/restaurant.model.js
import mongoose from "mongoose";

/**
 * Dine-in restaurant setup (4 steps):
 * 1) name
 * 2) categories
 * 3) menu
 * 4) tables + QR
 */
const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    image: { type: String, default: "" }, // URL or asset key
    price: { type: Number, required: true, min: 0 },
    isAvailable: { type: Boolean, default: true },

    // optional (for ratings later)
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewsCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

const tableSchema = new mongoose.Schema(
  {
    tableNumber: { type: Number, required: true, min: 1 },
    qrToken: { type: String, required: true }, // encode in QR for scans
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const restaurantSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Owner",
      required: true,
      index: true,
    },

    name: { type: String, default: "", trim: true },
    location: { type: String, default: "", trim: true },

    // Current UI uses category names (chips), so string[] is best
    categories: [{ type: String, trim: true }],

    menu: [menuItemSchema],

    tableCount: { type: Number, default: 0, min: 0 },
    tables: [tableSchema],

    setupStep: { type: Number, default: 1, min: 1, max: 4 },
    setupCompleted: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

restaurantSchema.index({ "tables.qrToken": 1 }, { unique: true });

export default mongoose.model("Restaurant", restaurantSchema);