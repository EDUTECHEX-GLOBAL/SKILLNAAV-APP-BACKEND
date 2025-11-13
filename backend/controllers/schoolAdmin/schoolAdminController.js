const asyncHandler = require("express-async-handler");
const SchoolAdmin = require("../../models/webapp-models/schoolAdmin/SchoolAdminModel");
const generateToken = require("../../utils/generateToken");
// const notifyUser = require("../../utils/notifyUser");
const jwt = require("jsonwebtoken"); // ✅ ADD THIS
const csv = require("csv-parser");
const bcrypt = require("bcryptjs");
const { Parser } = require("json2csv");
const Userwebapp = require("../../models/webapp-models/userModel");
const SchoolAdminOTPVerification = require("../../models/webapp-models/schoolAdmin/SchoolAdminOTPVerification");
const { uploadFile } = require("../../utils/multer");
const notifyUser = require("../../utils/notifyUser");
const { Readable } = require("stream");
const csvParser = require("csv-parser");
const crypto = require("crypto");


// Utility to generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Register School Admin
const registerSchoolAdmin = asyncHandler(async (req, res) => {
  const {
    schoolName,
    email,
    password,
    affiliation,
    address,
    city,
    province,
    postalCode,
    country,
    website,
    contactPerson,
    contactEmail,
    contactPhone,
    bio,
    schoolType,
    schoolNumber,
    languageOfInstruction,
    verificationDoc, // if handled via S3 or multer, it’ll be set separately
  } = req.body;

  const existingAdmin = await SchoolAdmin.findOne({ email });
  if (existingAdmin) {
    res.status(400);
    throw new Error("Admin already registered.");
  }

  const admin = await SchoolAdmin.create({
    schoolName,
    email,
    password,
    profile: {
      affiliation,
      address,
      city,
      province,
      postalCode,
      country,
      website,
      contactPerson,
      contactEmail,
      contactPhone,
      bio,
      schoolType,
      schoolNumber,
      languageOfInstruction,
      verificationDoc,
    },
  });

  if (admin) {
    res.status(201).json({
      _id: admin._id,
      schoolName: admin.schoolName,
      email: admin.email,
      isApproved: admin.isApproved,
    });
  } else {
    res.status(400);
    throw new Error("Failed to register.");
  }
});


// Login School Admin
// controllers/schoolAdmin/schoolAdminController.js

const loginSchoolAdmin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const school = await SchoolAdmin.findOne({ email });

  if (!school) {
    res.status(401);
    throw new Error("Invalid email or password");
  }

  const isMatch = await school.matchPassword(password);
  if (!isMatch) {
    res.status(401);
    throw new Error("Invalid email or password");
  }

  // Generate JWT token
  const token = generateToken(school._id);

  // Send full profile + token
  res.status(200).json({
    _id: school._id,
    schoolName: school.schoolName,
    affiliation: school.affiliation,
    address: school.address,
    city: school.city,
    state: school.state,
    postalCode: school.postalCode,
    country: school.country,
    website: school.website,
    contactPerson: school.contactPerson,
    contactEmail: school.contactEmail,
    contactPhone: school.contactPhone,
    bio: school.bio,
    isApproved: school.isApproved,
    creditsAvailable: school.creditsAvailable,
    token,
  });
});


const getAllSchoolAdmins = asyncHandler(async (req, res) => {
  const admins = await SchoolAdmin.find({}, "-password"); // exclude password only

  if (admins && admins.length > 0) {
    res.status(200).json(admins);
  } else {
    res.status(404);
    throw new Error("No school admins found.");
  }
});


// Approve a school admin
const approveSchoolAdmin = asyncHandler(async (req, res) => {
  const { adminId } = req.params;

  const admin = await SchoolAdmin.findById(adminId);
  if (!admin) {
    res.status(404);
    throw new Error("School Admin not found.");
  }

  admin.isApproved = true;
  await admin.save();

  // Notify the school admin
  await notifyUser(
    admin.email,
    "Your Skillnaav School Admin account has been approved!",
    `<p>Congratulations! Your Skillnaav admin account for <strong>${admin.schoolName}</strong> has been approved by our team.</p>`
  );

  res.status(200).json({ message: "School Admin approved successfully." });
});

// Reject a school admin
const rejectSchoolAdmin = asyncHandler(async (req, res) => {
  const { adminId } = req.params;

  const admin = await SchoolAdmin.findById(adminId);
  if (!admin) {
    res.status(404);
    throw new Error("School Admin not found.");
  }

  admin.isApproved = false;
  admin.status = "Rejected"; // Optional: add this to schema if needed
  await admin.save();

  // Notify the admin
  await notifyUser(
    admin.email,
    "Your Skillnaav School Admin account has been rejected.",
    `<p>We're sorry to inform you that your admin registration for <strong>${admin.schoolName}</strong> has been rejected. If you believe this is a mistake, please contact support.</p>`
  );

  res.status(200).json({ message: "School Admin rejected successfully." });
});


// controllers/schoolAdmin/schoolAdminController.js

const getSchoolAdminProfile = asyncHandler(async (req, res) => {
  const admin = req.schoolAdmin;

  if (!admin) {
    res.status(404);
    throw new Error("School admin not found");
  }

  const profile = admin.profile || {};

  res.status(200).json({
    _id: admin._id,
    schoolName: admin.schoolName,
    email: admin.email,
    isApproved: admin.isApproved,
    creditsAvailable: admin.creditsAvailable,

    // Profile details
    affiliation: profile.affiliation || "",
    address: profile.address || "",
    city: profile.city || "",
    province: profile.province || "",
    postalCode: profile.postalCode || "",
    country: profile.country || "",
    website: profile.website || "",
    contactPerson: profile.contactPerson || "",
    contactEmail: profile.contactEmail || "",
    contactPhone: profile.contactPhone || "",
    bio: profile.bio || "",
    schoolType: profile.schoolType || "",
    schoolNumber: profile.schoolNumber || "",
    languageOfInstruction: profile.languageOfInstruction || "",
    verificationDoc: profile.verificationDoc || "",
  });
});


const updateSchoolAdminProfile = asyncHandler(async (req, res) => {
  const admin = await SchoolAdmin.findById(req.schoolAdmin._id);

  if (!admin) {
    res.status(404);
    throw new Error("Admin not found");
  }

  // Update top-level fields
  if (req.body.schoolName) admin.schoolName = req.body.schoolName;

  // Ensure profile exists
  if (!admin.profile) admin.profile = {};

  // Full set of profile fields (including new ones)
  const profileFields = [
    "affiliation",
    "address",
    "city",
    "province",
    "postalCode",
    "country",
    "website",
    "contactPerson",
    "contactEmail",
    "contactPhone",
    "bio",
    "schoolType",
    "schoolNumber",
    "languageOfInstruction",
    "verificationDoc",
  ];

  profileFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      admin.profile[field] = req.body[field];
    }
  });

  const updated = await admin.save();
  res.status(200).json({
    message: "Profile updated successfully",
    admin: {
      _id: updated._id,
      schoolName: updated.schoolName,
      email: updated.email,
      isApproved: updated.isApproved,
      profile: updated.profile,
    },
  });
});



const uploadStudentsFromCSV = async (req, res) => {
  console.log("📁 [controller] req.file:", req.file);
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: "CSV file is missing" });
  }

  const stream = Readable.from(req.file.buffer);
  const rows = [];

  stream
    .pipe(csvParser({ mapHeaders: ({ header }) => header.trim() }))
    .on("data", (row) => rows.push(row))
    .on("end", async () => {
      try {
        const schoolAdmin = req.schoolAdmin;

        if (!schoolAdmin || !schoolAdmin.isApproved) {
          return res.status(403).json({ message: "School admin not approved" });
        }

        if (!schoolAdmin.plan) {
          return res.status(403).json({ message: "No active plan found. Please activate a subscription plan." });
        }

        const validRows = [];
        for (const row of rows) {
          const name = row["Full Name"]?.trim() || "";
          const email = row["Email Address"]?.trim() || "";
          const universityName = row["School Name"]?.trim() || "";
          const educationLevel = row["Grade"]?.trim() || "";
          const fieldOfStudy = row["Stream/Curriculum"]?.trim() || "";
          const desiredField = row["Field of Internship"]?.trim() || "";

          if (!name || !email || !universityName || !educationLevel || !fieldOfStudy || !desiredField) {
            console.warn("⚠️ Skipping incomplete row:", row);
            continue;
          }

          const exists = await Userwebapp.findOne({ email });
          if (!exists) {
            validRows.push({
              name,
              email,
              universityName,
              educationLevel,
              fieldOfStudy,
              desiredField,
            });
          }
        }

        console.log(`🧾 Valid students to create: ${validRows.length}`);
        if (schoolAdmin.creditsAvailable < validRows.length) {
          return res.status(400).json({
            message: `Insufficient credits. You have ${schoolAdmin.creditsAvailable}, need ${validRows.length}.`,
          });
        }

        const createdStudents = [];
        const emailPromises = [];

        for (const studentData of validRows) {
          const plainPassword = Math.random().toString(36).slice(-8);

          const student = new Userwebapp({
            name: studentData.name,
            email: studentData.email,
            password: plainPassword,
            universityName: studentData.universityName,
            educationLevel: studentData.educationLevel,
            fieldOfStudy: studentData.fieldOfStudy,
            desiredField: studentData.desiredField,
            dob: "Not Provided",
            linkedin: "https://linkedin.com/in/placeholder",
            profileImage: "default.png",
            adminApproved: true,
            isActive: true,
            isPremium: false,
            schoolAdmin: schoolAdmin._id,
          });

          await student.save();

          // Add to results
          createdStudents.push({
            name: student.name,
            email: student.email,
            password: plainPassword,
          });

          // Queue email
          emailPromises.push(
            notifyUser(
              student.email,
              "Welcome to SkillNaav – Your Login Credentials",
              `<p>Hello ${student.name},</p>
              <p>Welcome to SkillNaav! Here are your login credentials:</p>
              <ul>
                <li><strong>Email:</strong> ${student.email}</li>
                <li><strong>Password:</strong> ${plainPassword}</li>
              </ul>
              <p>You can log in at <a href="https://www.skillnaav.com/user/login">https://www.skillnaav.com/user/login</a>.</p>
              <p>We recommend changing your password after the first login.</p>`
            )
          );
        }

        await Promise.all(emailPromises);

        // Deduct credits
        schoolAdmin.creditsAvailable -= createdStudents.length;
        await schoolAdmin.save();

        // Generate credentials CSV
        let fileUrl = null;
        let csvBuffer = null;
        try {
          const parser = new Parser({ fields: ["name", "email", "password"] });
          const csvData = parser.parse(createdStudents);
          csvBuffer = Buffer.from(csvData, "utf-8");

          const fileName = `student-credentials/${Date.now()}-${Math.floor(Math.random() * 10000)}.csv`;
          const bucketName = process.env.AWS_CSV_BUCKET;
          if (!bucketName) throw new Error("AWS_CSV_BUCKET is not set in environment");

          fileUrl = await uploadFile({
            Bucket: bucketName,
            Key: fileName,
            Body: csvBuffer,
            ContentType: "text/csv",
          });

          console.log("✅ Uploaded CSV to S3:", fileUrl);
        } catch (err) {
          console.error("⚠️ S3 Upload failed:", err.message || err);
        }

        // Email admin with CSV
        try {
          await notifyUser(
            schoolAdmin.email,
            "Student Credentials CSV – SkillNaav",
            `Attached is the student credentials CSV for ${createdStudents.length} newly created students.`,
            csvBuffer
              ? [
                  {
                    filename: "student-credentials.csv",
                    content: csvBuffer,
                    contentType: "text/csv",
                  },
                ]
              : []
          );
        } catch (err) {
          console.error("❌ Failed to send email to admin:", err.message || err);
        }

        return res.status(200).json({
          message: `${createdStudents.length} students created successfully.`,
          skipped: rows.length - validRows.length,
          fileUrl,
          students: createdStudents,
        });
      } catch (err) {
        console.error("❌ Server error during CSV upload:", err);
        return res.status(500).json({ message: "Server error during processing." });
      }
    })
    .on("error", (err) => {
      console.error("❌ CSV parsing error:", err);
      return res.status(500).json({ message: "CSV parsing failed." });
    });
};




const activateFreeSubscription = asyncHandler(async (req, res) => {
  const admin = req.schoolAdmin;
  if (!admin) throw new Error("Not authorized");

  // 🛑 Prevent duplicate credit assignment
  if (admin.plan === "Free Plan") {
    return res.status(200).json({
      message: "🎉 You're already on the Free Plan",
      creditsAvailable: admin.creditsAvailable,
    });
  }

  // 🧠 Optional: Only assign credits if their current plan is inactive or undefined
  admin.plan = "Free Plan";
  admin.creditsAvailable = 50;
  admin.subscriptionStatus = "active"; // optional consistency
  await admin.save();

  res.status(200).json({
    message: "✅ Free Plan activated",
    creditsAvailable: admin.creditsAvailable,
  });
});

const getDashboardMetrics = asyncHandler(async (req, res) => {
  const admin = req.schoolAdmin;

  if (!admin) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const generated = await Userwebapp.countDocuments({ schoolAdmin: admin._id });
  const remaining = admin.creditsAvailable || 0;
  const total = generated + remaining;

  res.status(200).json({
    totalCredits: total,
    generated,
    remaining,
    plan: admin.plan,
  });
});

const getStudentsBySchoolAdmin = asyncHandler(async (req, res) => {
  const adminId = req.schoolAdmin._id;

  const students = await Userwebapp.find({ schoolAdmin: adminId }).select("-password");

  res.status(200).json(students);
});

// controllers/schoolAdmin/schoolAdminController.js

const toggleStudentAccess = asyncHandler(async (req, res) => {
  const { id } = req.params; // student ID
  const { isActive } = req.body;

  const student = await Userwebapp.findByIdAndUpdate(
    id,
    { isActive },
    { new: true }
  );

  if (!student) {
    res.status(404);
    throw new Error("Student not found.");
  }

  const statusText = isActive ? "restored" : "restricted";
  const emailSubject = `Your SkillNaav account has been ${statusText}`;
  const emailMessage = isActive
    ? `Your access to SkillNaav has been restored by your school administrator. You may now log in again.`
    : `Your access to SkillNaav has been restricted by your school administrator. You are currently blocked from logging in. Please contact your school for details.`;

  await notifyUser(student.email, emailSubject, emailMessage);

  res.status(200).json({
    message: `Student access ${statusText} and notification sent.`,
    student,
  });
});

// Forgot Password for School Admin
const forgotPasswordSchoolAdmin = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const admin = await SchoolAdmin.findOne({ email });

  if (!admin) {
    res.status(404);
    throw new Error("No admin found with that email.");
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  admin.resetPasswordToken = hashedToken;
  admin.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  await admin.save();

  const frontendURL = process.env.CLIENT_URL || "http://localhost:3000";
  const resetLink = `${frontendURL}/schooladmin/reset-password/${resetToken}`;

  const htmlMsg = `
    <p>Click the link below to reset your SkillNaav password:</p>
    <a href="${resetLink}" target="_blank">${resetLink}</a>
    <p>This link is valid for 1 hour.</p>
  `;

  await notifyUser(
    admin.email,
    "SkillNaav School Admin Password Reset",
    htmlMsg
  );

  res.status(200).json({ message: "Password reset link sent to your email." });
});


// Reset Password for School Admin
const resetPasswordSchoolAdmin = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const admin = await SchoolAdmin.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!admin) {
    res.status(400);
    throw new Error("Invalid or expired reset token.");
  }

  admin.password = password;
  admin.resetPasswordToken = undefined;
  admin.resetPasswordExpires = undefined;

  await admin.save();

  res.status(200).json({ message: "Password has been reset successfully." });
});

// ✅ Send OTP to email
const sendSchoolAdminVerificationCode = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400);
    throw new Error("Invalid email address.");
  }

  const existing = await SchoolAdmin.findOne({ email });
  if (existing) {
    res.status(400);
    throw new Error("Email already registered.");
  }

  const otp = generateOTP();
  const otpExpiration = Date.now() + 10 * 60 * 1000;

  await SchoolAdminOTPVerification.findOneAndUpdate(
    { email },
    { otp, otpExpiration },
    { upsert: true, new: true }
  );

  await notifyUser(
    email,
    "SkillNaav School Admin OTP Verification",
    `<p>Your OTP is <strong>${otp}</strong>. It is valid for 10 minutes.</p>`
  );

  res.status(200).json({ message: "Verification code sent to email." });
});

// ✅ Verify OTP
const verifySchoolAdminOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const record = await SchoolAdminOTPVerification.findOne({ email });

  if (!record || record.otp !== otp || Date.now() > record.otpExpiration) {
    res.status(400);
    throw new Error("Invalid or expired OTP.");
  }

  // Optionally clear it
  await SchoolAdminOTPVerification.deleteOne({ email });

  res.status(200).json({ success: true, message: "OTP verified" });
});


module.exports = {
  getAllSchoolAdmins,
  approveSchoolAdmin,
  rejectSchoolAdmin,
  registerSchoolAdmin,
  loginSchoolAdmin,
  getSchoolAdminProfile,
  updateSchoolAdminProfile,
  uploadStudentsFromCSV,
  activateFreeSubscription,
  getDashboardMetrics,
  getStudentsBySchoolAdmin,
  toggleStudentAccess,
  forgotPasswordSchoolAdmin,
  resetPasswordSchoolAdmin,
  sendSchoolAdminVerificationCode,
  verifySchoolAdminOTP,
};

