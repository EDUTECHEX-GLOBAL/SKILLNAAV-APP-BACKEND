const mongoose = require("mongoose");

// Sub-schema for questions
const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: [{ type: String }], // For MCQ-type
  correctAnswer: { type: Number }, // optional if AI-generated
  type: {
    type: String,
    enum: ["mcq", "truefalse", "paragraph"],
    default: "mcq"
  },
  marks: { type: Number, default: 1 },
  fromAI: { type: Boolean, default: true },
});

// Main assessment schema
const internshipAssessmentSchema = new mongoose.Schema({
  internshipId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InternshipPosting",
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Userwebapp",
    required: true
  },
  questions: [questionSchema],
  difficulty: {
    type: String,
    enum: ["easy", "medium", "hard"],
    default: "medium"
  },
  aiPromptUsed: { type: String }, // store the AI prompt used for generation
  totalMarks: { type: Number, default: 0 },
  obtainedMarks: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ["not_started", "in_progress", "completed", "passed", "failed"],
    default: "not_started"
  },
  timeLimit: { type: Number, default: 15 }, // in minutes
  passPercentage: { type: Number, default: 60 }, // passing threshold
  generatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("InternshipAssessment", internshipAssessmentSchema);
