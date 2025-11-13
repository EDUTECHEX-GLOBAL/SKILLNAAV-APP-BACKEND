const mongoose = require("mongoose");

// Schema for each question response
const responseSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: { type: [String], required: true }, // All 4 options
  correctAnswer: { type: Number, required: true }, // 0-based index
  studentAnswer: { type: Number, required: true }, // 0-based index
  isCorrect: { type: Boolean, required: true },
  marks: { type: Number, required: true },
  topic: { type: String }, // optional, useful for AI feedback
});

// Schema for violation tracking
const violationSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['TAB_SWITCH', 'KEYBOARD_ATTEMPT', 'FULLSCREEN_EXIT', 'CONTEXT_MENU', 'BLUR_EVENT', 'OTHER'],
    required: true 
  },
  timestamp: { type: String, required: true },
  message: { type: String, required: true },
  severity: { 
    type: String, 
    enum: ['low', 'medium', 'high'], 
    default: 'medium' 
  }
});

// Main submission schema
const assessmentSubmissionSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Userwebapp",
    required: true,
  },
  assessmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InternshipAssessment",
    required: true,
  },
  responses: [responseSchema], // Student answers with details
  score: { type: Number, required: true },
  totalMarks: { type: Number, required: true },
  percentage: { type: Number, required: true },
  timeTaken: { type: Number, required: true }, // in seconds
  fitStatus: { 
    type: String, 
    enum: ["fit", "not fit"], 
    required: true 
  },
  submittedAt: { type: Date, default: Date.now },

  // Proctoring data
  violations: [violationSchema], // Array of all violations during the exam
  violationCount: { type: Number, default: 0 }, // Total count for quick reference
  
  // Optional proctoring session info
  proctoringSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ProctoringSession",
  },
  proctoringData: {
    mode: { type: String, enum: ["test", "real"], default: "real" },
    cameraEnabled: { type: Boolean, default: false },
    microphoneEnabled: { type: Boolean, default: false },
    fullscreenEnabled: { type: Boolean, default: false },
    sessionDuration: { type: Number }, // in seconds
    startedAt: { type: Date },
    completedAt: { type: Date },
    wasAutoSubmitted: { type: Boolean, default: false }, // If submitted due to violations
    autoSubmitReason: { type: String } // Reason for auto-submission
  },
});

// Index for faster queries
assessmentSubmissionSchema.index({ studentId: 1, assessmentId: 1 });
assessmentSubmissionSchema.index({ submittedAt: -1 });

module.exports = mongoose.model("AssessmentSubmission", assessmentSubmissionSchema);
