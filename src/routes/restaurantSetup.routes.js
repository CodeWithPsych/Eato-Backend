import { Router } from "express";
import { verifyOwnerAccess } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import {
  getSetupProgress,
  setupStep1,
  setupStep2,
  setupStep3,
  setupStep4,
  completeSetup,
  updateWifi,
} from "../controllers/restaurantSetup.controller.js";

const router = Router();

router.get("/progress", verifyOwnerAccess, getSetupProgress);

// Step 1 now also accepts wifiSsid / wifiPassword / wifiSecurity in the body
router.post("/step-1", verifyOwnerAccess, setupStep1);

router.post(
  "/step-2",
  verifyOwnerAccess,
  upload.fields(
    Array.from({ length: 10 }, (_, i) => ({ name: `categoryImage_${i}`, maxCount: 1 }))
  ),
  setupStep2
);

router.post(
  "/step-3",
  verifyOwnerAccess,
  upload.fields(
    Array.from({ length: 50 }, (_, i) => ({ name: `menuImage_${i}`, maxCount: 1 }))
  ),
  setupStep3
);

router.post("/step-4", verifyOwnerAccess, setupStep4);
router.post("/complete", verifyOwnerAccess, completeSetup);

// Standalone WiFi update — regenerates all QR tokens automatically
router.patch("/wifi", verifyOwnerAccess, updateWifi);

export default router;