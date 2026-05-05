import crypto from "crypto";
import Restaurant from "../models/restaurant.model.js";
import Customer from "../models/customer.model.js";
import Order from "../models/order.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { ORDER_STATUS } from "../constants.js";

// ── QR token helpers ──────────────────────────────────────────

/**
 * Decode and verify a QR token produced by restaurantSetup.controller.js.
 *
 * Token format:  <base64url(JSON payload)>.<hmac8chars>
 *
 * Payload shape: { restaurantId, tableNumber, wifiPassword }
 *
 * Returns the decoded payload or throws ApiError on invalid/tampered token.
 */
const decodeQrToken = (token) => {
  if (!token || typeof token !== "string") {
    throw new ApiError(400, "Invalid QR token");
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new ApiError(400, "Malformed QR token");
  }

  const [payloadB64, receivedHmac] = parts;

  // Verify HMAC to catch tampered tokens
  const expectedHmac = crypto
    .createHmac("sha256", process.env.QR_HMAC_SECRET || "eato-qr-secret")
    .update(payloadB64)
    .digest("hex")
    .slice(0, 8);

  if (receivedHmac !== expectedHmac) {
    throw new ApiError(400, "Invalid QR token — signature mismatch");
  }

  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(json);

    if (!payload.restaurantId || payload.tableNumber === undefined) {
      throw new Error("Missing required fields");
    }

    return payload; // { restaurantId, tableNumber, wifiPassword }
  } catch {
    throw new ApiError(400, "Corrupted QR token payload");
  }
};

// ── QR Scan → create guest session ───────────────────────────
//
// Called immediately after the customer scans the table QR code.
//
// The response includes:
//   - wifiSsid / wifiPassword  so the app can auto-connect the customer
//   - restaurantId / tableNumber for all subsequent API calls
//   - sessionTag to correlate the guest session

export const scanQr = asyncHandler(async (req, res) => {
  const { qrToken } = req.body;
  if (!qrToken?.trim()) throw new ApiError(400, "qrToken is required");

  // ── 1. Decode & verify the token ─────────────────────────
  const decoded = decodeQrToken(qrToken.trim());
  const { restaurantId: encodedRestaurantId, tableNumber: encodedTableNumber, wifiPassword } = decoded;

  // ── 2. Confirm the token still exists in the database ────
  //       (catches regenerated / revoked tokens)
  const restaurant = await Restaurant.findOne({
    _id: encodedRestaurantId,
    "tables.qrToken": qrToken.trim(),
    isPublished: true,
  });

  if (!restaurant) {
    throw new ApiError(404, "Invalid or inactive QR code — please scan again");
  }

  const table = restaurant.tables.find((t) => t.qrToken === qrToken.trim());
  if (!table || !table.isActive) {
    throw new ApiError(400, "This table is currently inactive");
  }

  // ── 3. Create a guest session ─────────────────────────────
  const sessionTag = crypto.randomBytes(16).toString("hex");
  const customer = await Customer.create({
    restaurantId: restaurant._id,
    tableNumber: table.tableNumber,
    sessionTag,
  });

  return res.status(200).json(
    new ApiResponse(200, {
      customerId: customer._id,
      sessionTag,
      restaurantId: restaurant._id,
      restaurantName: restaurant.name,
      tableNumber: table.tableNumber,
      // WiFi info — the app should prompt the customer to connect
      wifi: {
        ssid: restaurant.wifi?.ssid ?? "",
        password: wifiPassword ?? "",          // decoded from the QR token
        securityType: restaurant.wifi?.securityType ?? "WPA2",
      },
    }, "Session started")
  );
});

// ── Get restaurant details (customer view) ────────────────────

export const getRestaurantDetails = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const restaurant = await Restaurant.findById(restaurantId)
    .select("name location rating reviewCount logo categories")
    .lean();
  if (!restaurant) throw new ApiError(404, "Restaurant not found");

  // Return category names as a flat array (as frontend expects)
  const categories = restaurant.categories.map((c) => ({
    id: c._id,
    name: c.name,
    emoji: c.emoji,
    image: c.image,
  }));

  return res.status(200).json(
    new ApiResponse(200, { ...restaurant, categories }, "Restaurant details")
  );
});

// ── Get all restaurants (index.jsx — demo scan buttons) ───────

export const getAllRestaurants = asyncHandler(async (req, res) => {
  const restaurants = await Restaurant.find({ isPublished: true })
    .select("name location rating reviewCount logo")
    .lean();
  return res.status(200).json(new ApiResponse(200, restaurants, "Restaurants fetched"));
});

// ── Get menu (optionally filtered by category) ────────────────

export const getMenu = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const { category } = req.query;

  const restaurant = await Restaurant.findById(restaurantId).select("menu").lean();
  if (!restaurant) throw new ApiError(404, "Restaurant not found");

  let menu = restaurant.menu.filter((i) => i.isAvailable);
  if (category && category !== "All") {
    menu = menu.filter((i) => i.category === category);
  }

  return res.status(200).json(new ApiResponse(200, menu, "Menu fetched"));
});

// ── Get categories ────────────────────────────────────────────

export const getCategories = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const restaurant = await Restaurant.findById(restaurantId).select("categories").lean();
  if (!restaurant) throw new ApiError(404, "Restaurant not found");

  const categories = restaurant.categories.map((c) => c.name);
  return res.status(200).json(new ApiResponse(200, categories, "Categories fetched"));
});

// ── Place order ───────────────────────────────────────────────

export const placeOrder = asyncHandler(async (req, res) => {
  const { restaurantId, tableNumber, items, customerId, notes = "" } = req.body;

  if (!restaurantId || !tableNumber || !Array.isArray(items) || !items.length) {
    throw new ApiError(400, "restaurantId, tableNumber and items are required");
  }

  // Verify restaurant exists and is published
  const restaurant = await Restaurant.findById(restaurantId).select("isPublished menu").lean();
  if (!restaurant || !restaurant.isPublished) throw new ApiError(404, "Restaurant not found or not active");

  // Validate + enrich items against the live menu
  const enrichedItems = [];
  for (const reqItem of items) {
    const menuItem = restaurant.menu.find(
      (m) => m._id.toString() === reqItem.itemId || m._id.toString() === String(reqItem.itemId)
    );
    if (!menuItem) throw new ApiError(400, `Menu item ${reqItem.itemId} not found`);
    if (!menuItem.isAvailable) throw new ApiError(400, `${menuItem.name} is currently unavailable`);

    enrichedItems.push({
      itemId: menuItem._id.toString(),
      name: menuItem.name,
      price: menuItem.price,
      quantity: reqItem.quantity,
      customizations: reqItem.customizations || [],
    });
  }

  const subtotal = enrichedItems.reduce((s, i) => {
    const custExtra = (i.customizations || []).reduce((cs, c) => cs + (c.price ?? 0), 0);
    return s + (i.price + custExtra) * i.quantity;
  }, 0);

  const gst = parseFloat((subtotal * 0.05).toFixed(2)); // 5% GST
  const total = parseFloat((subtotal + gst).toFixed(2));

  const order = await Order.create({
    restaurantId,
    tableNumber: Number(tableNumber),
    customerId: customerId || null,
    items: enrichedItems,
    subtotal,
    gst,
    discount: 0,
    total,
    notes: notes.trim(),
    status: ORDER_STATUS.PENDING,
  });

  // Notify kitchen via Socket.io
  const io = req.app.get("io");
  if (io) {
    io.to(restaurantId.toString()).emit("order:new", order);
  }

  return res.status(201).json(new ApiResponse(201, order, "Order placed successfully"));
});

// ── Get orders for a customer session ────────────────────────

export const getCustomerOrders = asyncHandler(async (req, res) => {
  const { restaurantId, tableNumber } = req.params;

  const orders = await Order.find({ restaurantId, tableNumber: Number(tableNumber) })
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json(new ApiResponse(200, orders, "Customer orders fetched"));
});

// ── Get single order status (for real-time polling fallback) ──

export const getOrderStatus = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId).select("status eta tableNumber").lean();
  if (!order) throw new ApiError(404, "Order not found");
  return res.status(200).json(new ApiResponse(200, order, "Order status"));
});