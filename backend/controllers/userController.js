const asyncHandler = require("express-async-handler");
const Userwebapp = require("../models/webapp-models/userModel");
const generateToken = require("../utils/generateToken");
const notifyUser = require("../utils/notifyUser");
const { profilePicUpload } = require('../utils/multer');
const EmailVerification = require("../models/webapp-models/EmailVerificationModel");
const LoginSession = require("../models/webapp-models/LoginSession")
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_SIGNUP_CLIENT_ID);



// helper: expire subscription if expiration date is in the past or now
async function expireIfNeeded(user) {
  if (!user) return false;

  // normalize stored value to Date (handles string or Date)
  const exp = user.premiumExpiration ? new Date(user.premiumExpiration) : null;

  // if premiumExpiration exists and is a valid Date and <= now -> expire
  if (exp && !isNaN(exp.getTime()) && exp.getTime() <= Date.now()) {
    user.isPremium = false;
    user.planType = "Free";
    user.premiumExpiration = null;
    await user.save();
    return true;
  }

  return false;
}

// Get user profile
const getUserProfile = asyncHandler(async (req, res) => {
  let user = await Userwebapp.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Expire if needed (uses normalized date check)
  await expireIfNeeded(user);

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
    zip,
    address,
  } = req.body;

  // Detect Google signup (no password provided)
  const isGoogleSignup = !password && !confirmPassword;

  // Required fields for Google signup
  const requiredGoogleFields = [
    name,
    email,
    universityName,
    dob,
    educationLevel,
    fieldOfStudy,
    desiredField,
    linkedin,
  ];

  // Required fields for normal signup
  const requiredNormalFields = [
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
  ];

  // Validate
  if (isGoogleSignup) {
    if (!areFieldsFilled(requiredGoogleFields)) {
      res.status(400);
      throw new Error("Please fill all required fields for Google sign-up.");
    }
  } else {
    if (!areFieldsFilled(requiredNormalFields)) {
      res.status(400);
      throw new Error("Please fill all required fields.");
    }

    if (password !== confirmPassword) {
      res.status(400);
      throw new Error("Passwords do not match.");
    }
  }

  // Check if the user already exists
  const userExists = await Userwebapp.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }

  // Profile picture is required ONLY for normal signup
  let profilePicUrl = null;

  if (!isGoogleSignup) {
    if (!req.file) {
      res.status(400);
      throw new Error("Profile picture is required.");
    }
    profilePicUrl = req.file.location;
  } else {
    profilePicUrl = req.body.profileImage || null;
  }

  const parsedSkills = cleanArray(skills);
  const parsedInterests = cleanArray(interests);
  const parsedLocations = cleanArray(preferredLocations);

  const user = await Userwebapp.create({
    name,
    email,
    password: isGoogleSignup ? undefined : password,
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
    isGoogleUser: isGoogleSignup,
    status: "Pending",
    adminApproved: false,
    isActive: false,
    premiumExpiration: null,
  });

  res.status(201).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    token: generateToken(user._id),
    status: user.status,
    adminApproved: user.adminApproved,
  });
});


// Helper: clean arrays (remove empty strings, trim values)
const cleanArray = (arr) =>
  Array.isArray(arr)
    ? arr.map((x) => x.trim()).filter(Boolean)
    : arr && typeof arr === "string"
      ? arr.split(",").map((x) => x.trim()).filter(Boolean)
      : [];

// Authenticate user (login) - UPDATED WITH SESSION ID
const authUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await Userwebapp.findOne({ email });

 if (user && (user.isGoogleUser || await user.matchPassword(password))) {


    // Only check for school-admin restrictions
    if (user.schoolAdmin && !user.isActive) {
      res.status(403);
      throw new Error("Your account has been restricted by your school administrator. Please contact them.");
    }

    // Expire if needed
    await expireIfNeeded(user);

    // Generate token
    const token = generateToken(user._id);

    // 🔥 CREATE SESSION RECORD
    const session = await LoginSession.create({
      studentId: user._id,
      schoolAdmin: user.schoolAdmin,
      loginAt: new Date(),
    });

    // 🔥 Return session ID to frontend
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
      sessionId: session._id,   // 👈 VERY IMPORTANT
      adminApproved: user.adminApproved,
      status: user.status,
      isFullyApproved: user.status === "Approved" && user.adminApproved,
    });

  } else {
    res.status(400);
    throw new Error("Invalid email or password.");
  }
});



// Update user profile
// Update user profile
const updateUserProfile = asyncHandler(async (req, res) => {
  console.log("BODY RECEIVED ===>", req.body);
  console.log("FILE RECEIVED ===>", req.file);

  // 🚫 Block dangerous fields
  delete req.body.password;
  delete req.body.confirmPassword;
  delete req.body.isPremium;
  delete req.body.planType;
  delete req.body.premiumExpiration;
  delete req.body.adminApproved;
  delete req.body.status;

  const user = await Userwebapp.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found.");
  }

  const fields = [
    "name",
    "email",
    "universityName",
    "educationLevel",
    "fieldOfStudy",
    "desiredField",
    "linkedin",
    "portfolio",
    "financialStatus",
    "state",
    "country",
    "city",
    "address",
    "currentGrade",
    "gradePercentage",
  ];

  fields.forEach((field) => {
    if (req.body[field] !== undefined && req.body[field] !== "") {
      user[field] = req.body[field];
    }
  });

  if (req.body.dob) {
    user.dob = new Date(req.body.dob);
  }

  if (req.body.zip || req.body.postalCode) {
    user.postalCode = req.body.zip || req.body.postalCode;
  }

  const arrayFields = ["skills", "interests", "preferredLocations"];
  arrayFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      if (Array.isArray(req.body[field])) {
        user[field] = req.body[field];
      } else if (typeof req.body[field] === "string") {
        user[field] = req.body[field]
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      }
    }
  });

  if (req.file) {
    user.profileImage = req.file.location;
  }

  // if (user.isGoogleUser) {
  //   user.adminApproved = true;
  //  user.status = "Approved";
  //  user.isActive = true;
  // }

  const updatedUser = await user.save();

  return res.json({
    _id: updatedUser._id,
    message: "Profile updated successfully",
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
// Get premium status
const getPremiumStatus = asyncHandler(async (req, res) => {

  let user = await Userwebapp.findById(req.user._id).select("-password");

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  // Automatically expire premium if needed
  await expireIfNeeded(user);

  // Fetch updated values after expiration logic
  const freshUser = await Userwebapp.findById(req.user._id).select("-password");

  return res.status(200).json({
    success: true,               // 🔥 REQUIRED FOR FRONTEND
    user: freshUser              // 🔥 Must remain as "user"
  });
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
// Verify the signup OTP
const verifySignupOTP = asyncHandler(async (req, res) => {
  const { email, otp, password } = req.body;

  const record = await EmailVerification.findOne({ email });

  if (!record || record.otp !== otp || Date.now() > record.otpExpiration) {
    res.status(400);
    throw new Error("Invalid or expired verification code.");
  }

  await EmailVerification.deleteOne({ email });

  let user = await Userwebapp.findOne({ email });

  if (!user) {
    user = await Userwebapp.create({
      email,
      password,                 // ✅ SAVE PASSWORD HERE
      status: "Pending",
      adminApproved: false,
      isActive: false,
      isGoogleUser: false,
    });
  }

  const token = generateToken(user._id);

  res.status(200).json({
    success: true,
    token,
    message: "Email verified successfully",
  });
});



const googleAuthUser = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  // Verify Google token
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_SIGNUP_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  const { sub, email, name, picture } = payload;

  // 1️⃣ Lookup by Google ID first
  let user = await Userwebapp.findOne({ googleId: sub });

  // 2️⃣ If not found, lookup by email (for users who registered manually earlier)
  if (!user) {
    user = await Userwebapp.findOne({ email });
  }

  // 3️⃣ If user exists → update googleId & login
  if (user) {
    if (!user.googleId) {
      user.googleId = sub;
      user.isGoogleUser = true;
      await user.save();
    }

    const token = generateToken(user._id);

    return res.json({
      token,
      _id: user._id,
      email: user.email,
      name: user.name,
      profileImage: user.profileImage,
      isGoogleUser: true,

      // Check if profile is complete  
      needsProfileCompletion:
        !user.universityName ||
        !user.dob ||
        !user.educationLevel ||
        !user.fieldOfStudy ||
        !user.country ||
        !user.desiredField ||
        !user.linkedin ||
        !user.profileImage,
    });
  }

  // 4️⃣ If no user exists → create a new one
  user = await Userwebapp.create({
    googleId: sub,
    email,
    name,
    profileImage: picture,
    isGoogleUser: true,
    status: "Pending",
    adminApproved: false,
    isActive: false,
  });

  const token = generateToken(user._id);

  return res.json({
    token,
    _id: user._id,
    email,
    name,
    profileImage: picture,
    isGoogleUser: true,
    needsProfileCompletion: true,
  });
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
  googleAuthUser,
};

