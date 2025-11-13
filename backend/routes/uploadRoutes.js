const express = require("express");
const router = express.Router();
const { imageUploader } = require("../utils/multer");

// Discover image
router.post("/discover-image", imageUploader("discover").single("image"), (req, res) => {
  if (!req.file?.location) {
    return res.status(400).json({ success: false, message: "Upload failed" });
  }
  res.status(200).json({ success: true, imageUrl: req.file.location });
});

// Vision image
router.post("/vision-image", imageUploader("vision").single("image"), (req, res) => {
  console.log("▶️ Received upload");
  console.log("🧾 req.file:", req.file);
  console.log("📎 req.body:", req.body);

  if (!req.file?.location) {
    return res.status(400).json({ success: false, message: "Upload failed — no file received" });
  }

  res.status(200).json({ success: true, imageUrl: req.file.location });
});


// Team image
router.post("/team-image", imageUploader("team").single("image"), (req, res) => {
  if (!req.file?.location) {
    return res.status(400).json({ success: false, message: "Upload failed" });
  }
  res.status(200).json({ success: true, imageUrl: req.file.location });
});

// Feature image
router.post("/feature-image", imageUploader("features").single("image"), (req, res) => {
  if (!req.file?.location) {
    return res.status(400).json({ success: false, message: "Upload failed" });
  }
  res.status(200).json({ success: true, imageUrl: req.file.location });
});

router.post(
  "/job-image",
  imageUploader("jobs").single("image"),
  (req, res) => {
    console.log("▶️ Received job-image upload");
    console.log("🧾 req.file:", req.file);

    if (!req.file?.location) {
      return res
        .status(400)
        .json({ success: false, message: "Upload failed — no file received" });
    }

    res.status(200).json({
      success: true,
      imageUrl: req.file.location,
    });
  }
);
module.exports = router;