import { Router } from "express";
import {
  register,
  resendOtp,
  verifyOtp,
  login,
  refreshAccessToken,
  logout,
  getMe,
} from "../controllers/ownerAuth.controller.js";
import { verifyOwnerAccess } from "../middlewares/auth.middleware.js";

const router = Router();

// ── Public ────────────────────────────────────────────────────
router.post("/register", register);
router.post("/resend-otp", resendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/login", login);
router.post("/refresh-token", refreshAccessToken);

// ── Protected ─────────────────────────────────────────────────
router.post("/logout", verifyOwnerAccess, logout);
router.get("/me", verifyOwnerAccess, getMe);

export default router;