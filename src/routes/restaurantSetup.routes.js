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
} from "../controllers/restaurantSetup.controller.js";

const router = Router();

// All setup routes require a verified owner JWT
router.use(verifyOwnerAccess);

router.get("/progress", getSetupProgress);
router.post("/step-1", setupStep1);

// Step 2: categories — accept up to 10 category images (categoryImage_0 … categoryImage_9)
router.post(
  "/step-2",
  upload.fields(
    Array.from({ length: 10 }, (_, i) => ({ name: `categoryImage_${i}`, maxCount: 1 }))
  ),
  setupStep2
);

// Step 3: menu — accept up to 50 menu item images (menuImage_0 … menuImage_49)
router.post(
  "/step-3",
  upload.fields(
    Array.from({ length: 50 }, (_, i) => ({ name: `menuImage_${i}`, maxCount: 1 }))
  ),
  setupStep3
);

router.post("/step-4", setupStep4);
router.post("/complete", completeSetup);

export default router;