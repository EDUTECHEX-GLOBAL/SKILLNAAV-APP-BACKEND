// // models/webapp-models/internshipPaymentModel.js
// const mongoose = require("mongoose");

// const InternshipPaymentSchema = new mongoose.Schema({
//   studentId: {
//     type: mongoose.Schema.Types.ObjectId,
//     required: true,
//     ref: "Student"
//   },
//   offerId: {
//     type: mongoose.Schema.Types.ObjectId,
//     required: true,
//     ref: "OfferLetter"
//   },
//   internshipId: {
//     type: mongoose.Schema.Types.ObjectId,
//     required: true,
//     ref: "Internship"
//   },
//   paypalOrderId: {
//     type: String,
//     required: true,
//     unique: true
//   },
//   paypalPaymentId: String,
//   amount: {
//     type: Number,
//     required: true,
//     min: 0 // ✅ Added validation
//   },
//   currency: {
//     type: String,
//     required: true,
//     default: 'USD',
//     uppercase: true // ✅ Always store in uppercase
//   },
//   status: {
//     type: String,
//     enum: ['CREATED', 'APPROVED', 'COMPLETED', 'FAILED', 'CANCELLED'], // ✅ Added CANCELLED
//     default: 'CREATED'
//   },
//   paypalDetails: {
//     type: Object,
//     default: {} // ✅ Default empty object
//   },
  
//   // ✅ Enhanced tracking fields
//   completedAt: {
//     type: Date,
//     default: null
//   },
//   failedAt: {
//     type: Date,
//     default: null
//   },
//   failureReason: {
//     type: String,
//     default: null
//   },
  
//   // ✅ Additional metadata
//   paymentMethod: {
//     type: String,
//     default: 'PayPal'
//   },
//   transactionFee: {
//     type: Number,
//     default: 0
//   },
//   netAmount: {
//     type: Number,
//     default: 0
//   },
  
//   // ✅ Audit trail
//   ipAddress: String,
//   userAgent: String,
  
// }, {
//   timestamps: true
// });

// // ✅ Add indexes for better query performance
// InternshipPaymentSchema.index({ studentId: 1, status: 1 });
// InternshipPaymentSchema.index({ paypalOrderId: 1 });
// InternshipPaymentSchema.index({ offerId: 1, studentId: 1 });

// // ✅ Virtual for formatted amount
// InternshipPaymentSchema.virtual('formattedAmount').get(function() {
//   return `${this.amount} ${this.currency}`;
// });

// // ✅ Pre-save middleware to set completion/failure timestamps
// InternshipPaymentSchema.pre('save', function(next) {
//   if (this.isModified('status')) {
//     if (this.status === 'COMPLETED' && !this.completedAt) {
//       this.completedAt = new Date();
//     } else if (this.status === 'FAILED' && !this.failedAt) {
//       this.failedAt = new Date();
//     }
//   }
//   next();
// });

// // ✅ Static method to find payments by student
// InternshipPaymentSchema.statics.findByStudent = function(studentId, status = null) {
//   const query = { studentId };
//   if (status) query.status = status;
  
//   return this.find(query)
//     .populate('offerId', 'position companyName')
//     .populate('internshipId', 'jobTitle companyName')
//     .sort({ createdAt: -1 });
// };

// // ✅ Instance method to mark as completed
// InternshipPaymentSchema.methods.markCompleted = function(paypalDetails = {}) {
//   this.status = 'COMPLETED';
//   this.completedAt = new Date();
//   this.paypalDetails = { ...this.paypalDetails, ...paypalDetails };
//   return this.save();
// };

// // ✅ Instance method to mark as failed
// InternshipPaymentSchema.methods.markFailed = function(reason = 'Unknown error') {
//   this.status = 'FAILED';
//   this.failedAt = new Date();
//   this.failureReason = reason;
//   return this.save();
// };

// module.exports = mongoose.model("InternshipPayment", InternshipPaymentSchema);


// models/webapp-models/internshipPaymentModel.js
const mongoose = require("mongoose");

const InternshipPaymentSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Student"
  },
  offerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "OfferLetter"
  },
  internshipId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Internship"
  },
  partnerId: { // ✅ New field for direct partner reference
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Partner"
  },
  paypalOrderId: {
    type: String,
    required: true,
    unique: true
  },
  paypalPaymentId: String,
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'USD',
    uppercase: true
  },
  status: {
    type: String,
    enum: ['CREATED', 'APPROVED', 'COMPLETED', 'FAILED', 'CANCELLED'],
    default: 'CREATED'
  },
  paypalDetails: {
    type: Object,
    default: {}
  },
  completedAt: Date,
  failedAt: Date,
  failureReason: String
}, { timestamps: true });

// ✅ Useful indexes
InternshipPaymentSchema.index({ studentId: 1, status: 1 });
InternshipPaymentSchema.index({ offerId: 1, studentId: 1 });
InternshipPaymentSchema.index({ partnerId: 1, status: 1 }); // ✅ Speeds up partner queries

module.exports = mongoose.model("InternshipPayment", InternshipPaymentSchema);
