const asyncHandler = require("express-async-handler");
const Partnerwebapp = require("../models/webapp-models/partnerModel");
const generateToken = require("../utils/generateToken");
const notifyUser = require("../utils/notifyUser");
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const PartnerEmailVerification = require("../models/webapp-models/partnerVerificationModel");

// Get partner profile
const getPartnerProfile = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("User not authenticated.");
  }

  const partner = await Partnerwebapp.findById(req.user._id);

  if (!partner) {
    res.status(404);
    throw new Error("Partner not found.");
  }

  const profileData = {
    _id: partner._id,
    name: partner.name,
    email: partner.email,
    universityName: partner.universityName,
    institutionId: partner.institutionId,
    adminApproved: partner.adminApproved,
    isPremium: partner.isPremium,
    planType: partner.planType,
    premiumExpiration: partner.premiumExpiration,
    active: partner.active,
  };

  res.json(profileData);
});

// Helper function to check required fields
const areFieldsFilled = (fields) => fields.every((field) => field);

// Generate a random OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString(); // Generates a 6-digit OTP
};

// Check if email exists
const checkEmailExists = asyncHandler(async (req, res) => {
    const { email } = req.body;

    // Check if the email is provided
    if (!email) {
        res.status(400);
        throw new Error("Email is required.");
    }

    // Check if a partner with this email already exists
    const partnerExists = await Partnerwebapp.findOne({ email });

    // Respond with whether the email exists
    res.json({ exists: !!partnerExists });
});

// Request Password Reset with OTP
const requestPasswordReset = asyncHandler(async (req, res) => {
    const { email } = req.body;

    // Find the partner by email
    const partner = await Partnerwebapp.findOne({ email });
    if (!partner) {
        res.status(404);
        throw new Error("No account found with that email.");
    }

    // Generate an OTP and save it to the partner model
    const otp = generateOTP();
    partner.otp = otp; // Assuming you have an otp field in your model
    partner.otpExpiration = Date.now() + 300000; // OTP valid for 5 minutes
    await partner.save();

    // Send the OTP to the user's email
    await notifyUser(partner.email, "Your OTP for Password Reset", `<p>Your OTP is: ${otp}</p><p>It is valid for 5 minutes.</p>`);

    res.status(200).json({ message: "OTP sent to your email." });
});

// Verify OTP and Reset Password
const verifyOTPAndResetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;

    // Find the partner by email and check if the OTP is valid
    const partner = await Partnerwebapp.findOne({
        email,
        otp,
        otpExpiration: { $gt: Date.now() } // Check if the OTP is still valid
    });

    if (!partner) {
        res.status(400);
        throw new Error("Invalid or expired OTP.");
    }

    // Set the new password (this will be hashed due to pre-save hook)
    partner.password = newPassword;

    // Clear the OTP fields
    partner.otp = undefined;
    partner.otpExpiration = undefined;

    await partner.save();

    res.status(200).json({ message: "Password has been successfully updated." });
});

// Register a new partner - SET BOTH FIELDS
const registerPartner = asyncHandler(async (req, res) => {
  console.log("Request Body:", req.body);

  const { name, email, password, confirmPassword, universityName, institutionId } = req.body;

  // Check for required fields
  if (!areFieldsFilled([name, email, password, confirmPassword, universityName, institutionId])) {
    res.status(400);
    throw new Error("Please fill all required fields.");
  }

  // Check if passwords match
  if (password !== confirmPassword) {
    res.status(400);
    throw new Error("Passwords do not match.");
  }

  // Create new partner - SET BOTH FIELDS
  const partner = await Partnerwebapp.create({
    name,
    email,
    password,
    universityName,
    institutionId,
    adminApproved: false, // KEEP this
    status: "Pending",    // ADD this
  });

  if (partner) {
    res.status(201).json({
      _id: partner._id,
      name: partner.name,
      email: partner.email,
      universityName: partner.universityName,
      institutionId: partner.institutionId,
      token: generateToken(partner._id),
      adminApproved: partner.adminApproved, // KEEP for backward compatibility
      status: partner.status,               // ADD for new frontend
    });
  } else {
    res.status(400);
    throw new Error("Error occurred while registering partner.");
  }
});

// Authenticate partner - ALLOW LOGIN REGARDLESS OF APPROVAL STATUS
const authPartner = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const partner = await Partnerwebapp.findOne({ email });

  if (partner && await partner.matchPassword(password)) {
    // ✅ REMOVE THE APPROVAL CHECK - Allow login regardless of status
    // if (!partner.adminApproved && partner.status !== "Approved") {
    //   res.status(403);
    //   throw new Error("Your partner account is pending approval. Please wait for admin approval.");
    // }

    const token = generateToken(partner._id);

    res.json({
      _id: partner._id,
      name: partner.name,
      email: partner.email,
      universityName: partner.universityName,
      institutionId: partner.institutionId,
      token,
      isPremium: partner.isPremium,
      planType: partner.planType,
      premiumExpiration: partner.premiumExpiration,
      adminApproved: partner.adminApproved, // KEEP for existing logic
      status: partner.status,               // ADD for new frontend
      active: partner.active
    });
  } else {
    res.status(400);
    throw new Error("Invalid email or password.");
  }
});

// Update partner profile
const updatePartnerProfile = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("User not authenticated.");
  }

  const partner = await Partnerwebapp.findById(req.user._id);
  if (!partner) {
    res.status(404);
    throw new Error("Partner not found.");
  }

  partner.name = req.body.name || partner.name;
  partner.email = req.body.email || partner.email;
  partner.universityName = req.body.universityName || partner.universityName;
  partner.institutionId = req.body.institutionId || partner.institutionId;

  if (req.body.password) {
    partner.password = req.body.password; // Will be hashed in pre-save hook
  }

  const updatedPartner = await partner.save();

  res.json({
    _id: updatedPartner._id,
    name: updatedPartner.name,
    email: updatedPartner.email,
    universityName: updatedPartner.universityName,
    institutionId: updatedPartner.institutionId,
    adminApproved: updatedPartner.adminApproved,
    isPremium: updatedPartner.isPremium,
    planType: updatedPartner.planType,
    premiumExpiration: updatedPartner.premiumExpiration,
    token: generateToken(updatedPartner._id),
  });
});

// Admin approve a partner account - UPDATE BOTH FIELDS
const approvePartner = asyncHandler(async (req, res) => {
  const { partnerId } = req.params;

  const partner = await Partnerwebapp.findById(partnerId);
  if (!partner) {
    res.status(404);
    throw new Error("Partner not found.");
  }

  // UPDATE BOTH FIELDS for consistency
  partner.adminApproved = true;
  partner.status = "Approved";
  partner.active = true;
  await partner.save();

  await notifyUser(
    partner.email, 
    "Your SkillNaav Partner Account has been approved!", 
    "Congratulations! Your SkillNaav partner account has been approved by the admin. You can now log in and access all features."
  );

  res.status(200).json({ message: "Partner approved successfully." });
});

// Admin reject a partner account - UPDATE BOTH FIELDS
const rejectPartner = asyncHandler(async (req, res) => {
  const { partnerId } = req.params;
  console.log("Rejecting Partner ID:", partnerId);

  const partner = await Partnerwebapp.findById(partnerId);
  if (!partner) {
    res.status(404);
    throw new Error("Partner not found.");
  }

  // UPDATE BOTH FIELDS for consistency
  partner.adminApproved = false;
  partner.status = "Rejected";
  partner.active = false;
  await partner.save();

  const rejectionReason = req.body.reason || "Your SkillNaav partner account has been rejected by the admin.";

  await notifyUser(
    partner.email, 
    "Your SkillNaav Partner Account has been rejected.", 
    rejectionReason
  );

  res.status(200).json({ message: "Partner rejected successfully." });
});

// Get all partners - RETURN BOTH FIELDS
const getAllPartners = asyncHandler(async (req, res) => {
  // RETURN BOTH FIELDS
  const partners = await Partnerwebapp.find({}, "name email universityName institutionId adminApproved status");

  if (!partners || partners.length === 0) {
    res.status(404);
    throw new Error("No partners found.");
  }

  res.status(200).json(partners);
});

// Send OTP for partner signup
const sendPartnerVerificationCode = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400);
    throw new Error("Invalid email address.");
  }

  const existing = await Partnerwebapp.findOne({ email });
  if (existing) {
    res.status(400);
    throw new Error("Email already registered.");
  }

  const otp = generateOTP();
  const otpExpiration = Date.now() + 10 * 60 * 1000;

  // Store OTP in separate verification model
  await PartnerEmailVerification.findOneAndUpdate(
    { email },
    { otp, otpExpiration },
    { upsert: true, new: true }
  );

  await notifyUser(
    email,
    "SkillNaav Partner Email Verification Code",
    `<p>Your OTP is <strong>${otp}</strong>. It is valid for 10 minutes.</p>`
  );

  res.status(200).json({ message: "Verification code sent to email." });
});

// Verify OTP
const verifyPartnerOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const record = await PartnerEmailVerification.findOne({ email });

  if (!record || record.otp !== otp || Date.now() > record.otpExpiration) {
    res.status(400);
    throw new Error("Invalid or expired OTP.");
  }

  // Delete the record after verification
  await PartnerEmailVerification.deleteOne({ email });

  res.status(200).json({ success: true, message: "OTP verified" });
});

// Update Partner Subscription Plan
const updatePartnerPlan = asyncHandler(async (req, res) => {
  const { planType, durationInDays } = req.body;

  const partner = await Partnerwebapp.findById(req.user._id);
  if (!partner) {
    res.status(404);
    throw new Error("Partner not found.");
  }

  const validPlans = ["Freemium", "Premium Basic", "Premium Plus"];
  if (!validPlans.includes(planType)) {
    res.status(400);
    throw new Error("Invalid plan type.");
  }

  const now = new Date();

  if (planType === "Freemium") {
    partner.planType = "Freemium";
    partner.isPremium = false;
    partner.premiumExpiration = null;
  } else {
    partner.planType = planType;
    partner.isPremium = true;
    partner.premiumExpiration = new Date(now.getTime() + durationInDays * 24 * 60 * 60 * 1000);
  }

  const updated = await partner.save();

  res.status(200).json({
    message: `Plan updated to ${planType}`,
    planType: updated.planType,
    isPremium: updated.isPremium,
    premiumExpiration: updated.premiumExpiration,
  });
});

// Exporting functions for use in routes.
module.exports = {
    registerPartner,
    authPartner,
    updatePartnerProfile,
    getAllPartners,
    approvePartner,
    rejectPartner,
    checkEmailExists,
    requestPasswordReset,
    verifyOTPAndResetPassword, // Exporting verifyOTPAndResetPassword function
    getPartnerProfile,
    sendPartnerVerificationCode,
    verifyPartnerOTP, // Exporting verifyPartnerOTP function
    updatePartnerPlan, // Exporting updatePartnerPlan function
};