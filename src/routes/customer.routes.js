import { Router } from "express";
import {
  scanQr,
  getAllRestaurants,
  getRestaurantDetails,
  getMenu,
  getCategories,
  placeOrder,
  getCustomerOrders,
  getOrderStatus,
} from "../controllers/customer.controller.js";

const router = Router();

// QR scan — creates guest session
router.post("/scan", scanQr);

// Restaurant discovery (for the index.jsx demo buttons)
router.get("/restaurants", getAllRestaurants);
router.get("/restaurants/:restaurantId", getRestaurantDetails);

// Menu
router.get("/restaurants/:restaurantId/menu", getMenu);
router.get("/restaurants/:restaurantId/categories", getCategories);

// Orders
router.post("/orders", placeOrder);
router.get("/restaurants/:restaurantId/table/:tableNumber/orders", getCustomerOrders);
router.get("/orders/:orderId/status", getOrderStatus);

export default router;