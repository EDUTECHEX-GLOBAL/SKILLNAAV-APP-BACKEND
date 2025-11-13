const mongoose = require('mongoose');
const StipendDetail = require('../models/webapp-models/StipendDetailModel');

exports.submitStipendDetails = async (req, res) => {
  try {
    const {
      offerId,
      internshipId,
      studentId,
      bankAccountName,
      bankAccountNumber,
      ifscOrSwift,
      preferredCurrency,
      notes
    } = req.body;

    // Create and save stipend detail
    const stipend = new StipendDetail({
      offerId,
      internshipId,
      studentId,
      bankAccountName,
      bankAccountNumber,
      ifscOrSwift,
      preferredCurrency,
      notes
    });

    await stipend.save();

    // You can add code here to: 
    // - Notify the partner (email, dashboard, etc.)

    res.json({ success: true, stipendDetail: stipend });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get stipend details by internshipId
exports.getStipendDetailsByInternship = async (req, res) => {
  try {
    const internshipId = new mongoose.Types.ObjectId(req.params.internshipId); // Use 'new' here
    const stipends = await StipendDetail.find({ internshipId });
    res.json({ success: true, stipendDetails: stipends });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

