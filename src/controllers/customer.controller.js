import crypto from "crypto";
import Restaurant from "../models/restaurant.model.js";
import Customer from "../models/customer.model.js";
import Order from "../models/order.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { ORDER_STATUS } from "../constants.js";
import { decodeQrPayload, wifiConnectionString } from "../utils/qr.js";
import logger from "../utils/logger.js";

// ── QR Scan → create guest session ───────────────────────────
//
// POST /api/v1/customer/scan
// Headers: Content-Type: application/json        ← REQUIRED in Postman/app
// Body:    { "qrPayload": "<base64url string>" }

export const scanQr = asyncHandler(async (req, res) => {
  // Guard: body must be parsed JSON.
  // If Content-Type header is missing, express.json() won't parse the body.
  if (!req.body || typeof req.body !== "object") {
    throw new ApiError(400, "Request body missing — set Content-Type: application/json");
  }

  // Accept both field names for flexibility
  const raw = req.body.qrPayload ?? req.body.qrToken ?? null;

  logger.debug(`[scan] body keys received: ${Object.keys(req.body).join(", ") || "(empty)"}`);
  logger.debug(`[scan] raw payload value: ${raw}`);

  if (!raw || typeof raw !== "string" || !raw.trim()) {
    throw new ApiError(
      400,
      'Body must contain "qrPayload": "<base64url string from QR code>". ' +
      "Make sure Postman is set to Body → raw → JSON and the Content-Type header is application/json."
    );
  }

  // ── 1. Decode the QR payload ──────────────────────────────
  let decoded;
  try {
    decoded = decodeQrPayload(raw.trim());
  } catch (err) {
    logger.warn(`[scan] decode failed: ${err.message}`);
    throw new ApiError(400, `Invalid QR code: ${err.message}`);
  }

  const {
    token,
    restaurantId: payloadRestaurantId,
    tableNumber: payloadTableNumber,
    wifi,
    isLegacy,
  } = decoded;

  logger.debug(`[scan] decoded → rid:${payloadRestaurantId} table:${payloadTableNumber} legacy:${!!isLegacy}`);

  // ── 2. Look up restaurant and verify the token ─────────────
  let restaurant;

  if (isLegacy) {
    restaurant = await Restaurant.findOne({
      "tables.qrToken": token,
      isPublished: true,
    });
  } else {
    restaurant = await Restaurant.findOne({
      _id: payloadRestaurantId,
      isPublished: true,
      "tables.qrToken": token,
    });
  }

  if (!restaurant) {
    const hint =
      process.env.NODE_ENV !== "production"
        ? ` (rid: ${payloadRestaurantId}, tok: ${token?.slice(0, 8)}…)`
        : "";
    throw new ApiError(404, `Invalid QR code or restaurant not active${hint}`);
  }

  // ── 3. Find the specific table ────────────────────────────
  const table = restaurant.tables.find((t) => t.qrToken === token);

  if (!table) throw new ApiError(404, "Table not found for this QR code");
  if (!table.isActive) throw new ApiError(400, "This table is currently inactive");

  if (!isLegacy && payloadTableNumber !== null && table.tableNumber !== payloadTableNumber) {
    throw new ApiError(400, "QR payload table mismatch — please rescan");
  }

  // ── 4. Create a guest session ─────────────────────────────
  const sessionTag = crypto.randomBytes(16).toString("hex");
  const customer = await Customer.create({
    restaurantId: restaurant._id,
    tableNumber: table.tableNumber,
    sessionTag,
  });

  // ── 5. Build menu (available items only) ──────────────────
  const menu = restaurant.menu
    .filter((item) => item.isAvailable)
    .map((item) => ({
      id: item._id,
      name: item.name,
      category: item.category,
      description: item.description,
      price: item.price,
      image: item.image,
      isFeatured: item.isFeatured,
      rating: item.rating,
      reviewsCount: item.reviewsCount,
    }));

  // ── 6. Build categories list ──────────────────────────────
  const categories = restaurant.categories.map((c) => ({
    id: c._id,
    name: c.name,
    emoji: c.emoji,
    image: c.image,
  }));

  // ── 7. Build WiFi info ────────────────────────────────────
  const wifiSource = wifi?.ssid
    ? wifi
    : restaurant.wifiSsid
    ? { ssid: restaurant.wifiSsid, password: restaurant.wifiPassword, type: restaurant.wifiType ?? "WPA" }
    : null;

  const wifiInfo = wifiSource
    ? {
        ssid: wifiSource.ssid,
        password: wifiSource.password,
        type: wifiSource.type ?? "WPA",
        connectionString: wifiConnectionString(wifiSource),
      }
    : null;

  logger.info(`[scan] OK — "${restaurant.name}" table ${table.tableNumber} | customer ${customer._id}`);

  // ── 8. Single response with all 3 things ──────────────────
  return res.status(200).json(
    new ApiResponse(200, {
      // ① WiFi credentials for auto-connect
      wifi: wifiInfo,

      // ② Full restaurant info + menu + categories
      restaurant: {
        id: restaurant._id,
        name: restaurant.name,
        location: restaurant.location,
        rating: restaurant.rating,
        reviewCount: restaurant.reviewCount,
        logo: restaurant.logo,
        categories,
        menu,
      },

      // ③ Session for ordering
      session: {
        customerId: customer._id,
        sessionTag,
        tableNumber: table.tableNumber,
      },
    }, "QR scanned successfully — session started")
  );
});

// ── Get restaurant details (customer view) ────────────────────

export const getRestaurantDetails = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const restaurant = await Restaurant.findById(restaurantId)
    .select("name location rating reviewCount logo categories")
    .lean();
  if (!restaurant) throw new ApiError(404, "Restaurant not found");

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

// ── Get all restaurants ───────────────────────────────────────

export const getAllRestaurants = asyncHandler(async (req, res) => {
  const restaurants = await Restaurant.find({ isPublished: true })
    .select("name location rating reviewCount logo")
    .lean();
  return res.status(200).json(new ApiResponse(200, restaurants, "Restaurants fetched"));
});

// ── Get menu ──────────────────────────────────────────────────

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

  return res.status(200).json(
    new ApiResponse(200, restaurant.categories.map((c) => c.name), "Categories fetched")
  );
});

// ── Place order ───────────────────────────────────────────────

export const placeOrder = asyncHandler(async (req, res) => {
  const { restaurantId, tableNumber, items, customerId, sessionTag, notes = "" } = req.body;

  if (!restaurantId || !tableNumber || !Array.isArray(items) || !items.length) {
    throw new ApiError(400, "restaurantId, tableNumber and items are required");
  }

  if (customerId && sessionTag) {
    const customer = await Customer.findOne({ _id: customerId, sessionTag, restaurantId });
    if (!customer) {
      throw new ApiError(401, "Invalid session — please rescan the table QR code");
    }
  }

  const restaurant = await Restaurant.findById(restaurantId).select("isPublished menu").lean();
  if (!restaurant || !restaurant.isPublished) {
    throw new ApiError(404, "Restaurant not found or not active");
  }

  const enrichedItems = [];
  for (const reqItem of items) {
    const menuItem = restaurant.menu.find(
      (m) => m._id.toString() === String(reqItem.itemId)
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
    const extra = (i.customizations || []).reduce((cs, c) => cs + (c.price ?? 0), 0);
    return s + (i.price + extra) * i.quantity;
  }, 0);

  const gst   = parseFloat((subtotal * 0.05).toFixed(2));
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

  const io = req.app.get("io");
  if (io) io.to(restaurantId.toString()).emit("order:new", order);

  return res.status(201).json(new ApiResponse(201, order, "Order placed successfully"));
});

// ── Get orders for a table session ───────────────────────────

export const getCustomerOrders = asyncHandler(async (req, res) => {
  const { restaurantId, tableNumber } = req.params;

  const orders = await Order.find({
    restaurantId,
    tableNumber: Number(tableNumber),
  })
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json(new ApiResponse(200, orders, "Customer orders fetched"));
});

// ── Get single order status ───────────────────────────────────

export const getOrderStatus = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId)
    .select("status eta tableNumber")
    .lean();
  if (!order) throw new ApiError(404, "Order not found");
  return res.status(200).json(new ApiResponse(200, order, "Order status"));
});