import { Router } from "express";
import { verifyOwnerAccess } from "../middlewares/auth.middleware.js";
import {
  authFlow,
  setupFlow,
} from "../controllers/restaurantSetup.controller.js";

const router = Router();

router.post("/auth", authFlow);
router.post("/setup", verifyOwnerAccess, setupFlow);

export default router;