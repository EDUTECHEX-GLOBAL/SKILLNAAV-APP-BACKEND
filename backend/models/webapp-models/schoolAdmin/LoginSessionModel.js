const mongoose = require('mongoose');

const loginSessionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Userwebapp", required: true },
  schoolAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolAdmin', required: true },
  loginAt: { type: Date, required: true },
  logoutAt: { type: Date },
  sessionDuration: { type: Number }, // in milliseconds
}, { timestamps: true });

module.exports = mongoose.model('LoginSession', loginSessionSchema);
