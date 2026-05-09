export const DB_NAME = "eatodb";

export const ROLES = Object.freeze({
  OWNER: "owner",
  CHEF: "chef",
  CUSTOMER: "customer",
});

export const ORDER_STATUS = Object.freeze({
  PENDING: "pending",
  ACCEPTED: "accepted",
  READY: "ready",
  SERVED: "served",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

export const SETUP_STEPS = Object.freeze({
  RESTAURANT_INFO: 1,
  CATEGORIES: 2,
  MENU: 3,
  TABLES: 4,
});

export const CLOUDINARY_FOLDERS = Object.freeze({
  MENU_ITEMS: "eato/menu_items",
  CATEGORIES: "eato/categories",
});

export const COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
});


export const QR_VERSION = "1";