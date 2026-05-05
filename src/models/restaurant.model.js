import mongoose from "mongoose";

// ── Sub-schemas ───────────────────────────────────────────────

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    // Cloudinary fields
    image: { type: String, default: "" },       // secure_url
    imagePublicId: { type: String, default: "" }, // for deletion
    price: { type: Number, required: true, min: 0 },
    isAvailable: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    emoji: { type: String, default: "🍽️", trim: true },
    // Cloudinary fields (optional category image)
    image: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
  },
  { _id: true }
);

const tableSchema = new mongoose.Schema(
  {
    tableNumber: { type: Number, required: true, min: 1 },
    // qrToken now stores a base64-encoded JSON payload:
    // { restaurantId, tableNumber, wifiPassword }
    qrToken: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

// ── WiFi sub-schema ───────────────────────────────────────────

const wifiSchema = new mongoose.Schema(
  {
    ssid: { type: String, default: "", trim: true },         // Network name
    password: { type: String, default: "", trim: true },     // WiFi password
    securityType: {
      type: String,
      enum: ["WPA2", "WPA", "WEP", "open"],
      default: "WPA2",
    },
  },
  { _id: false }
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

    // logo / banner (optional, Cloudinary)
    logo: { type: String, default: "" },
    logoPublicId: { type: String, default: "" },

    // ── WiFi credentials (used to embed in QR codes) ──────────
    wifi: { type: wifiSchema, default: () => ({}) },

    // Category objects (with optional image)
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