const mongoose = require('mongoose');

const stipendDetailSchema = new mongoose.Schema({
  offerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'OfferLetter' },
  internshipId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Internship' },
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  bankAccountName: { type: String, required: true },
  bankAccountNumber: { type: String, required: true },
  ifscOrSwift: { type: String, required: true },
  preferredCurrency: { type: String, required: true },
  notes: { type: String },
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StipendDetail', stipendDetailSchema);
