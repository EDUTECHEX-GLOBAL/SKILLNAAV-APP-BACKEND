// backend/models/webapp-models/Feedback.js
const mongoose = require("mongoose");

const QuestionMetaSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, default: "text" },
  options: { type: [String], default: undefined } // optional
}, { _id: false });

const FeedbackSchema = new mongoose.Schema({
  flow: { type: String, enum: ["user","partner","schoolAdmin","other"], default: "user" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  userName: { type: String },   // snapshot of user's name at time of feedback
  userEmail: { type: String },  // snapshot of user's email (only saved when appropriate)
  sessionId: { type: String },
  triggeredBy: { type: String, enum: ["logout","timer","actions","exit","manual","post_success","approve"], default: "manual" },
  page: { type: String },
  timestamp: { type: Date, default: Date.now },

  // The answers object (keyed by question id) as before
  answers: { type: mongoose.Schema.Types.Mixed },

  // New: store the exact question snapshot presented to the user (labels/types)
  questionMeta: { type: [QuestionMetaSchema], default: undefined },

  // Admin workflow fields
  status: { type: String, enum: ["new","in_review","actioned","resolved"], default: "new" },
  note: { type: String }, // internal admin note / action

  meta: {
    userAgent: String,
    path: String,
    device: String,
    platform: String,
    ip: String
  },

  docPath: String
}, { timestamps: true });

// Optional: index to make searches by flow + createdAt faster
FeedbackSchema.index({ flow: 1, createdAt: -1 });

module.exports = mongoose.model("Feedback", FeedbackSchema);
