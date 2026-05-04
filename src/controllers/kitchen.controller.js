import Order from "../models/order.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { ORDER_STATUS } from "../constants.js";

// ── GET kitchen orders (pending + accepted) ───────────────────

export const getKitchenOrders = asyncHandler(async (req, res) => {
  const { restaurantId } = req.user;
  if (!restaurantId) throw new ApiError(400, "restaurantId missing from token");

  const orders = await Order.find({
    restaurantId,
    status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.ACCEPTED, ORDER_STATUS.READY] },
  })
    .sort({ createdAt: 1 }) // oldest first — FIFO kitchen queue
    .lean();

  return res.status(200).json(new ApiResponse(200, orders, "Kitchen orders fetched"));
});

// ── ACCEPT ────────────────────────────────────────────────────

export const acceptOrder = asyncHandler(async (req, res) => {
  const { restaurantId, sub: chefId } = req.user;
  const { eta } = req.body; // minutes

  const order = await Order.findOneAndUpdate(
    { _id: req.params.orderId, restaurantId, status: ORDER_STATUS.PENDING },
    { $set: { status: ORDER_STATUS.ACCEPTED, eta: eta ? Number(eta) : null, chefId } },
    { new: true, runValidators: true }
  );

  if (!order) throw new ApiError(404, "Order not found or already processed");

  const io = req.app.get("io");
  if (io) {
    io.to(restaurantId.toString()).emit("order:updated", order);
    // Notify the specific table room
    io.to(`table:${restaurantId}:${order.tableNumber}`).emit("order:status", {
      orderId: order._id,
      status: order.status,
      eta: order.eta,
    });
  }

  return res.status(200).json(new ApiResponse(200, order, "Order accepted"));
});

// ── REJECT ────────────────────────────────────────────────────

export const rejectOrder = asyncHandler(async (req, res) => {
  const { restaurantId } = req.user;

  const order = await Order.findOneAndUpdate(
    { _id: req.params.orderId, restaurantId, status: ORDER_STATUS.PENDING },
    { $set: { status: ORDER_STATUS.REJECTED } },
    { new: true }
  );

  if (!order) throw new ApiError(404, "Order not found or already processed");

  const io = req.app.get("io");
  if (io) {
    io.to(restaurantId.toString()).emit("order:updated", order);
    io.to(`table:${restaurantId}:${order.tableNumber}`).emit("order:status", {
      orderId: order._id,
      status: order.status,
    });
  }

  return res.status(200).json(new ApiResponse(200, order, "Order rejected"));
});

// ── MARK READY ────────────────────────────────────────────────

export const markOrderReady = asyncHandler(async (req, res) => {
  const { restaurantId } = req.user;

  const order = await Order.findOneAndUpdate(
    { _id: req.params.orderId, restaurantId, status: ORDER_STATUS.ACCEPTED },
    { $set: { status: ORDER_STATUS.READY } },
    { new: true }
  );

  if (!order) throw new ApiError(404, "Order not found or not in accepted state");

  const io = req.app.get("io");
  if (io) {
    io.to(restaurantId.toString()).emit("order:updated", order);
    io.to(`table:${restaurantId}:${order.tableNumber}`).emit("order:status", {
      orderId: order._id,
      status: order.status,
    });
  }

  return res.status(200).json(new ApiResponse(200, order, "Order marked ready"));
});

// ── UPDATE ETA ────────────────────────────────────────────────

export const updateEta = asyncHandler(async (req, res) => {
  const { restaurantId } = req.user;
  const { eta } = req.body;
  if (!eta || isNaN(Number(eta))) throw new ApiError(400, "eta (minutes) is required");

  const order = await Order.findOneAndUpdate(
    { _id: req.params.orderId, restaurantId },
    { $set: { eta: Number(eta) } },
    { new: true }
  );

  if (!order) throw new ApiError(404, "Order not found");

  const io = req.app.get("io");
  if (io) {
    io.to(`table:${restaurantId}:${order.tableNumber}`).emit("order:status", {
      orderId: order._id,
      status: order.status,
      eta: order.eta,
    });
  }

  return res.status(200).json(new ApiResponse(200, order, "ETA updated"));
});