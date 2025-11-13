// controllers/paymentController.js
const Payment = require('../models/webapp-models/internshipPaymentModel');
const OfferLetter = require('../models/webapp-models/offerLetterModel');
const mongoose = require('mongoose');
const Internship = require('../models/webapp-models/internshipPostModel'); // Import Internship model
const Partner = require('../models/webapp-models/partnerModel'); // Import Partner model
const Student = require('../models/webapp-models/userModel'); // Import Student model
const axios = require('axios');

// PayPal Configuration - ✅ Fixed Base URLs
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://api-m.paypal.com'           // ✅ Fixed: Added -m for production
  : 'https://api-m.sandbox.paypal.com';  // ✅ Fixed: Added -m for sandbox

// Get PayPal Access Token
const getPayPalAccessToken = async () => {
  try {
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

    const response = await axios.post(`${PAYPAL_BASE_URL}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error('Error getting PayPal access token:', error.response?.data || error.message);
    throw error;
  }
};

// Create PayPal Order
const createPayPalOrder = async (req, res) => {
  try {
    const { internshipId, offerId, amount, currency = 'USD', studentId } = req.body;

    if (!internshipId || !offerId || !amount || !studentId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // ✅ Fetch internship to get partnerId
    const internship = await Internship.findById(internshipId).select('partnerId');
    if (!internship) {
      return res.status(404).json({ error: 'Internship not found' });
    }

    const accessToken = await getPayPalAccessToken();

    const orderData = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: amount.toString()
        },
        description: `Payment for Paid Internship - Offer ID: ${offerId}`,
      }],
      application_context: {
        return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/offer-letters`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/offer-letters`,
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
      },
    };

    const response = await axios.post(
      `${PAYPAL_BASE_URL}/v2/checkout/orders`,
      orderData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // ✅ Store partnerId in payment
    const payment = new Payment({
      studentId,
      offerId,
      internshipId,
      partnerId: internship.partnerId,
      paypalOrderId: response.data.id,
      amount: parseFloat(amount),
      currency,
      status: 'CREATED',
    });

    await payment.save();

    res.status(201).json({
      success: true,
      orderId: response.data.id,
      paymentId: payment._id,
    });

  } catch (error) {
    console.error('Error creating PayPal order:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
};

// Capture PayPal Payment
const capturePayPalPayment = async (req, res) => {
  try {
    const { orderId, offerId, studentId } = req.body;

    if (!orderId || !offerId || !studentId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('Capturing PayPal payment:', { orderId, offerId, studentId });

    const accessToken = await getPayPalAccessToken();

    // Capture the payment
    const response = await axios.post(
      `${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`,
      {}, // Empty body for capture
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('PayPal capture response:', response.data);

    // Update payment record
    const payment = await Payment.findOneAndUpdate(
      { paypalOrderId: orderId, studentId },
      {
        status: 'COMPLETED',
        paypalPaymentId: response.data.id,
        paypalDetails: response.data,
        completedAt: new Date(), // ✅ Added completion timestamp
      },
      { new: true }
    );

    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    console.log('Payment updated:', payment._id);

    res.status(200).json({
      success: true,
      paymentId: payment._id,
      paypalPaymentId: response.data.id,
      status: response.data.status,
      amount: payment.amount,
      currency: payment.currency,
    });

  } catch (error) {
    console.error('Error capturing PayPal payment:', error.response?.data || error.message);

    // Update payment status to failed
    if (req.body.orderId) {
      try {
        await Payment.findOneAndUpdate(
          { paypalOrderId: req.body.orderId },
          {
            status: 'FAILED',
            failureReason: error.response?.data?.details?.[0]?.description || error.message,
            failedAt: new Date()
          }
        );
      } catch (updateError) {
        console.error('Error updating failed payment:', updateError);
      }
    }

    res.status(500).json({
      error: 'Failed to capture payment',
      details: error.response?.data?.details || error.message
    });
  }
};

// Get Payment Status
const getPaymentStatus = async (req, res) => {
  try {
    const { offerId } = req.params;
    const { studentId } = req.query;

    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const payment = await Payment.findOne({
      offerId,
      studentId,
      status: 'COMPLETED'
    });

    res.json({
      paid: !!payment,
      paymentId: payment?._id,
      amount: payment?.amount,
      currency: payment?.currency,
      paymentDate: payment?.completedAt || payment?.updatedAt,
      paypalPaymentId: payment?.paypalPaymentId,
    });

  } catch (error) {
    console.error('Error getting payment status:', error);
    res.status(500).json({ error: 'Failed to get payment status' });
  }
};

// ✅ New: Get All Payments for Student
const getStudentPayments = async (req, res) => {
  try {
    const { studentId } = req.params;

    const payments = await Payment.find({ studentId })
      .populate('offerId', 'position companyName')
      .populate('internshipId', 'jobTitle companyName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      payments
    });

  } catch (error) {
    console.error('Error getting student payments:', error);
    res.status(500).json({ error: 'Failed to get payment history' });
  }
};
// ==================== ADMIN ANALYTICS ====================

// 1️⃣ Get Payment Summary for a Specific Internship
const getPaymentsForInternship = async (req, res) => {
  try {
    const { internshipId } = req.params;

    if (!internshipId) {
      return res.status(400).json({ error: 'Internship ID is required' });
    }

    const result = await Payment.aggregate([
      {
        $match: {
          internshipId: new mongoose.Types.ObjectId(internshipId),
          status: 'COMPLETED'
        }
      },
      {
        $group: {
          _id: '$internshipId',
          totalPayments: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $lookup: {
          from: 'internships', // ✅ collection name
          localField: '_id',
          foreignField: '_id',
          as: 'internshipDetails'
        }
      },
      {
        $unwind: {
          path: '$internshipDetails',
          preserveNullAndEmptyArrays: true // ✅ Avoid dropping results if internship is missing
        }
      },
      {
        $project: {
          _id: 0,
          internshipId: '$_id',
          internshipTitle: '$internshipDetails.jobTitle',
          companyName: '$internshipDetails.companyName',
          totalPayments: 1,
          totalAmount: 1
        }
      }
    ]);

    res.json({
      success: true,
      data: result[0] || { totalPayments: 0, totalAmount: 0 }
    });

  } catch (error) {
    console.error('Error fetching internship payment summary:', error);
    res.status(500).json({ error: 'Failed to fetch internship payment summary' });
  }
};


// 2️⃣ Get Payment Summary for All Internships of a Partner
const getPaymentsForPartner = async (req, res) => {
  try {
    const { partnerId } = req.params;

    if (!partnerId) {
      return res.status(400).json({ error: 'Partner ID is required' });
    }

    const result = await Payment.aggregate([
      {
        $match: {
          partnerId: new mongoose.Types.ObjectId(partnerId),
          status: 'COMPLETED'
        }
      },
      {
        $group: {
          _id: '$partnerId',
          totalPayments: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $project: {
          _id: 0,
          partnerId: '$_id',
          totalPayments: 1,
          totalAmount: 1
        }
      }
    ]);


    res.json({
      success: true,
      data: result[0] || { totalPayments: 0, totalAmount: 0 }
    });

  } catch (error) {
    console.error('Error fetching partner payment summary:', error);
    res.status(500).json({ error: 'Failed to fetch partner payment summary' });
  }
};

// controllers/paymentController.js

// Get All Payments List for a Specific Internship (Detailed)
const getPaymentsListForInternship = async (req, res) => {
  try {
    const { internshipId } = req.params;

    if (!internshipId) {
      return res.status(400).json({ error: "Internship ID is required" });
    }

    const payments = await Payment.find({
      internshipId: new mongoose.Types.ObjectId(internshipId),
      status: "COMPLETED",
    })
      .populate({
        path: "studentId",
        select: "name email",
        model: Student, // ✅ reference the model
      })
      .populate({
        path: "offerId",
        select: "position",
        model: OfferLetter, // ✅ reference the model
      })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error(
      "Error fetching payments list for internship:",
      error.message
    );
    res.status(500).json({ error: "Failed to fetch payments list" });
  }
};




// ==================== EXPORTS ====================
module.exports = {
  createPayPalOrder,
  capturePayPalPayment,
  getPaymentStatus,
  getStudentPayments,
  getPaymentsForInternship, // ✅ New
  getPaymentsForPartner,     // ✅ New
  getPaymentsListForInternship, // ✅ New
};
