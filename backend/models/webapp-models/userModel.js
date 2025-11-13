const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userwebappSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    otp: { type: String },
    otpExpiration: { type: Date },
    universityName: { type: String, required: true },
    dob: { type: String, required: true },
    educationLevel: { type: String, required: true },
    fieldOfStudy: { type: String, required: true },
    desiredField: { type: String, required: true },
    linkedin: { type: String, required: true },
    portfolio: { type: String },
    profileImage: { type: String, required: true },

    skills: [{ type: String, trim: true }],
    interests: [{ type: String, trim: true }],
    preferredLocations: [{ type: String, trim: true }],

    financialStatus: { type: String },
    state: { type: String },
    country: { type: String },
    city: { type: String },
    postalCode: { type: String },
    address: { type: String },
    currentGrade: { type: String },
    gradePercentage: { type: String },
    adminApproved: {
      type: Boolean,
      default: false
    },

    // FIX: Replace adminApproved with status field
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending"
    },

    isActive: { type: Boolean, default: false },
    isPremium: { type: Boolean, default: false },
    planType: {
      type: String,
      enum: ["Free", "Premium Basic", "Premium Plus"],
      default: "Free"
    },
    premiumExpiration: { type: Date, default: null },
    schoolAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolAdmin",
    },
    careerChatUsage: {
      type: Number,
      default: 0
    },
  },
  { timestamps: true }
);

// Hash password before saving
userwebappSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare hashed password with entered password
userwebappSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const Userwebapp = mongoose.model("Userwebapp", userwebappSchema);
module.exports = Userwebapp;