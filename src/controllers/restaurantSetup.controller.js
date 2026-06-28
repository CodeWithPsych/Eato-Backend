import crypto from "crypto";
import Owner from "../models/owner.model.js";
import Restaurant from "../models/restaurant.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinary.js";
import { CLOUDINARY_FOLDERS } from "../constants.js";
import { encodeQrPayload } from "../utils/qr.js";

// ── Helpers ───────────────────────────────────────────────────

const ownerIdFromAuth = (req) => {
  if (!req.user?.sub) throw new ApiError(401, "Unauthorized");
  return req.user.sub;
};

const createRawToken = () =>
  crypto.randomBytes(16).toString("hex"); // 32-char hex

const buildQrPayload = (restaurant, tableNumber, rawToken) =>
  encodeQrPayload({
    restaurantId: restaurant._id.toString(),
    tableNumber,
    token: rawToken,
    wifi: restaurant.wifiSsid
      ? {
          ssid: restaurant.wifiSsid,
          password: restaurant.wifiPassword ?? "",
          type: restaurant.wifiType ?? "WPA",
        }
      : null,
  });

const getOrCreateRestaurant = async (ownerId) => {
  const owner = await Owner.findById(ownerId);
  if (!owner) throw new ApiError(404, "Owner not found");

  if (owner.restaurantId) {
    const existing = await Restaurant.findById(owner.restaurantId);
    if (existing) return { owner, restaurant: existing };
  }

  const restaurant = await Restaurant.create({ ownerId: owner._id });
  owner.restaurantId = restaurant._id;
  await owner.save({ validateBeforeSave: false });

  return { owner, restaurant };
};

// ── GET /setup/progress ───────────────────────────────────────

export const getSetupProgress = asyncHandler(async (req, res) => {
  const { restaurant } = await getOrCreateRestaurant(ownerIdFromAuth(req));

  return res.status(200).json(
    new ApiResponse(200, {
      restaurantId: restaurant._id,
      name: restaurant.name,
      location: restaurant.location,
      categories: restaurant.categories,
      menu: restaurant.menu,
      tableCount: restaurant.tableCount,
      tables: restaurant.tables,
      wifiSsid: restaurant.wifiSsid,
      setupStep: restaurant.setupStep,
      setupCompleted: restaurant.setupCompleted,
    }, "Setup progress")
  );
});

// ── STEP 1 — Restaurant name, location & WiFi ─────────────────
// Body: { name, location?, wifiSsid?, wifiPassword?, wifiType? }

export const setupStep1 = asyncHandler(async (req, res) => {
  const { name, location, wifiSsid, wifiPassword, wifiType, lat, lng } = req.body;

  if (!name?.trim()) throw new ApiError(400, "Restaurant name is required");

  const { restaurant } = await getOrCreateRestaurant(ownerIdFromAuth(req));

restaurant.name = name.trim();
restaurant.location = String(location).trim();
restaurant.wifiSsid = String(wifiSsid).trim();
restaurant.wifiPassword = String(wifiPassword).trim();
restaurant.wifiType = ["WPA", "WEP", "nopass"].includes(wifiType) ? wifiType : "WPA";
if (lat !== undefined) restaurant.lat = Number(lat);
if (lng !== undefined) restaurant.lng = Number(lng);

  restaurant.setupStep = Math.max(restaurant.setupStep, 2);
  await restaurant.save();

  return res.status(200).json(new ApiResponse(200, restaurant, "Step 1 saved"));
});

// ── STEP 2 — Categories (with optional image per category) ────

export const setupStep2 = asyncHandler(async (req, res) => {
  let categories;
  try {
    categories = typeof req.body.categories === "string"
      ? JSON.parse(req.body.categories)
      : req.body.categories;
  } catch {
    throw new ApiError(400, "categories must be a valid JSON array");
  }

  if (!Array.isArray(categories) || !categories.length) {
    throw new ApiError(400, "At least one category is required");
  }

  const { restaurant } = await getOrCreateRestaurant(ownerIdFromAuth(req));

  const uploadedImages = {};
  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files) {
      const match = file.fieldname.match(/categoryImage_(\d+)/);
      if (match) {
        const idx = parseInt(match[1]);
        const result = await uploadToCloudinary(file.path, CLOUDINARY_FOLDERS.CATEGORIES);
        uploadedImages[idx] = result;
      }
    }
  }

  for (const cat of restaurant.categories) {
    if (cat.imagePublicId) await deleteFromCloudinary(cat.imagePublicId);
  }

  restaurant.categories = categories.map((cat, idx) => {
    const img = uploadedImages[idx];
    return {
      name: String(cat.name || "").trim(),
      emoji: String(cat.emoji || "🍽️").trim(),
      image: img?.url || cat.image || "",
      imagePublicId: img?.publicId || cat.imagePublicId || "",
    };
  });

  restaurant.setupStep = Math.max(restaurant.setupStep, 3);
  await restaurant.save();

  return res.status(200).json(new ApiResponse(200, restaurant, "Step 2 saved"));
});

// ── STEP 3 — Menu items (with optional image per item) ────────

export const setupStep3 = asyncHandler(async (req, res) => {
  let menu;
  try {
    menu = typeof req.body.menu === "string" ? JSON.parse(req.body.menu) : req.body.menu;
  } catch {
    throw new ApiError(400, "menu must be a valid JSON array");
  }

  if (!Array.isArray(menu) || !menu.length) {
    throw new ApiError(400, "At least one menu item is required");
  }

  const { restaurant } = await getOrCreateRestaurant(ownerIdFromAuth(req));

  const uploadedImages = {};
  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files) {
      const match = file.fieldname.match(/menuImage_(\d+)/);
      if (match) {
        const idx = parseInt(match[1]);
        const result = await uploadToCloudinary(file.path, CLOUDINARY_FOLDERS.MENU_ITEMS);
        uploadedImages[idx] = result;
      }
    }
  }

  for (const item of restaurant.menu) {
    if (item.imagePublicId) await deleteFromCloudinary(item.imagePublicId);
  }

  restaurant.menu = menu.map((item, idx) => {
    const img = uploadedImages[idx];
    return {
      name: String(item.name || "").trim(),
      category: String(item.category || "").trim(),
      description: String(item.description || "").trim(),
      price: Number(item.price || 0),
      isAvailable: item.isAvailable ?? true,
      image: img?.url || item.image || "",
      imagePublicId: img?.publicId || item.imagePublicId || "",
    };
  });

  restaurant.setupStep = Math.max(restaurant.setupStep, 4);
  await restaurant.save();

  return res.status(200).json(new ApiResponse(200, restaurant, "Step 3 saved"));
});

// ── STEP 4 — Tables & QR generation ──────────────────────────
// Body: { tableCount }
//
// Each table document now stores:
//   rawToken   — 32-char hex secret (used for DB lookup on scan)
//   qrPayload  — full base64url string that gets encoded into the physical QR code
//               (contains restaurantId + tableNumber + rawToken + WiFi creds)

export const setupStep4 = asyncHandler(async (req, res) => {
  const tableCount = Number(req.body.tableCount);
  if (!Number.isInteger(tableCount) || tableCount < 1) {
    throw new ApiError(400, "tableCount must be a positive integer");
  }

  const { restaurant } = await getOrCreateRestaurant(ownerIdFromAuth(req));

  restaurant.tableCount = tableCount;
  restaurant.tables = Array.from({ length: tableCount }, (_, i) => {
    const tableNumber = i + 1;
    const rawToken = createRawToken();
    const qrPayload = buildQrPayload(restaurant, tableNumber, rawToken);

    return {
      tableNumber,
      qrToken: rawToken,      // stored for fast DB lookup
      qrPayload,              // encode THIS string into the physical QR code
      isActive: true,
    };
  });

  restaurant.setupStep = 4;
  await restaurant.save();

  return res.status(200).json(
    new ApiResponse(200, {
      restaurantId: restaurant._id,
      tableCount: restaurant.tableCount,
      tables: restaurant.tables.map((t) => ({
        tableNumber: t.tableNumber,
        isActive: t.isActive,
        qrPayload: t.qrPayload,   // mobile / print uses this as the QR code content
        // rawToken intentionally omitted from response (stored in DB only)
      })),
    }, "Step 4 saved — QR tokens generated")
  );
});

// ── Regenerate QR codes for a single table (e.g. after WiFi password change) ──
// PATCH /setup/tables/:tableNumber/regenerate-qr

export const regenerateTableQr = asyncHandler(async (req, res) => {
  const tableNumber = Number(req.params.tableNumber);
  const { restaurant } = await getOrCreateRestaurant(ownerIdFromAuth(req));

  const table = restaurant.tables.find((t) => t.tableNumber === tableNumber);
  if (!table) throw new ApiError(404, `Table ${tableNumber} not found`);

  const rawToken = createRawToken();
  table.qrToken = rawToken;
  table.qrPayload = buildQrPayload(restaurant, tableNumber, rawToken);
  await restaurant.save();

  return res.status(200).json(
    new ApiResponse(200, {
      tableNumber: table.tableNumber,
      qrPayload: table.qrPayload,
    }, "QR code regenerated")
  );
});

// ── Complete setup ────────────────────────────────────────────

export const completeSetup = asyncHandler(async (req, res) => {
  const { restaurant } = await getOrCreateRestaurant(ownerIdFromAuth(req));

  if (!restaurant.name?.trim()) throw new ApiError(400, "Step 1 incomplete: restaurant name missing");
  if (!restaurant.categories?.length) throw new ApiError(400, "Step 2 incomplete: no categories");
  if (!restaurant.menu?.length) throw new ApiError(400, "Step 3 incomplete: no menu items");
  if (!restaurant.tableCount || restaurant.tableCount < 1) {
    throw new ApiError(400, "Step 4 incomplete: no tables set up");
  }

  restaurant.setupCompleted = true;
  restaurant.isPublished = true;
  await restaurant.save();

  return res.status(200).json(
    new ApiResponse(200, { restaurantId: restaurant._id, setupCompleted: true }, "Restaurant is live!")
  );
});