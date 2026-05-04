import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import logger from "../utils/logger.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a local file to Cloudinary, then delete the temp file.
 * @param {string} localFilePath  - absolute path from multer
 * @param {string} folder         - cloudinary folder (e.g. "eato/menu_items")
 * @returns {{ url: string, publicId: string }}
 */
export const uploadToCloudinary = async (localFilePath, folder) => {
  if (!localFilePath) return null;

  try {
    const result = await cloudinary.uploader.upload(localFilePath, {
      folder,
      resource_type: "image",
      transformation: [
        { width: 800, height: 800, crop: "limit" },
        { quality: "auto:good" },
        { fetch_format: "auto" },
      ],
    });

    logger.debug(`Cloudinary upload OK: ${result.public_id}`);
    return { url: result.secure_url, publicId: result.public_id };
  } catch (err) {
    logger.error(`Cloudinary upload failed: ${err.message}`);
    throw err;
  } finally {
    // Always clean up temp file regardless of success/failure
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
  }
};

/**
 * Delete an image from Cloudinary by its public_id.
 * Silently ignores errors so a missing image never blocks a DB update.
 */
export const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
    logger.debug(`Cloudinary delete OK: ${publicId}`);
  } catch (err) {
    logger.warn(`Cloudinary delete failed for ${publicId}: ${err.message}`);
  }
};