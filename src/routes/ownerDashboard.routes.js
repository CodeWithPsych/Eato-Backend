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
router.use(verifyOwnerAccess);

// Dashboard
router.get("/stats", getDashboardStats);

// Menu
router.get("/menu", getMenu);
router.post("/menu", upload.single("image"), addMenuItem);
router.patch("/menu/:itemId", upload.single("image"), updateMenuItem);
router.delete("/menu/:itemId", deleteMenuItem);

// Categories
router.get("/categories", getCategories);
router.post("/categories", upload.single("image"), addCategory);
router.delete("/categories/:categoryId", deleteCategory);

// Chefs
router.get("/chefs", getChefs);
router.post("/chefs", createChef);
router.patch("/chefs/:chefId", updateChef);
router.delete("/chefs/:chefId", deleteChef);

// Orders
router.get("/orders", getRestaurantOrders);
router.patch("/orders/:orderId/status", updateOrderStatus);

export default router;