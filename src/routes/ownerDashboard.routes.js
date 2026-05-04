import { Router } from "express";
import { verifyOwnerAccess } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import {
  getDashboardStats,
  getMenu,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getCategories,
  addCategory,
  deleteCategory,
  getChefs,
  createChef,
  updateChef,
  deleteChef,
  getRestaurantOrders,
  updateOrderStatus,
} from "../controllers/ownerDashboard.controller.js";

const router = Router();

// ── Dashboard ──────────────────────────────────────────────────
router.get("/stats",     verifyOwnerAccess, getDashboardStats);

// ── Menu ───────────────────────────────────────────────────────
router.get("/menu",                verifyOwnerAccess, getMenu);
router.post("/menu",               verifyOwnerAccess, upload.single("image"), addMenuItem);
router.patch("/menu/:itemId",      verifyOwnerAccess, upload.single("image"), updateMenuItem);
router.delete("/menu/:itemId",     verifyOwnerAccess, deleteMenuItem);

// ── Categories ─────────────────────────────────────────────────
router.get("/categories",              verifyOwnerAccess, getCategories);
router.post("/categories",             verifyOwnerAccess, upload.single("image"), addCategory);
router.delete("/categories/:categoryId", verifyOwnerAccess, deleteCategory);

// ── Chefs ──────────────────────────────────────────────────────
router.get("/chefs",          verifyOwnerAccess, getChefs);
router.post("/chefs",         verifyOwnerAccess, createChef);
router.patch("/chefs/:chefId", verifyOwnerAccess, updateChef);
router.delete("/chefs/:chefId", verifyOwnerAccess, deleteChef);

// ── Orders ─────────────────────────────────────────────────────
router.get("/orders",                    verifyOwnerAccess, getRestaurantOrders);
router.patch("/orders/:orderId/status",  verifyOwnerAccess, updateOrderStatus);

export default router;