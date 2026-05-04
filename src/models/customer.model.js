import mongoose from "mongoose";

/**
 * Customers are anonymous — created when they scan a QR code.
 * No login required. Each scan = new or reused session.
 */
const customerSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    tableNumber: { type: Number, required: true, min: 1, index: true },
    // Optional — if customer wants to add name for personalised service
    name: { type: String, trim: true, default: "" },
    // Random tag to correlate session across requests without login
    sessionTag: { type: String, required: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

customerSchema.index({ restaurantId: 1, tableNumber: 1, sessionTag: 1 });

export default mongoose.model("Customer", customerSchema);