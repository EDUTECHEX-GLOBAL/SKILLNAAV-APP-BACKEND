const asyncHandler = require("express-async-handler");
const Curriculum = require("../../models/webapp-models/schoolAdmin/CurriculumModel");

// @desc    Create or Update Curriculum for a specific admin
// @route   POST /api/curriculum
// @access  Private (School Admin)
const createOrUpdateCurriculum = asyncHandler(async (req, res) => {
  const { grade, subjects } = req.body;
  const schoolAdminId = req.user._id;

  if (!grade || !subjects || !Array.isArray(subjects)) {
    res.status(400);
    throw new Error("Grade and subjects are required");
  }

  // Find curriculum by admin and grade
  const existing = await Curriculum.findOne({ schoolAdmin: schoolAdminId, grade });

  if (existing) {
    existing.subjects = subjects;
    await existing.save();
    return res.status(200).json({
      message: `Curriculum for ${grade} updated successfully.`,
      curriculum: { grade: existing.grade, subjects: existing.subjects },
    });
  }

  const newCurriculum = await Curriculum.create({
    schoolAdmin: schoolAdminId,
    grade,
    subjects,
  });

  res.status(201).json({
    message: `Curriculum for ${grade} created successfully.`,
    curriculum: { grade: newCurriculum.grade, subjects: newCurriculum.subjects },
  });
});

// @desc    Get all curriculums for logged-in admin OR by grade
// @route   GET /api/curriculum
// @access  Private (School Admin)
const getCurriculums = asyncHandler(async (req, res) => {
  const schoolAdminId = req.user._id;
  const { grade } = req.query;

  if (grade) {
    const curriculum = await Curriculum.findOne({ schoolAdmin: schoolAdminId, grade });
    if (!curriculum) {
      return res.status(404).json({ message: `No curriculum found for ${grade}` });
    }
    return res.status(200).json({ grade: curriculum.grade, subjects: curriculum.subjects });
  }

  const allCurriculums = await Curriculum.find({ schoolAdmin: schoolAdminId });
  const response = allCurriculums.map((c) => ({ grade: c.grade, subjects: c.subjects }));
  res.status(200).json(response);
});

module.exports = { createOrUpdateCurriculum, getCurriculums };
