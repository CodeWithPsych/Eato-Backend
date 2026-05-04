import { Router } from "express";
import {
  chefLogin,
  refreshChefAccessToken,
  chefLogout,
  getChefMe,
} from "../controllers/chefAuth.controller.js";
import {
  getKitchenOrders,
  acceptOrder,
  rejectOrder,
  markOrderReady,
  updateEta,
} from "../controllers/kitchen.controller.js";
import { verifyChefAccess } from "../middlewares/auth.middleware.js";

const router = Router();

// ── Auth (public) ─────────────────────────────────────────────
router.post("/login", chefLogin);
router.post("/refresh-token", refreshChefAccessToken);

// ── Protected ─────────────────────────────────────────────────
router.post("/logout", verifyChefAccess, chefLogout);
router.get("/me", verifyChefAccess, getChefMe);

router.get("/orders", verifyChefAccess, getKitchenOrders);
router.patch("/orders/:orderId/accept", verifyChefAccess, acceptOrder);
router.patch("/orders/:orderId/reject", verifyChefAccess, rejectOrder);
router.patch("/orders/:orderId/ready", verifyChefAccess, markOrderReady);
router.patch("/orders/:orderId/eta", verifyChefAccess, updateEta);

export default router;