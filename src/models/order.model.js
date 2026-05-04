import mongoose from "mongoose";
import { ORDER_STATUS } from "../constants.js";

const orderItemSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 }, // unit price at order time
    quantity: { type: Number, required: true, min: 1, default: 1 },
    customizations: [
      {
        id: { type: String, required: true },
        name: { type: String, default: "" },
        price: { type: Number, default: 0, min: 0 },
      },
    ],
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    // Accepted / marked ready by this chef
    chefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chef",
      default: null,
    },
    tableNumber: { type: Number, required: true, min: 1, index: true },
    items: {
      type: [orderItemSchema],
      validate: [(arr) => arr.length > 0, "Order must have at least one item"],
    },
    subtotal: { type: Number, required: true, min: 0 },
    gst: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
      index: true,
    },
    eta: { type: Number, default: null, min: 0 }, // minutes — set by chef
    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

orderSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, tableNumber: 1, createdAt: -1 });

export default mongoose.model("Order", orderSchema);