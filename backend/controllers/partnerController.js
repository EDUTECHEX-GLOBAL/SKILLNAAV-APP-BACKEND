const asyncHandler = require("express-async-handler");
const Partnerwebapp = require("../models/webapp-models/partnerModel");
const generateToken = require("../utils/generateToken");
const notifyUser = require("../utils/notifyUser");
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const PartnerEmailVerification = require("../models/webapp-models/partnerVerificationModel");

// Helper function to check required fields (not used in provided logic but kept for completeness)
const areFieldsFilled = (fields) => fields.every((field) => field);

// Generate a random OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString(); // Generates a 6-digit OTP
};

// ------------------------------------
// 🎯 PUBLIC/AUTHENTICATION ENDPOINTS
// ------------------------------------

// Check if email exists
const checkEmailExists = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        res.status(400);
        throw new Error("Email is required.");
    }

    const partnerExists = await Partnerwebapp.findOne({ email });

    res.json({ exists: !!partnerExists });
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
    const otpExpiration = Date.now() + 10 * 60 * 1000; // OTP valid for 10 minutes

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

// Register a new partner (Handles Multer file upload)
const registerPartner = asyncHandler(async (req, res) => {

    // Text fields from req.body
    const { name, email, password, confirmPassword, universityName, institutionId } = req.body;

    // File object from req.file (Requires Multer middleware on the route)
    const profileImageFile = req.file;

    // 1. Check for required text fields
    if (!name || !email || !password || !confirmPassword || !universityName || !institutionId) {
        res.status(400);
        throw new Error("Please fill all required text fields.");
    }

    // 2. Check for required file upload
    if (!profileImageFile) {
        res.status(400);
        throw new Error("Profile picture file is required.");
    }

    // 3. Check if passwords match
    if (password !== confirmPassword) {
        res.status(400);
        throw new Error("Passwords do not match.");
    }

    // 4. Check if email is already registered 
    const existingPartner = await Partnerwebapp.findOne({ email });
    if (existingPartner) {
        res.status(400);
        throw new Error("Email already registered.");
    }


    // 5. Create new partner
    const partner = await Partnerwebapp.create({
        name,
        email,
        password,
        universityName,
        institutionId,
        profileImage: profileImageFile.location || profileImageFile.path, // Use .location for MulterS3, or .path for disk storage
        adminApproved: false,
        status: "Pending",
    });

    if (partner) {
        res.status(201).json({
            _id: partner._id,
            name: partner.name,
            email: partner.email,
            universityName: partner.universityName,
            institutionId: partner.institutionId,
            profileImage: partner.profileImage,
            token: generateToken(partner._id),
            adminApproved: partner.adminApproved,
            status: partner.status,
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

        const token = generateToken(partner._id);

        res.json({
            _id: partner._id,
            name: partner.name,
            email: partner.email,
            universityName: partner.universityName,
            institutionId: partner.institutionId,
            token,
            profileImage: partner.profileImage,
            isPremium: partner.isPremium,
            planType: partner.planType,
            premiumExpiration: partner.premiumExpiration,
            adminApproved: partner.adminApproved,
            status: partner.status,
            active: partner.active
        });
    } else {
        res.status(400);
        throw new Error("Invalid email or password.");
    }
});

// Request Password Reset with OTP
const requestPasswordReset = asyncHandler(async (req, res) => {
    const { email } = req.body;

    const partner = await Partnerwebapp.findOne({ email });
    if (!partner) {
        res.status(404);
        throw new Error("No account found with that email.");
    }

    const otp = generateOTP();
    partner.otp = otp;
    partner.otpExpiration = Date.now() + 300000; // OTP valid for 5 minutes
    await partner.save();

    await notifyUser(partner.email, "Your OTP for Password Reset", `<p>Your OTP is: ${otp}</p><p>It is valid for 5 minutes.</p>`);

    res.status(200).json({ message: "OTP sent to your email." });
});

// Verify OTP and Reset Password
const verifyOTPAndResetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;

    const partner = await Partnerwebapp.findOne({
        email,
        otp,
        otpExpiration: { $gt: Date.now() } // Check if the OTP is still valid
    });

    if (!partner) {
        res.status(400);
        throw new Error("Invalid or expired OTP.");
    }

    partner.password = newPassword;

    partner.otp = undefined;
    partner.otpExpiration = undefined;

    await partner.save();

    res.status(200).json({ message: "Password has been successfully updated." });
});

// ------------------------------------
// 👤 PROTECTED & ADMIN ENDPOINTS
// ------------------------------------

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
        profileImage: partner.profileImage, // Include image
        adminApproved: partner.adminApproved,
        isPremium: partner.isPremium,
        planType: partner.planType,
        premiumExpiration: partner.premiumExpiration,
        active: partner.active,
    };

    res.json(profileData);
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

    // Update text fields
    partner.name = req.body.name || partner.name;
    partner.email = req.body.email || partner.email;
    partner.universityName = req.body.universityName || partner.universityName;
    partner.institutionId = req.body.institutionId || partner.institutionId;

    // Optional password update
    if (req.body.password) {
        partner.password = req.body.password;
    }

    // Handle uploaded image
    const profileImageFile = req.file;
    if (profileImageFile) {
        const rawPath = profileImageFile.location || profileImageFile.path;
        const finalImageUrl = rawPath.startsWith("http")
            ? rawPath
            : `${req.protocol}://${req.get("host")}/${rawPath.replace(/\\/g, "/")}`;

        partner.profileImage = finalImageUrl;
    }

    // Save updated partner info
    const updatedPartner = await partner.save();

    res.json({
        _id: updatedPartner._id,
        name: updatedPartner.name,
        email: updatedPartner.email,
        universityName: updatedPartner.universityName,
        institutionId: updatedPartner.institutionId,
        profileImage: updatedPartner.profileImage,
        adminApproved: updatedPartner.adminApproved,
        token: generateToken(updatedPartner._id),
    });
});

// Admin approve a partner account
const approvePartner = asyncHandler(async (req, res) => {
    const { partnerId } = req.params;

    const partner = await Partnerwebapp.findById(partnerId);
    if (!partner) {
        res.status(404);
        throw new Error("Partner not found.");
    }

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

// Admin reject a partner account
const rejectPartner = asyncHandler(async (req, res) => {
    const { partnerId } = req.params;
    console.log("Rejecting Partner ID:", partnerId);

    const partner = await Partnerwebapp.findById(partnerId);
    if (!partner) {
        res.status(404);
        throw new Error("Partner not found.");
    }

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

// Get all partners
const getAllPartners = asyncHandler(async (req, res) => {
    const partners = await Partnerwebapp.find({}, "name email universityName institutionId adminApproved status profileImage"); // Include profileImage

    if (!partners || partners.length === 0) {
        res.status(404);
        throw new Error("No partners found.");
    }

    res.status(200).json(partners);
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

// Exporting all controller functions
module.exports = {
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
};