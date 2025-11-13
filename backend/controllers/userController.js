const asyncHandler = require("express-async-handler");
const Userwebapp = require("../models/webapp-models/userModel");
const generateToken = require("../utils/generateToken");
const notifyUser = require("../utils/notifyUser");
const { profilePicUpload } = require('../utils/multer');
const EmailVerification = require("../models/webapp-models/EmailVerificationModel");

// Get user profile
const getUserProfile = asyncHandler(async (req, res) => {
  let user = await Userwebapp.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Expiration check and update user premium fields
  if (user.isPremium && user.premiumExpiration && user.premiumExpiration < new Date()) {
    user.isPremium = false;
    user.planType = "Free";
    user.premiumExpiration = null;
    await user.save();
  }

  const userProfile = {
    _id: user._id,
    name: user.name,
    email: user.email,
    universityName: user.universityName,
    dob: user.dob,
    educationLevel: user.educationLevel,
    fieldOfStudy: user.fieldOfStudy,
    desiredField: user.desiredField,
    linkedin: user.linkedin,
    portfolio: user.portfolio,
    skills: user.skills,
    interests: user.interests,
    preferredLocations: user.preferredLocations,
    adminApproved: user.adminApproved,
    status: user.status,
    financialStatus: user.financialStatus,
    state: user.state,
    country: user.country,
    city: user.city,
    postalCode: user.postalCode,
    address: user.address,
    currentGrade: user.currentGrade,
    gradePercentage: user.gradePercentage,
    profileImage: user.profileImage,
    isPremium: user.isPremium,
    planType: user.planType,
    premiumExpiration: user.premiumExpiration,
  };

  res.json(userProfile);
});

// Helper function to check required fields
const areFieldsFilled = (fields) => fields.every((field) => field);

// Check if user exists by email
const checkIfUserExists = asyncHandler(async (req, res) => {
  const { email } = req.query;
  if (!email) {
    res.status(400);
    throw new Error("Email query parameter is required.");
  }

  const userExists = await Userwebapp.findOne({ email });
  res.json({ exists: !!userExists });
});

// Generate a random OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Request Password Reset with OTP
const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await Userwebapp.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("No account found with that email.");
  }

  const otp = generateOTP();
  user.otp = otp;
  user.otpExpiration = Date.now() + 300000; // OTP valid for 5 minutes
  await user.save();

  await notifyUser(user.email, "Your OTP for Password Reset", `<p>Your OTP is: ${otp}</p><p>It is valid for 5 minutes.</p>`);

  res.status(200).json({ message: "OTP sent to your email." });
});

// Verify OTP and Reset Password
const verifyOTPAndResetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  const user = await Userwebapp.findOne({
    email,
    otp,
    otpExpiration: { $gt: Date.now() }
  });

  if (!user) {
    res.status(400);
    throw new Error("Invalid or expired OTP.");
  }

  user.password = newPassword;
  user.otp = undefined;
  user.otpExpiration = undefined;

  await user.save();

  res.status(200).json({ message: "Password has been successfully updated." });
});

// Register a new user
const registerUser = asyncHandler(async (req, res) => {
  console.log("Request Body:", req.body);

  const {
    name,
    email,
    password,
    confirmPassword,
    universityName,
    dob,
    educationLevel,
    fieldOfStudy,
    desiredField,
    linkedin,
    portfolio,
    skills,
    interests,
    preferredLocations,
    state,
    country,
    city,
    postalCode,
    zip,        // will map to postalCode if provided
    address,
  } = req.body;

  // Check for required fields
  if (
    !areFieldsFilled([
      name,
      email,
      password,
      confirmPassword,
      universityName,
      dob,
      educationLevel,
      fieldOfStudy,
      desiredField,
      linkedin,
    ])
  ) {
    res.status(400);
    throw new Error("Please fill all required fields.");
  }

  // Check if passwords match
  if (password !== confirmPassword) {
    res.status(400);
    throw new Error("Passwords do not match.");
  }

  // Check if the user already exists
  const userExists = await Userwebapp.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }

  // Check if a profile picture was uploaded
  if (!req.file) {
    res.status(400);
    throw new Error("Profile picture is required.");
  }

  // Get the S3 URL of the uploaded profile picture
  const profilePicUrl = req.file.location;

  // Clean arrays properly
  const parsedSkills = cleanArray(skills);
  const parsedInterests = cleanArray(interests);
  const parsedLocations = cleanArray(preferredLocations);

  // Create new user
  const user = await Userwebapp.create({
    name,
    email,
    password,
    universityName,
    dob: new Date(dob),
    educationLevel,
    fieldOfStudy,
    desiredField,
    linkedin,
    portfolio,
    skills: parsedSkills,
    interests: parsedInterests,
    preferredLocations: parsedLocations,
    state,
    country,
    city,
    postalCode: postalCode || zip || "",
    address,
    profileImage: profilePicUrl,
    status: "Pending",
    adminApproved: false,
    premiumExpiration: null,
  });

  if (user) {
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      universityName: user.universityName,
      dob: user.dob,
      educationLevel: user.educationLevel,
      fieldOfStudy: user.fieldOfStudy,
      desiredField: user.desiredField,
      linkedin: user.linkedin,
      portfolio: user.portfolio,
      skills: user.skills,
      interests: user.interests,
      preferredLocations: user.preferredLocations,
      state: user.state,
      country: user.country,
      city: user.city,
      postalCode: user.postalCode,
      address: user.address,
      profileImage: user.profileImage,
      token: generateToken(user._id),
      adminApproved: user.adminApproved,
      status: user.status,
    });
  } else {
    res.status(400);
    throw new Error("Error occurred while registering user.");
  }
});

// Helper: clean arrays (remove empty strings, trim values)
const cleanArray = (arr) =>
  Array.isArray(arr)
    ? arr.map((x) => x.trim()).filter(Boolean)
    : arr && typeof arr === "string"
      ? arr.split(",").map((x) => x.trim()).filter(Boolean)
      : [];

// Authenticate user (login) - UPDATED VERSION
const authUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await Userwebapp.findOne({ email });

  if (user && await user.matchPassword(password)) {
    // ✅ REMOVED: Rejection check - allow rejected users to login
    // ✅ REMOVED: Pending approval check - allow pending users to login

    // Only check for school-admin restrictions
    if (user.schoolAdmin && !user.isActive) {
      res.status(403);
      throw new Error("Your account has been restricted by your school administrator. Please contact them.");
    }

    // 🔎 Expiration check
    if (user.isPremium && user.premiumExpiration && user.premiumExpiration < new Date()) {
      user.isPremium = false;
      user.planType = "Free";
      user.premiumExpiration = null;
      await user.save();
    }

    const token = generateToken(user._id);

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      universityName: user.universityName,
      dob: user.dob,
      educationLevel: user.educationLevel,
      fieldOfStudy: user.fieldOfStudy,
      desiredField: user.desiredField,
      linkedin: user.linkedin,
      portfolio: user.portfolio,
      profileImage: user.profileImage,
      isPremium: user.isPremium,
      planType: user.planType,
      premiumExpiration: user.premiumExpiration,
      token,
      adminApproved: user.adminApproved,
      status: user.status,
      // Add this field to easily check approval status in frontend
      isFullyApproved: user.status === "Approved" && user.adminApproved,
    });
  } else {
    res.status(400);
    throw new Error("Invalid email or password.");
  }
});

// Update user profile
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await Userwebapp.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found.");
  }

  // Update scalar fields
  user.name = req.body.name || user.name;
  user.email = req.body.email || user.email;
  user.universityName = req.body.universityName || user.universityName;
  user.dob = req.body.dob ? new Date(req.body.dob) : user.dob;
  user.educationLevel = req.body.educationLevel || user.educationLevel;
  user.fieldOfStudy = req.body.fieldOfStudy || user.fieldOfStudy;
  user.desiredField = req.body.desiredField || user.desiredField;
  user.linkedin = req.body.linkedin || user.linkedin;
  user.portfolio = req.body.portfolio || user.portfolio;
  user.financialStatus = req.body.financialStatus || user.financialStatus;
  user.state = req.body.state || user.state;
  user.country = req.body.country || user.country;
  user.city = req.body.city || user.city;
  user.postalCode = req.body.postalCode || req.body.zip || user.postalCode;
  user.address = req.body.address || user.address;
  user.currentGrade = req.body.currentGrade || user.currentGrade;
  user.gradePercentage = req.body.gradePercentage || user.gradePercentage;
  user.isPremium = req.body.isPremium || user.isPremium;

  // Clean arrays properly
  if (req.body.skills !== undefined) {
    user.skills = cleanArray(req.body.skills);
  }
  if (req.body.interests !== undefined) {
    user.interests = cleanArray(req.body.interests);
  }
  if (req.body.preferredLocations !== undefined) {
    user.preferredLocations = cleanArray(req.body.preferredLocations);
  }

  // Profile image
  user.profileImage = req.body.profileImage || user.profileImage;

  if (req.body.password) {
    user.password = req.body.password;
  }

  const updatedUser = await user.save();

  res.json({
    _id: updatedUser._id,
    name: updatedUser.name,
    email: updatedUser.email,
    universityName: updatedUser.universityName,
    dob: updatedUser.dob,
    educationLevel: updatedUser.educationLevel,
    fieldOfStudy: updatedUser.fieldOfStudy,
    desiredField: updatedUser.desiredField,
    linkedin: updatedUser.linkedin,
    portfolio: updatedUser.portfolio,
    skills: updatedUser.skills,
    interests: updatedUser.interests,
    preferredLocations: updatedUser.preferredLocations,
    financialStatus: updatedUser.financialStatus,
    state: updatedUser.state,
    country: updatedUser.country,
    city: updatedUser.city,
    postalCode: updatedUser.postalCode,
    address: updatedUser.address,
    currentGrade: updatedUser.currentGrade,
    gradePercentage: updatedUser.gradePercentage,
    planType: updatedUser.planType,
    profileImage: updatedUser.profileImage,
    token: generateToken(updatedUser._id),
  });
});

// Get all users with additional fields
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await Userwebapp.find({}, "name email universityName dob educationLevel fieldOfStudy desiredField linkedin status adminApproved");

  if (!users || users.length === 0) {
    res.status(404);
    throw new Error("No users found.");
  }

  res.status(200).json(users);
});

// Admin approve a user
const approveUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  console.log("Approving User ID:", userId);

  const user = await Userwebapp.findById(userId);

  if (!user) {
    res.status(404);
    throw new Error("User not found.");
  }

  // Update status to Approved
  user.status = "Approved";
  user.adminApproved = true;
  user.isActive = true;

  await user.save();

  await notifyUser(
    user.email,
    "Your SkillNaav account has been approved!",
    "Congratulations! Your SkillNaav account has been approved by the admin. You can now log in and access all features."
  );

  res.status(200).json({ message: "User approved successfully." });
});

// Admin rejects a user
const rejectUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  console.log("Rejecting User ID:", userId);

  const user = await Userwebapp.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found.");
  }

  // Update status to Rejected
  user.status = "Rejected";
  user.adminApproved = false;
  user.isActive = false;

  await user.save();

  await notifyUser(
    user.email,
    "Your SkillNaav account has been rejected.",
    "Your SkillNaav account has been rejected by the admin. Please contact support for more information."
  );

  res.status(200).json({ message: "User rejected successfully." });
});

// Get premium status
const getPremiumStatus = asyncHandler(async (req, res) => {
  try {
    let user = await Userwebapp.findById(req.user._id);

    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    // Expiration check and update user premium fields
    if (user.isPremium && user.premiumExpiration && user.premiumExpiration < new Date()) {
      user.isPremium = false;
      user.planType = "Free";
      user.premiumExpiration = null;
      await user.save();
    }

    const statusData = {
      isPremium: user.isPremium,
      planType: user.planType,
      premiumExpiration: user.premiumExpiration,
    };

    res.status(200).json(statusData);

  } catch (error) {
    console.error('Error fetching premium status:', error);
    res.status(500).json({ message: 'Error fetching premium status' });
  }
});

// Send verification code for signup
const sendSignupVerificationCode = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400);
    throw new Error("Invalid email format.");
  }

  const userExists = await Userwebapp.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("Email already registered.");
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiration = Date.now() + 10 * 60 * 1000;

  await EmailVerification.findOneAndUpdate(
    { email },
    { otp, otpExpiration },
    { upsert: true, new: true }
  );

  await notifyUser(
    email,
    "SkillNaav Email Verification Code",
    `<p>Your verification code is: <b>${otp}</b>. It is valid for 10 minutes.</p>`
  );

  res.status(200).json({ message: "Verification code sent to email." });
});

// Verify the signup OTP
const verifySignupOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const record = await EmailVerification.findOne({ email });

  if (!record || record.otp !== otp || Date.now() > record.otpExpiration) {
    res.status(400);
    throw new Error("Invalid or expired verification code.");
  }

  await EmailVerification.deleteOne({ email });

  res.status(200).json({ success: true, message: "Email verified successfully." });
});

module.exports = {
  registerUser,
  authUser,
  updateUserProfile,
  getAllUsers,
  approveUser,
  rejectUser,
  checkIfUserExists,
  requestPasswordReset,
  verifyOTPAndResetPassword,
  getUserProfile,
  getPremiumStatus,
  sendSignupVerificationCode,
  verifySignupOTP,
};

