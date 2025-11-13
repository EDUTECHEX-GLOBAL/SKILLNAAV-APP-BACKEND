// models/webapp-models/offerLetterModel.js
const mongoose = require("mongoose");

const offerLetterSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Student"
  },
  name: { type: String, required: true },
  email: { type: String, required: true },
  position: { type: String, required: true },
  companyName: { type: String },
  startDate: { type: Date, required: true },
  internshipId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Internship"
  },
  location: String,
  duration: String,
  stipend: {
    amount: Number,
    currency: String,
    frequency: String
  },
  jobDescription: String,
  qualifications: [String],
  contactInfo: {
    name: String,
    email: String,
    phone: String
  },
  status: {
    type: String,
    enum: ["Sent", "Accepted", "Rejected"],
    default: "Sent"
  },
  sentDate: { type: Date, default: Date.now },
  s3Url: { type: String },

  // ✅ Added missing paymentId field for PAID internships
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InternshipPayment",
    default: null
  },

  schoolAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SchoolAdmin",
    default: null
  }

}, {
  timestamps: true // adds createdAt and updatedAt
});

// ✅ Add indexes for better query performance
offerLetterSchema.index({ studentId: 1, status: 1 });
offerLetterSchema.index({ internshipId: 1 });
offerLetterSchema.index({ paymentId: 1 });

// ✅ Virtual to populate payment info
offerLetterSchema.virtual('paymentInfo', {
  ref: 'InternshipPayment',
  localField: 'paymentId',
  foreignField: '_id',
  justOne: true
});

// ✅ Method to check if offer requires payment
offerLetterSchema.methods.requiresPayment = async function () {
  await this.populate('internshipId', 'internshipType compensationDetails');
  return this.internshipId?.internshipType === 'PAID';
};

// ✅ Method to check if payment is completed
offerLetterSchema.methods.isPaymentCompleted = async function () {
  if (!this.paymentId) return false;

  await this.populate('paymentId', 'status');
  return this.paymentId?.status === 'COMPLETED';
};

module.exports = mongoose.model("OfferLetter", offerLetterSchema);