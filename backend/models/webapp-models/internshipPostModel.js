const mongoose = require("mongoose");

const internshipPostingSchema = new mongoose.Schema(
  {
    jobTitle: { type: String, required: true },
    companyName: { type: String, required: true },
    location: { type: String, required: true },

    /**
 * Normalized location fields (US/CA only)
 * Kept alongside the legacy `location` string for backward compatibility.
 */
    country: {
      type: String,
      enum: ["United States", "Canada"],
      required: true
    },
    state: { type: String, required: true },
    city: { type: String, required: true },

    jobDescription: { type: String, required: true },

    startDate: { type: Date, required: true },
    endDateOrDuration: { type: String, required: true },
    duration: { type: String, required: true },

    sector: {
      type: String,
      enum: [
        "advanced-ai",
        "quantum-computing",
        "climate-tech",
        "biotech",
        "materials-science"
      ],
      required: true,
    },

    internshipType: {
      type: String,
      enum: ["FREE", "STIPEND", "PAID"],
      required: true,
    },

    internshipMode: {
      type: String,
      enum: ["OFFLINE", "ONLINE", "HYBRID"],
      default: "ONLINE",
      required: true,
    },

    // 🔹 New field for Internship Classification
    classification: {
      type: String,
      enum: ["Basic", "Intermediate", "Advanced"],
      required: true,
    },

    compensationDetails: {
      type: {
        type: String,
        enum: ["FREE", "STIPEND", "PAID"],
        required: true,
      },
      amount: { type: Number },
      currency: { type: String },
      frequency: { type: String, enum: ["MONTHLY", "WEEKLY", "ONE_TIME"] },
      benefits: { type: [String] },
      additionalCosts: [
        {
          description: { type: String },
          amount: { type: Number },
          currency: { type: String },
        },
      ],
    },

    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Partner", required: true },
    qualifications: { type: [String], required: true },

    contactInfo: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
    },

    imgUrl: { type: String, default: "https://default-image-url.com/image.png" },

    studentApplied: { type: Boolean, default: false },
    adminApproved: { type: Boolean, default: false },
    adminReviewed: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },

    // New field to control application open/close status
    applicationOpen: { type: Boolean, default: true },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

module.exports = mongoose.model("InternshipPosting", internshipPostingSchema);
