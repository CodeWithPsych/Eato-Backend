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
  regenerateTableQr,
} from "../controllers/restaurantSetup.controller.js";

const router = Router();

router.get("/progress", verifyOwnerAccess, getSetupProgress);

// Step 1 now accepts wifiSsid, wifiPassword, wifiType in addition to name + location
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

// Regenerate QR payload for a single table (e.g. after WiFi password change)
router.patch("/tables/:tableNumber/regenerate-qr", verifyOwnerAccess, regenerateTableQr);

export default router;