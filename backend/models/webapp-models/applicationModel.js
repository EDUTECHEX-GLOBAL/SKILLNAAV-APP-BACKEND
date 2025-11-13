const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Userwebapp",
    required: true
  },
  internshipId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InternshipPosting",
    required: true
  },
  resumeUrl: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["Applied", "Under Review", "Accepted", "Rejected", "Viewed", "Pending", "In Progress","Completed" ],
    default: "Applied"
  },
  appliedDate: {
    type: Date,
    default: Date.now
  },
  userName: {
    type: String,
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  jobTitle: {
    type: String,
    required: true
  },

  // ✅ New field to track school admin for B2B
  schoolAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Userwebapp", // assuming school admins are in same collection
    default: null
  }
});

const Application = mongoose.model("Application", applicationSchema);

module.exports = Application;
