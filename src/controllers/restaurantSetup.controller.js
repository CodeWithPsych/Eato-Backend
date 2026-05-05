import crypto from "crypto";
import Owner from "../models/owner.model.js";
import Restaurant from "../models/restaurant.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinary.js";
import { CLOUDINARY_FOLDERS } from "../constants.js";

// ── Helpers ───────────────────────────────────────────────────

const ownerIdFromAuth = (req) => {
  if (!req.user?.sub) throw new ApiError(401, "Unauthorized");
  return req.user.sub;
};

/**
 * Build the QR token for a table.
 *
 * The token is a base64url-encoded JSON payload containing the three pieces
 * of data a customer needs when they scan the code:
 *   { restaurantId, tableNumber, wifiPassword }
 *
 * A short HMAC suffix is appended so forged tokens can be detected on scan.
 *
 * Format:  <base64url(payload)>.<hmac8chars>
 */
const createQrToken = (restaurantId, tableNumber, wifiPassword = "") => {
  const payload = Buffer.from(
    JSON.stringify({ restaurantId: String(restaurantId), tableNumber, wifiPassword })
  ).toString("base64url");

  // 8-char HMAC for basic tamper detection (not a security boundary — real
  // verification happens server-side by looking up the token in the DB)
  const hmac = crypto
    .createHmac("sha256", process.env.QR_HMAC_SECRET || "eato-qr-secret")
    .update(payload)
    .digest("hex")
    .slice(0, 8);

  return `${payload}.${hmac}`;
};

/**
 * Find or create the restaurant record tied to this owner.
 */
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
      wifi: {
        ssid: restaurant.wifi?.ssid ?? "",
        // Never expose the raw password in list views — send a masked hint
        passwordSet: !!restaurant.wifi?.password,
        securityType: restaurant.wifi?.securityType ?? "WPA2",
      },
      categories: restaurant.categories,
      menu: restaurant.menu,
      tableCount: restaurant.tableCount,
      tables: restaurant.tables,
      setupStep: restaurant.setupStep,
      setupCompleted: restaurant.setupCompleted,
    }, "Setup progress")
  );
});

// ── STEP 1 — Restaurant name, location & WiFi credentials ─────
//
// Body params:
//   name          (required)  restaurant display name
//   location      (optional)  city / address string
//   wifiSsid      (optional)  WiFi network name (SSID)
//   wifiPassword  (optional)  WiFi password — stored as-is so it can be
//                             embedded in QR codes; encrypt at rest if needed
//   wifiSecurity  (optional)  "WPA2" | "WPA" | "WEP" | "open"  (default WPA2)

export const setupStep1 = asyncHandler(async (req, res) => {
  const {
    name,
    location = "",
    wifiSsid = "",
    wifiPassword = "",
    wifiSecurity = "WPA2",
  } = req.body;

  if (!name?.trim()) throw new ApiError(400, "Restaurant name is required");

  const validSecurityTypes = ["WPA2", "WPA", "WEP", "open"];
  if (wifiSecurity && !validSecurityTypes.includes(wifiSecurity)) {
    throw new ApiError(400, `wifiSecurity must be one of: ${validSecurityTypes.join(", ")}`);
  }

  const { restaurant } = await getOrCreateRestaurant(ownerIdFromAuth(req));

  restaurant.name = name.trim();
  restaurant.location = String(location).trim();

  // Update WiFi credentials
  restaurant.wifi = {
    ssid: String(wifiSsid).trim(),
    password: String(wifiPassword).trim(),
    securityType: wifiSecurity || "WPA2",
  };

  restaurant.setupStep = Math.max(restaurant.setupStep, 2);
  await restaurant.save();

  return res.status(200).json(
    new ApiResponse(200, {
      restaurantId: restaurant._id,
      name: restaurant.name,
      location: restaurant.location,
      wifi: {
        ssid: restaurant.wifi.ssid,
        passwordSet: !!restaurant.wifi.password,
        securityType: restaurant.wifi.securityType,
      },
      setupStep: restaurant.setupStep,
    }, "Step 1 saved")
  );
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

  // Build a map of uploaded category images indexed by position
  const uploadedImages = {};
  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files) {
      // file.fieldname expected to be "categoryImage_0", "categoryImage_1", etc.
      const match = file.fieldname.match(/categoryImage_(\d+)/);
      if (match) {
        const idx = parseInt(match[1]);
        const result = await uploadToCloudinary(file.path, CLOUDINARY_FOLDERS.CATEGORIES);
        uploadedImages[idx] = result;
      }
    }
  }

  // Delete old category images from Cloudinary before replacing
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

  // Upload any new item images (fieldname: menuImage_0, menuImage_1…)
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

  // Delete old item images
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
//
// Each QR token encodes:
//   { restaurantId, tableNumber, wifiPassword }
//
// The customer app decodes the token after scanning to:
//   1. Connect to the restaurant WiFi
//   2. Identify the restaurant
//   3. Know which table they're sitting at

export const setupStep4 = asyncHandler(async (req, res) => {
  const tableCount = Number(req.body.tableCount);
  if (!Number.isInteger(tableCount) || tableCount < 1) {
    throw new ApiError(400, "tableCount must be a positive integer");
  }

  const { restaurant } = await getOrCreateRestaurant(ownerIdFromAuth(req));

  // Pull the WiFi password saved in Step 1 (may be empty string if not set)
  const wifiPassword = restaurant.wifi?.password ?? "";

  restaurant.tableCount = tableCount;
  restaurant.tables = Array.from({ length: tableCount }, (_, i) => ({
    tableNumber: i + 1,
    qrToken: createQrToken(restaurant._id.toString(), i + 1, wifiPassword),
    isActive: true,
  }));
  restaurant.setupStep = 4;
  await restaurant.save();

  // Return the decoded metadata alongside the raw token so the frontend can
  // render QR codes and show a human-readable summary per table
  const tablesWithMeta = restaurant.tables.map((t) => ({
    tableNumber: t.tableNumber,
    qrToken: t.qrToken,
    isActive: t.isActive,
    // Decoded payload for frontend QR rendering
    qrPayload: {
      restaurantId: restaurant._id.toString(),
      tableNumber: t.tableNumber,
      wifiSsid: restaurant.wifi?.ssid ?? "",
      // Intentionally NOT returning wifiPassword here — the raw token already
      // contains it encoded; the frontend should render the token as a QR code
    },
  }));

  return res.status(200).json(
    new ApiResponse(200, {
      restaurantId: restaurant._id,
      tableCount: restaurant.tableCount,
      tables: tablesWithMeta,
      wifiConfigured: !!wifiPassword,
    }, "Step 4 saved — QR tokens generated")
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

// ── UPDATE WiFi credentials (standalone endpoint) ─────────────
// Useful post-setup when the restaurant changes its WiFi password.
// Automatically regenerates all QR tokens.

export const updateWifi = asyncHandler(async (req, res) => {
  const { wifiSsid, wifiPassword, wifiSecurity = "WPA2" } = req.body;

  if (wifiSsid === undefined && wifiPassword === undefined) {
    throw new ApiError(400, "Provide at least wifiSsid or wifiPassword to update");
  }

  const validSecurityTypes = ["WPA2", "WPA", "WEP", "open"];
  if (wifiSecurity && !validSecurityTypes.includes(wifiSecurity)) {
    throw new ApiError(400, `wifiSecurity must be one of: ${validSecurityTypes.join(", ")}`);
  }

  const { restaurant } = await getOrCreateRestaurant(ownerIdFromAuth(req));

  // Merge — only overwrite fields that were supplied
  restaurant.wifi = {
    ssid: wifiSsid !== undefined ? String(wifiSsid).trim() : (restaurant.wifi?.ssid ?? ""),
    password: wifiPassword !== undefined ? String(wifiPassword).trim() : (restaurant.wifi?.password ?? ""),
    securityType: wifiSecurity || restaurant.wifi?.securityType || "WPA2",
  };

  // Regenerate all QR tokens so they carry the new password
  if (restaurant.tables?.length) {
    restaurant.tables = restaurant.tables.map((t) => ({
      ...t.toObject(),
      qrToken: createQrToken(
        restaurant._id.toString(),
        t.tableNumber,
        restaurant.wifi.password
      ),
    }));
  }

  await restaurant.save();

  return res.status(200).json(
    new ApiResponse(200, {
      wifi: {
        ssid: restaurant.wifi.ssid,
        passwordSet: !!restaurant.wifi.password,
        securityType: restaurant.wifi.securityType,
      },
      tablesRegenerated: restaurant.tables.length,
    }, "WiFi updated — all QR tokens regenerated")
  );
});