import Restaurant from "../models/restaurant.model.js";
import Order from "../models/order.model.js";
import Chef from "../models/chef.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinary.js";
import { CLOUDINARY_FOLDERS, ORDER_STATUS } from "../constants.js";
import { Types } from "mongoose";

// ── Helpers ───────────────────────────────────────────────────

/**
 * Resolve the owner's restaurant.
 *
 * Priority:
 *  1. restaurantId embedded in the JWT (fast path — indexed _id lookup)
 *  2. Fallback: find by ownerId (handles tokens issued before setup was completed)
 *
 * This means owners never have to re-login after completing restaurant setup.
 */
const getOwnedRestaurant = async (req) => {
  const ownerId = req.user?.sub;
  if (!ownerId) throw new ApiError(401, "Unauthorized");

  let restaurant = null;

  // Fast path — restaurantId is in the token
  if (req.user.restaurantId) {
    restaurant = await Restaurant.findById(req.user.restaurantId);
  }

  // Fallback — token was issued before restaurant was created/linked
  if (!restaurant) {
    restaurant = await Restaurant.findOne({ ownerId });
  }

  if (!restaurant) {
    throw new ApiError(400, "Restaurant setup not completed");
  }

  return restaurant;
};

const itemId = () => new Types.ObjectId();

// ── DASHBOARD STATS ───────────────────────────────────────────

export const getDashboardStats = asyncHandler(async (req, res) => {
  const restaurant = await getOwnedRestaurant(req);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [orders, menuCount] = await Promise.all([
    Order.find({ restaurantId: restaurant._id, createdAt: { $gte: todayStart } }).lean(),
    restaurant.menu.length,
  ]);

  const totalOrders   = orders.length;
  const totalRevenue  = orders.reduce((s, o) => s + (o.total ?? 0), 0);
  const pendingOrders = orders.filter((o) => o.status === ORDER_STATUS.PENDING).length;
  const servedOrders  = orders.filter((o) => o.status === ORDER_STATUS.SERVED).length;

  const itemMap = {};
  for (const order of orders) {
    for (const item of order.items ?? []) {
      if (!itemMap[item.name]) itemMap[item.name] = { name: item.name, sold: 0, revenue: 0 };
      itemMap[item.name].sold    += item.quantity;
      itemMap[item.name].revenue += item.quantity * item.price;
    }
  }
  const topItems = Object.values(itemMap).sort((a, b) => b.sold - a.sold).slice(0, 5);

  return res.status(200).json(
    new ApiResponse(200, {
      totalOrders,
      totalRevenue,
      pendingOrders,
      servedOrders,
      menuCount,
      topItems,
    }, "Dashboard stats")
  );
});

// ── MENU ──────────────────────────────────────────────────────

export const getMenu = asyncHandler(async (req, res) => {
  const restaurant = await getOwnedRestaurant(req);
  const { category } = req.query;

  const menu = category && category !== "All"
    ? restaurant.menu.filter((i) => i.category === category)
    : restaurant.menu;

  return res.status(200).json(new ApiResponse(200, menu, "Menu fetched"));
});

// ── ADD MENU ITEM ─────────────────────────────────────────────
export const addMenuItem = asyncHandler(async (req, res) => {
  const restaurant = await getOwnedRestaurant(req);
  const { name, category, description = "", price, emoji = "" } = req.body;
 
  if (!name?.trim() || !category?.trim() || price === undefined) {
    throw new ApiError(400, "name, category and price are required");
  }
 
  let image = "", imagePublicId = "";
  if (req.file) {
    const result = await uploadToCloudinary(req.file.path, CLOUDINARY_FOLDERS.MENU_ITEMS);
    image = result.url;
    imagePublicId = result.publicId;
  }
 
  const newItem = {
    _id: itemId(),
    name: name.trim(),
    category: category.trim(),
    description: description.trim(),
    price: Number(price),
    emoji: emoji.trim(),        // ← NEW
    image,
    imagePublicId,
    isAvailable: true,
    isFeatured: false,
  };
 
  restaurant.menu.push(newItem);
  await restaurant.save();
 
  return res.status(201).json(new ApiResponse(201, newItem, "Menu item added"));
});
 
// ── UPDATE MENU ITEM ──────────────────────────────────────────
export const updateMenuItem = asyncHandler(async (req, res) => {
  const restaurant = await getOwnedRestaurant(req);
  const item = restaurant.menu.id(req.params.itemId);
  if (!item) throw new ApiError(404, "Menu item not found");
 
  const { name, category, description, price, isAvailable, isFeatured, emoji } = req.body;
  if (name        !== undefined) item.name        = name.trim();
  if (category    !== undefined) item.category    = category.trim();
  if (description !== undefined) item.description = description.trim();
  if (price       !== undefined) item.price       = Number(price);
  if (isAvailable !== undefined) item.isAvailable = Boolean(isAvailable);
  if (isFeatured  !== undefined) item.isFeatured  = Boolean(isFeatured);
  if (emoji       !== undefined) item.emoji       = emoji.trim();  // ← NEW
 
  if (req.file) {
    if (item.imagePublicId) await deleteFromCloudinary(item.imagePublicId);
    const result = await uploadToCloudinary(req.file.path, CLOUDINARY_FOLDERS.MENU_ITEMS);
    item.image         = result.url;
    item.imagePublicId = result.publicId;
  }
 
  await restaurant.save();
  return res.status(200).json(new ApiResponse(200, item, "Menu item updated"));
});
 

export const deleteMenuItem = asyncHandler(async (req, res) => {
  const restaurant = await getOwnedRestaurant(req);
  const item = restaurant.menu.id(req.params.itemId);
  if (!item) throw new ApiError(404, "Menu item not found");

  if (item.imagePublicId) await deleteFromCloudinary(item.imagePublicId);
  item.deleteOne();
  await restaurant.save();

  return res.status(200).json(
    new ApiResponse(200, { deletedId: req.params.itemId }, "Menu item deleted")
  );
});

// ── CATEGORIES ────────────────────────────────────────────────

export const getCategories = asyncHandler(async (req, res) => {
  const restaurant = await getOwnedRestaurant(req);
  return res.status(200).json(new ApiResponse(200, restaurant.categories, "Categories fetched"));
});

export const addCategory = asyncHandler(async (req, res) => {
  const restaurant = await getOwnedRestaurant(req);
  const { name, emoji = "🍽️" } = req.body;
  if (!name?.trim()) throw new ApiError(400, "Category name is required");

  const exists = restaurant.categories.some(
    (c) => c.name.toLowerCase() === name.toLowerCase().trim()
  );
  if (exists) throw new ApiError(409, "Category already exists");

  let image = "", imagePublicId = "";
  if (req.file) {
    const result = await uploadToCloudinary(req.file.path, CLOUDINARY_FOLDERS.CATEGORIES);
    image = result.url;
    imagePublicId = result.publicId;
  }

  restaurant.categories.push({ name: name.trim(), emoji: emoji.trim(), image, imagePublicId });
  await restaurant.save();

  return res.status(201).json(new ApiResponse(201, restaurant.categories, "Category added"));
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const restaurant = await getOwnedRestaurant(req);
  const cat = restaurant.categories.id(req.params.categoryId);
  if (!cat) throw new ApiError(404, "Category not found");

  if (cat.imagePublicId) await deleteFromCloudinary(cat.imagePublicId);
  cat.deleteOne();
  await restaurant.save();

  return res.status(200).json(new ApiResponse(200, restaurant.categories, "Category deleted"));
});

// ── CHEF MANAGEMENT ───────────────────────────────────────────

export const getChefs = asyncHandler(async (req, res) => {
  const restaurant = await getOwnedRestaurant(req);
  const chefs = await Chef.find({ restaurantId: restaurant._id })
    .select("-passwordHash -refreshToken");
  return res.status(200).json(new ApiResponse(200, chefs, "Chefs fetched"));
});

export const createChef = asyncHandler(async (req, res) => {
  const restaurant = await getOwnedRestaurant(req);
  const { name, username, password } = req.body;

  if (!name?.trim() || !username?.trim() || !password) {
    throw new ApiError(400, "name, username and password are required");
  }
  if (password.length < 6) throw new ApiError(400, "Chef password must be at least 6 characters");

  const exists = await Chef.findOne({ username: username.toLowerCase().trim() });
  if (exists) throw new ApiError(409, "Username already taken");

  const chef = new Chef({
    restaurantId: restaurant._id,
    name: name.trim(),
    username: username.toLowerCase().trim(),
  });
  await chef.setPassword(password);
  await chef.save();

  return res.status(201).json(
    new ApiResponse(201, {
      chefId: chef._id,
      name: chef.name,
      kitchenId: chef.kitchenId,
    }, "Chef account created")
  );
});

export const updateChef = asyncHandler(async (req, res) => {
  const restaurant = await getOwnedRestaurant(req);
  const chef = await Chef.findOne({
    _id: req.params.chefId,
    restaurantId: restaurant._id,
  }).select("+passwordHash");
  if (!chef) throw new ApiError(404, "Chef not found");

  const { name, password, isActive } = req.body;
  if (name     !== undefined) chef.name     = name.trim();
  if (isActive !== undefined) chef.isActive = Boolean(isActive);
  if (password) {
    if (password.length < 6) throw new ApiError(400, "Password too short");
    await chef.setPassword(password);
  }

  await chef.save();
  return res.status(200).json(
    new ApiResponse(200, { chefId: chef._id, name: chef.name }, "Chef updated")
  );
});

export const deleteChef = asyncHandler(async (req, res) => {
  const restaurant = await getOwnedRestaurant(req);
  const chef = await Chef.findOneAndDelete({
    _id: req.params.chefId,
    restaurantId: restaurant._id,
  });
  if (!chef) throw new ApiError(404, "Chef not found");
  return res.status(200).json(
    new ApiResponse(200, { deletedId: req.params.chefId }, "Chef deleted")
  );
});

// ── ORDERS (owner view) ───────────────────────────────────────

export const getRestaurantOrders = asyncHandler(async (req, res) => {
  const restaurant = await getOwnedRestaurant(req);
  const { status, limit = 50, page = 1 } = req.query;

  const filter = { restaurantId: restaurant._id };
  if (status && status !== "all") filter.status = status;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean(),
    Order.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      orders,
      total,
      page: Number(page),
      limit: Number(limit),
    }, "Orders fetched")
  );
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const restaurant = await getOwnedRestaurant(req);
  const { status } = req.body;

  const validStatuses = Object.values(ORDER_STATUS);
  if (!validStatuses.includes(status)) {
    throw new ApiError(400, `Status must be one of: ${validStatuses.join(", ")}`);
  }

  const order = await Order.findOneAndUpdate(
    { _id: req.params.orderId, restaurantId: restaurant._id },
    { $set: { status } },
    { new: true, runValidators: true }
  );
  if (!order) throw new ApiError(404, "Order not found");

  const io = req.app.get("io");
  if (io) io.to(restaurant._id.toString()).emit("order:updated", order);

  return res.status(200).json(new ApiResponse(200, order, "Order status updated"));
});