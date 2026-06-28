import mongoose from "mongoose";

// ── Sub-schemas ───────────────────────────────────────────────

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    image: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
    emoji: { type: String, default: "", trim: true },   // ← NEW
    price: { type: Number, required: true, min: 0 },
    isAvailable: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewsCount: { type: Number, default: 0 },
    lat: { type: Number, default: null },
lng: { type: Number, default: null },
  },
  { timestamps: true }
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    emoji: { type: String, default: "🍽️", trim: true },
    image: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
  },
  { _id: true }
);

const tableSchema = new mongoose.Schema(
  {
    tableNumber: { type: Number, required: true, min: 1 },

    // Raw 32-char hex token — stored for fast DB lookup on QR scan
    qrToken: { type: String, required: true },

    // Full base64url QR payload — THIS is what gets encoded into the physical QR code.
    // It contains restaurantId + tableNumber + qrToken + WiFi credentials.
    // Regenerate whenever WiFi credentials change (see regenerateTableQr endpoint).
    qrPayload: { type: String, default: "" },

    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

// ── Main Schema ───────────────────────────────────────────────

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
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },

    logo: { type: String, default: "" },
    logoPublicId: { type: String, default: "" },

    // ── WiFi credentials ──────────────────────────────────────
    // Set during Step 1 of restaurant setup.
    // These are embedded into every table's QR payload so the mobile app
    // can connect the customer to the restaurant WiFi on scan.
    wifiSsid: { type: String, default: "", trim: true },
    wifiPassword: { type: String, default: "", trim: true },
    wifiType: {
      type: String,
      enum: ["WPA", "WEP", "nopass"],
      default: "WPA",
    },

    categories: [categorySchema],
    menu: [menuItemSchema],

    tableCount: { type: Number, default: 0, min: 0 },
    tables: [tableSchema],

    setupStep: { type: Number, default: 1, min: 1, max: 4 },
    setupCompleted: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Sparse unique index on qrToken — only enforced when token exists
restaurantSchema.index({ "tables.qrToken": 1 }, { unique: true, sparse: true });

export default mongoose.model("Restaurant", restaurantSchema);