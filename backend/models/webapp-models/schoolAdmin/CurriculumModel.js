const mongoose = require("mongoose");

const curriculumSchema = new mongoose.Schema(
  {
    // Curriculum belongs to a specific school admin
    schoolAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolAdmin",
      required: true,
    },

    grade: {
      type: String,
      required: true,
    },

    subjects: {
      type: [String],
      required: true,
      default: [],
    },
  },
  { timestamps: true }
);

// Optional: Prevent duplicate grade entries per school
curriculumSchema.index({ schoolAdmin: 1, grade: 1 }, { unique: true });

module.exports = mongoose.model("Curriculum", curriculumSchema);
