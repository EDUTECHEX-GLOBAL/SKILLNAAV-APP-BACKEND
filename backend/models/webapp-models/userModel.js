const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userwebappSchema = new mongoose.Schema(
  {
    name: { type: String },

    email: { type: String, required: true, unique: true, trim: true },

    // 🔥 Password is optional for Google users
    password: { type: String, required: false },

    // OTP + Email verification for normal signup
    otp: { type: String },
    otpExpiration: { type: Date },

    // 🔥 These fields are NOT required at account creation for Google users
    universityName: { type: String },
    dob: { type: String },
    educationLevel: { type: String },
    fieldOfStudy: { type: String },
    desiredField: { type: String },
    linkedin: { type: String },
    portfolio: { type: String },
    profileImage: { type: String },

    // Arrays
    skills: [{ type: String, trim: true }],
    interests: [{ type: String, trim: true }],
    preferredLocations: [{ type: String, trim: true }],

    // 🔥 Google OAuth fields
    googleId: { type: String, default: null },
    isGoogleUser: { type: Boolean, default: false },

    // Optional fields for later updates
    financialStatus: { type: String },
    state: { type: String },
    country: { type: String },
    city: { type: String },
    postalCode: { type: String },
    address: { type: String },
    currentGrade: { type: String },
    gradePercentage: { type: String },

    // Admin workflow
    adminApproved: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },

    isActive: { type: Boolean, default: false },

    // Premium fields
    isPremium: { type: Boolean, default: false },
    planType: {
      type: String,
      enum: ["Free", "Premium Basic", "Premium Plus"],
      default: "Free",
    },
    premiumExpiration: { type: Date, default: null },

    schoolAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolAdmin",
    },

    careerChatUsage: { type: Number, default: 0 },
  },
  { timestamps: true }
);



// 🔥 PASSWORD HASHING — safe for Google users
userwebappSchema.pre("save", async function (next) {
  // Skip hashing if no password exists
  if (!this.password) return next();

  // Hash only when password is modified
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});



// 🔥 Compare hashed password (Google users skip this)
userwebappSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false; // Google users don't login via password
  return await bcrypt.compare(enteredPassword, this.password);
};



const Userwebapp = mongoose.model("Userwebapp", userwebappSchema);
module.exports = Userwebapp;
