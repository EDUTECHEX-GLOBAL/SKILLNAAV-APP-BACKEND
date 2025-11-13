const express = require("express");
const router = express.Router();
const {
  createOrUpdateCurriculum,
  getCurriculums,
} = require("../../../controllers/schoolAdmin/curriculumController");
const { protect } = require("../../../middlewares/schoolMiddleware");

// Protect routes for logged-in school admins
router.post("/", protect, createOrUpdateCurriculum);
router.get("/", protect, getCurriculums);

module.exports = router;
