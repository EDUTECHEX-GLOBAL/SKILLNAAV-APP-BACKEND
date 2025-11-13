const express = require("express");
const router = express.Router();
const {
  getTemplatesByPartner,
  createTemplate,
  deleteTemplate,
  uploadImage,
} = require("../../controllers/offerTemplateController");
const { imageUploader } = require("../../utils/multer");

// Upload background image to S3 (folder: offer-templates)
router.post(
  "/upload-image",
  imageUploader("offer-templates").single("image"),
  uploadImage
);

// Template CRUD routes
router.get("/", getTemplatesByPartner);
router.post("/", createTemplate);
router.delete("/:templateId", deleteTemplate);

module.exports = router;
