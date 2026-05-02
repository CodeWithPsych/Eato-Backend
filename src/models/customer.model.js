// models/customer.model.js
import mongoose from "mongoose";

/**
 * Customer has no login in your frontend.
 * Create a guest customer session tied to restaurant + table after QR scan.
 */
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },

    // useful to track a guest session without auth
    guestTag: { type: String, trim: true, default: "", index: true },

    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    tableNumber: { type: Number, required: true, min: 1, index: true },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

customerSchema.index({ restaurantId: 1, tableNumber: 1, createdAt: -1 });

export default mongoose.model("Customer", customerSchema);