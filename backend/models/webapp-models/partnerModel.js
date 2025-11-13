const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const partnerwebappSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    universityName: { type: String, required: true },
    institutionId: { type: String, required: true },
    
    // KEEP adminApproved for backward compatibility
    adminApproved: { type: Boolean, default: false },
    
    // ADD status field for richer state management
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending"
    },
    
    planType: {
      type: String,
      enum: ["Freemium", "Premium Basic", "Premium Plus"],
      default: "Freemium",
    },
    isPremium: {
      type: Boolean,
      default: false,
    },
    premiumExpiration: {
      type: Date,
    },
    active: { type: Boolean, default: false },
    otp: String,
    otpExpiration: Date,
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
partnerwebappSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare hashed password with entered password
partnerwebappSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const Partnerwebapp = mongoose.model("Partnerwebapp", partnerwebappSchema);
module.exports = Partnerwebapp;