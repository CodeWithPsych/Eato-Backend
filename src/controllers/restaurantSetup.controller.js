import crypto from "crypto";
import Owner from "../models/owner.model.js";
import Restaurant from "../models/resturant.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

const ownerIdFromAuth = (req) => {
  if (!req.user?.sub) throw new ApiError(401, "Unauthorized");
  return req.user.sub;
};

const createQrToken = (restaurantId, tableNumber) =>
  crypto
    .createHash("sha256")
    .update(`${restaurantId}:${tableNumber}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 24);

const generateOtp = () =>
  String(Math.floor(100000 + Math.random() * 900000));

const getOrCreateRestaurant = async (ownerId) => {
  const owner = await Owner.findById(ownerId);
  if (!owner) throw new ApiError(404, "Owner not found");

  if (owner.restaurantId) {
    const existing = await Restaurant.findById(owner.restaurantId);
    if (existing) return { owner, restaurant: existing };
  }

  const restaurant = await Restaurant.create({
    ownerId: owner._id,
    name: "",
    location: "",
    categories: [],
    menu: [],
    tableCount: 0,
    tables: [],
    setupStep: 1,
    setupCompleted: false,
    isPublished: false,
  });

  owner.restaurantId = restaurant._id;
  await owner.save();

  return { owner, restaurant };
};

const normalizeMenu = (menu = []) =>
  menu.map((item) => ({
    name: String(item.name || "").trim(),
    category: String(item.category || "").trim(),
    description: String(item.description || "").trim(),
    image: String(item.image || "").trim(),
    price: Number(item.price || 0),
    isAvailable: item.isAvailable ?? true,
  }));

/* ── Public: register ── */
export const registerOwner = asyncHandler(async (req, res) => {
  const { name, email, phone, password, confirmPassword } = req.body;

  if (!name?.trim() || !email?.trim() || !phone?.trim() || !password) {
    throw new ApiError(400, "name, email, phone and password are required");
  }
  if (password !== confirmPassword) {
    throw new ApiError(400, "Passwords do not match");
  }

  const exists = await Owner.findOne({ email: email.toLowerCase().trim() });
  if (exists) throw new ApiError(409, "Email already registered");

  const owner = new Owner({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    isVerified: false,
  });

  await owner.setPassword(password);
  await owner.save();

  return res.status(201).json(
    new ApiResponse(201, { ownerId: owner._id, email: owner.email }, "Registered — send OTP")
  );
});

/* ── Public: send OTP ── */
export const sendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) throw new ApiError(400, "email is required");

  const owner = await Owner.findOne({ email: email.toLowerCase().trim() }).select(
    "+otp +otpExpiresAt"
  );
  if (!owner) throw new ApiError(404, "Owner not found");

  const code = generateOtp();
  owner.setOtp(code, 10);
  await owner.save();

  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV OTP] ${owner.email}: ${code}`);
  }

  return res.status(200).json(new ApiResponse(200, {}, "OTP sent"));
});

/* ── Public: verify OTP + tokens ── */
export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  if (!email?.trim() || !code?.trim()) {
    throw new ApiError(400, "email and code are required");
  }

  const owner = await Owner.findOne({ email: email.toLowerCase().trim() }).select(
    "+otp +otpExpiresAt"
  );
  if (!owner) throw new ApiError(404, "Owner not found");

  if (!owner.verifyOtp(String(code).trim())) {
    throw new ApiError(400, "Invalid or expired OTP");
  }

  owner.isVerified = true;
  owner.clearOtp();
  await owner.save();

  const accessToken = owner.generateAccessToken();
  const refreshToken = owner.generateRefreshToken();

  return res.status(200).json(
    new ApiResponse(
      200,
      { ownerId: owner._id, accessToken, refreshToken },
      "Verified — use access token for setup"
    )
  );
});

/* ── Protected: setup ── */
export const getSetupProgress = asyncHandler(async (req, res) => {
  const ownerId = ownerIdFromAuth(req);
  const { restaurant } = await getOrCreateRestaurant(ownerId);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        restaurantId: restaurant._id,
        name: restaurant.name,
        location: restaurant.location,
        categories: restaurant.categories,
        menu: restaurant.menu,
        tableCount: restaurant.tableCount,
        tables: restaurant.tables,
        setupStep: restaurant.setupStep,
        setupCompleted: restaurant.setupCompleted,
      },
      "Setup progress"
    )
  );
});

export const createOrUpdateStep1 = asyncHandler(async (req, res) => {
  const ownerId = ownerIdFromAuth(req);
  const { name, location = "" } = req.body;
  if (!name?.trim()) throw new ApiError(400, "Restaurant name is required");

  const { restaurant } = await getOrCreateRestaurant(ownerId);
  restaurant.name = name.trim();
  restaurant.location = String(location).trim();
  restaurant.setupStep = Math.max(restaurant.setupStep, 2);
  await restaurant.save();

  return res.status(200).json(new ApiResponse(200, restaurant, "Step 1 saved"));
});

export const createOrUpdateStep2 = asyncHandler(async (req, res) => {
  const ownerId = ownerIdFromAuth(req);
  const { categories } = req.body;
  if (!Array.isArray(categories) || !categories.length) {
    throw new ApiError(400, "categories array is required");
  }
  const cleaned = [...new Set(categories.map((c) => String(c).trim()).filter(Boolean))];
  if (!cleaned.length) throw new ApiError(400, "At least one category required");

  const { restaurant } = await getOrCreateRestaurant(ownerId);
  restaurant.categories = cleaned;
  restaurant.setupStep = Math.max(restaurant.setupStep, 3);
  await restaurant.save();

  return res.status(200).json(new ApiResponse(200, restaurant, "Step 2 saved"));
});

export const createOrUpdateStep3 = asyncHandler(async (req, res) => {
  const ownerId = ownerIdFromAuth(req);
  const { menu } = req.body;
  if (!Array.isArray(menu) || !menu.length) {
    throw new ApiError(400, "menu array is required");
  }
  const parsed = normalizeMenu(menu);
  const bad = parsed.some(
    (m) => !m.name || !m.category || Number.isNaN(m.price) || m.price < 0
  );
  if (bad) throw new ApiError(400, "Invalid menu items");

  const { restaurant } = await getOrCreateRestaurant(ownerId);
  restaurant.menu = parsed;
  restaurant.setupStep = Math.max(restaurant.setupStep, 4);
  await restaurant.save();

  return res.status(200).json(new ApiResponse(200, restaurant, "Step 3 saved"));
});

export const createOrUpdateStep4 = asyncHandler(async (req, res) => {
  const ownerId = ownerIdFromAuth(req);
  const tableCount = Number(req.body.tableCount);
  if (!Number.isInteger(tableCount) || tableCount < 1) {
    throw new ApiError(400, "Valid tableCount is required");
  }

  const { restaurant } = await getOrCreateRestaurant(ownerId);
  restaurant.tableCount = tableCount;
  restaurant.tables = Array.from({ length: tableCount }, (_, i) => {
    const tableNumber = i + 1;
    return {
      tableNumber,
      qrToken: createQrToken(restaurant._id.toString(), tableNumber),
      isActive: true,
    };
  });
  restaurant.setupStep = 4;
  await restaurant.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        restaurantId: restaurant._id,
        tableCount: restaurant.tableCount,
        tables: restaurant.tables,
      },
      "Step 4 saved"
    )
  );
});

export const completeSetup = asyncHandler(async (req, res) => {
  const ownerId = ownerIdFromAuth(req);
  const { restaurant } = await getOrCreateRestaurant(ownerId);

  if (!restaurant.name?.trim()) throw new ApiError(400, "Step 1 incomplete");
  if (!restaurant.categories?.length) throw new ApiError(400, "Step 2 incomplete");
  if (!restaurant.menu?.length) throw new ApiError(400, "Step 3 incomplete");
  if (!restaurant.tableCount || restaurant.tableCount < 1) {
    throw new ApiError(400, "Step 4 incomplete");
  }

  restaurant.setupCompleted = true;
  restaurant.isPublished = true;
  restaurant.setupStep = 4;
  await restaurant.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      { restaurantId: restaurant._id, setupCompleted: true },
      "Setup completed"
    )
  );
});

/* ── Public merged route: register/send-otp/verify-otp ── */
export const authFlow = asyncHandler(async (req, res) => {
  const action = String(req.body?.action || "").trim().toLowerCase();

  if (!action) throw new ApiError(400, "action is required");

  if (action === "register") return registerOwner(req, res);
  if (action === "send-otp") return sendOtp(req, res);
  if (action === "verify-otp") return verifyOtp(req, res);

  throw new ApiError(
    400,
    "Invalid action. Use register, send-otp, or verify-otp"
  );
});

/* ── Protected merged route: progress/step-1..4/complete ── */
export const setupFlow = asyncHandler(async (req, res) => {
  const action = String(req.body?.action || "").trim().toLowerCase();

  if (!action) throw new ApiError(400, "action is required");

  if (action === "progress") return getSetupProgress(req, res);
  if (action === "step-1") return createOrUpdateStep1(req, res);
  if (action === "step-2") return createOrUpdateStep2(req, res);
  if (action === "step-3") return createOrUpdateStep3(req, res);
  if (action === "step-4") return createOrUpdateStep4(req, res);
  if (action === "complete") return completeSetup(req, res);

  throw new ApiError(
    400,
    "Invalid action. Use progress, step-1, step-2, step-3, step-4, or complete"
  );
});