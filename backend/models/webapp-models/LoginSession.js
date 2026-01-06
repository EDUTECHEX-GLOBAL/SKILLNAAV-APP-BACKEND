const mongoose = require("mongoose");

const LoginSessionSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Userwebapp",
    required: true,
  },

  schoolAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SchoolAdmin",
    default: null,
  },

  loginAt: {
    type: Date,
    default: Date.now,
  },

  logoutAt: {
    type: Date,
    default: null,
  },

  sessionDuration: {
    type: Number,
    default: null,
  },

}, { timestamps: true });

module.exports = mongoose.model("B2CLoginSession", LoginSessionSchema);
