// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const {
  createPayPalOrder,
  capturePayPalPayment,
  getPaymentStatus,
  getStudentPayments,
  getPaymentsForInternship, // ✅ New
  getPaymentsForPartner,    // ✅ New
  getPaymentsListForInternship // ✅ New
} = require('../../controllers/internshipPaymentController');

// ==================== PayPal Routes ====================
router.post('/create-paypal-order', createPayPalOrder);
router.post('/capture-paypal-payment', capturePayPalPayment);
router.get('/status/:offerId', getPaymentStatus);

// ✅ Get payment history for a specific student
router.get('/student/:studentId', getStudentPayments);

// ==================== Admin Payment Analytics ====================
// ✅ Get payment summary for a specific internship
router.get('/admin/internship/:internshipId', getPaymentsForInternship);

// ✅ Get payment summary for all internships of a specific partner
router.get('/admin/partner/:partnerId', getPaymentsForPartner);
// ✅ Get payment list for a specific internship

router.get("/:internshipId/payments", getPaymentsListForInternship);


module.exports = router;
