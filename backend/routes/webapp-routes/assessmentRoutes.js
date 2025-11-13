const express = require("express");
const {
  generateAIInternshipAssessment,
  getStudentAssessment,
  submitAssessment,
  getAssessmentSubmission
} = require("../../controllers/assessmentController");

const router = express.Router();

router.post("/generate", generateAIInternshipAssessment);
router.get("/:studentId/:internshipId", getStudentAssessment);
router.post("/submit", submitAssessment);
router.get("/submission/:studentId/:assessmentId", getAssessmentSubmission);

module.exports = router;
