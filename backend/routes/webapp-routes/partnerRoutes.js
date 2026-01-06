const express = require("express");
const router = express.Router();
const {
  registerPartner,
  authPartner,
  updatePartnerProfile,
  getAllPartners,
  approvePartner,
  rejectPartner,
  checkEmailExists,
  requestPasswordReset,
  verifyOTPAndResetPassword,
  getPartnerProfile, 
  sendPartnerVerificationCode,
  verifyPartnerOTP,
  updatePartnerPlan, 
} = require("../../controllers/partnerController");
const { authenticate } = require("../../middlewares/authMiddleware");
const { profilePicUpload } = require('../../utils/multer'); // Assuming this import is correct

// Middleware to set req.isPartner for all partner routes
router.use((req, res, next) => {
  req.isPartner = true; // Mark as partner
  next();
});

router.post("/register", profilePicUpload.single('profileImage'), registerPartner);
router.post("/login", authPartner); 

// 🎯 CRITICAL FIX: The updatePartnerProfile controller function must be here.
router.put(
    "/profile", 
    authenticate, 
    profilePicUpload.single('profileImage'), 
    updatePartnerProfile // <-- The missing function that saves the file path
); 

router.get("/partners", getAllPartners); 
router.patch("/approve/:partnerId", approvePartner); 
router.patch("/reject/:partnerId", rejectPartner);
router.post("/check-email", checkEmailExists);

router.post('/request-password-reset', requestPasswordReset); 
router.post('/verify-otp-reset-password', verifyOTPAndResetPassword); 
router.get("/profile", authenticate, getPartnerProfile);

router.post("/send-verification-code", sendPartnerVerificationCode);
router.post("/verify-otp", verifyPartnerOTP);
router.put("/subscribe", updatePartnerPlan);


module.exports = router;