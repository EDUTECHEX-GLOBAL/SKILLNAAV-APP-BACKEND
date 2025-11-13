const express = require("express");
const InternshipPosting = require("../../models/webapp-models/internshipPostModel.js");
const notifyUser = require("../../utils/notifyUser.js");
const router = express.Router();
const mongoose = require("mongoose");
const Application = require("../../models/webapp-models/applicationModel.js"); // Adjust path if needed
const SavedJob = require("../../models/webapp-models/SavedJobModel.js"); // Adjust path if needed
const Partner = require("../../models/webapp-models/partnerModel.js"); // Adjust path if needed


// GET all internship postings (excluding deleted)
router.get("/", async (req, res) => {
  try {
    const internships = await InternshipPosting.find({ deleted: false });
    res.json(internships);
  } catch (error) {
    res.status(500).json({ message: "Server Error: Unable to fetch internships" });
  }
});

// GET all approved internships (excluding deleted ones) with sorting
router.get("/approved", async (req, res) => {
  const isPremiumUser = req.query.isPremium === "true";
  const { sector } = req.query;

  try {
    const filter = { deleted: false, adminApproved: true };
    if (sector) filter.sector = sector;

    let internships = await InternshipPosting.find(filter).lean();

    const premiumPriority = { PAID: 3, STIPEND: 2, FREE: 1 };
    const nonPremiumPriority = { FREE: 3, STIPEND: 2, PAID: 1 };

    internships.forEach(i => i.internshipType = (i.internshipType || 'FREE').toUpperCase());
    const priority = isPremiumUser ? premiumPriority : nonPremiumPriority;

    internships.sort((a, b) => (priority[b.internshipType] || 0) - (priority[a.internshipType] || 0));

    // Controlled randomness
    for (let i = internships.length - 1; i > 0; i--) {
      if (Math.random() < 0.2) {
        const j = Math.floor(Math.random() * (i + 1));
        [internships[i], internships[j]] = [internships[j], internships[i]];
      }
    }

    res.json(internships);
  } catch (error) {
    console.error("Error fetching approved internships:", error);
    res.status(500).json({ message: "Error fetching approved internships", error: error.message });
  }
});

// POST create a new internship posting
router.post("/", async (req, res) => {
  try {
    const {
      jobTitle,
      companyName,
      location,
      jobDescription,
      startDate,
      endDateOrDuration,
      duration,
      sector,
      internshipType,
      internshipMode,
      qualifications,
      contactInfo,
      imgUrl,
      partnerId,
      compensationDetails,
      classification,          // 🔹 new field
      applicationOpen = true,
      country,
      state,
      city,
    } = req.body;

    const partner = await Partner.findById(partnerId);
    if (!partner) return res.status(404).json({ message: "Partner not found" });

    // Freemium restrictions
    if (partner.planType === "Freemium") {
      if (internshipType === "PAID") {
        return res
          .status(403)
          .json({ message: "Freemium partners cannot post paid internships." });
      }
      const activeCount = await InternshipPosting.countDocuments({
        partnerId,
        deleted: false,
      });
      if (activeCount >= 2) {
        return res
          .status(403)
          .json({ message: "Freemium partners can post up to 2 internships only." });
      }
    }

    const finalMode = (internshipMode || "ONLINE").toUpperCase();
    const finalComp = { type: internshipType };
    if (["PAID", "STIPEND"].includes(internshipType)) {
      finalComp.amount = compensationDetails?.amount ?? 0;
      finalComp.currency = compensationDetails?.currency ?? "USD";
      finalComp.frequency = compensationDetails?.frequency ?? "MONTHLY";
    } else {
      finalComp.amount = 0;
      finalComp.currency = null;
      finalComp.frequency = null;
    }

    // Compose a robust location string if not provided explicitly
    const composedLocation = (location && location.trim())
      ? location
      : [city, state, country].filter(Boolean).join(", ");


    const newInternship = new InternshipPosting({
      jobTitle,
      companyName,
      location: composedLocation,
      country,
      state,
      city,
      jobDescription,
      startDate,
      endDateOrDuration,
      duration,
      sector,
      internshipType,
      internshipMode: finalMode,
      classification,            // 🔹 save new field
      compensationDetails: finalComp,
      qualifications,
      contactInfo,
      imgUrl,
      applicationOpen,
      studentApplied: false,
      adminApproved: false,
      adminReviewed: false,
      partnerId,
      deleted: false,
    });

    const created = await newInternship.save();
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating internship post:", error);
    res
      .status(400)
      .json({ message: "Error: Unable to create internship post", error: error.message });
  }
});

// GET all deleted internship postings (soft deleted)
router.get("/bin", async (req, res) => {
  try {
    const deletedInternships = await InternshipPosting.find({ deleted: true });

    if (deletedInternships.length === 0) {
      return res.status(404).json({ message: "No deleted internships found" });
    }

    res.json(deletedInternships);
  } catch (error) {
    console.error("Error fetching deleted internships:", error);
    res.status(500).json({
      message: "Server Error: Unable to fetch deleted internships",
      error: error.message,
    });
  }
});

// Soft delete an internship posting by ID (mark as deleted)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid internship ID" });
    }

    // Prefer atomic update to avoid loading the doc and triggering validation on save
    const updateResult = await InternshipPosting.updateOne(
      { _id: id },
      { $set: { deleted: true } }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ message: "Internship not found" });
    }

    // soft-delete related data (applications, saved jobs)
    await Application.updateMany({ internshipId: id }, { $set: { deleted: true } });
    await SavedJob.deleteMany({ jobId: id });

    res.json({ message: "Internship and applications soft deleted" });
  } catch (error) {
    console.error("Error during deletion:", error);
    res.status(500).json({
      message: "Server Error: Unable to delete the internship",
      error: error.message,
    });
  }
});

// Permanently delete an internship posting by ID
router.delete("/:id/permanent", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid internship ID" });
    }

    const internship = await InternshipPosting.findById(id);
    if (!internship) {
      return res.status(404).json({ message: "Internship not found" });
    }

    // Delete applications first
    await Application.deleteMany({ internshipId: id });

    // Then delete the internship
    await InternshipPosting.deleteOne({ _id: id });

    // Delete all related saved job entries
    await SavedJob.deleteMany({ jobId: id });

    res.json({ message: "Internship permanently deleted" });
  } catch (error) {
    console.error("Error during permanent deletion:", error);
    res.status(500).json({
      message: "Server Error: Unable to permanently delete the internship",
      error: error.message,
    });
  }
});


// GET a single internship posting by ID
router.get("/:id", async (req, res) => {
  try {
    const internship = await InternshipPosting.findById(req.params.id);
    if (internship) {
      res.json(internship);
    } else {
      res.status(404).json({ message: "Internship not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// GET internships by partner ID
router.get("/partner/:partnerId", async (req, res) => {
  try {
    const internships = await InternshipPosting.find({ partnerId: req.params.partnerId });

    // Always respond 200 with list, empty if none
    res.status(200).json(internships);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// PUT update an internship posting by ID
// PUT /api/interns/:id  — robust update with normalization
router.put("/:id", async (req, res) => {
  try {
    const body = req.body || {};

    // Accept either compensationDetails (preferred) or salaryDetails (legacy)
    const compensation = body.compensationDetails || body.salaryDetails || null;

    // Qualifications: allow array or comma-separated string
    let qualifications = body.qualifications;
    if (typeof qualifications === "string") {
      qualifications = qualifications
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // Country normalization: accept "US"/"CA" or full names
    const COUNTRY_MAP = { US: "United States", CA: "Canada", "United States": "United States", "Canada": "Canada" };
    let country = body.country;
    if (country) {
      const upper = String(country).trim();
      // try map keys (both code and full name)
      country = COUNTRY_MAP[upper] || COUNTRY_MAP[upper.toUpperCase()] || country;
    }

    // Normalize enum-like fields
    const internshipMode = body.internshipMode
      ? String(body.internshipMode).toUpperCase()
      : undefined;
    const internshipType = body.internshipType
      ? String(body.internshipType).toUpperCase()
      : undefined;

    // Compensation normalization (coerce amount)
    let normalizedComp = null;
    if (compensation && typeof compensation === "object") {
      const amtRaw = compensation.amount;
      const amount =
        amtRaw === "" || amtRaw === null || amtRaw === undefined
          ? null
          : Number(amtRaw);
      normalizedComp = {
        type: compensation.type || internshipType || "FREE",
        amount: Number.isFinite(amount) ? amount : null,
        currency: compensation.currency || null,
        frequency: compensation.frequency ? String(compensation.frequency).toUpperCase() : null,
        benefits: Array.isArray(compensation.benefits) ? compensation.benefits : compensation.benefits ? [String(compensation.benefits)] : undefined,
        additionalCosts: Array.isArray(compensation.additionalCosts)
          ? compensation.additionalCosts
          : undefined,
      };
    }

    // Build patch object only with provided values
    const patch = {};

    const {
      jobTitle,
      companyName,
      location,
      jobDescription,
      startDate,
      endDateOrDuration,
      duration,
      contactInfo,
      imgUrl,
      studentApplied,
      adminApproved,
      partnerId,
      state,
      city,
      sector,
      classification,
      applicationOpen,
    } = body;

    if (jobTitle) patch.jobTitle = jobTitle;
    if (companyName) patch.companyName = companyName;

    // If location explicitly provided, use it; otherwise compose from city/state/country if any provided
    if (location && String(location).trim()) {
      patch.location = String(location).trim();
    } else if (city || state || country) {
      patch.location = [city, state, country].filter(Boolean).join(", ");
    }

    if (country) patch.country = country;
    if (state) patch.state = state;
    if (city) patch.city = city;
    if (jobDescription) patch.jobDescription = jobDescription;
    if (startDate) patch.startDate = startDate; // let mongoose coerce or validate
    if (endDateOrDuration) patch.endDateOrDuration = endDateOrDuration;
    if (duration) patch.duration = duration;

    // compensation — use normalizedComp if present
    if (normalizedComp) patch.compensationDetails = normalizedComp;

    if (qualifications) patch.qualifications = qualifications;
    if (sector) patch.sector = sector;
    if (classification) patch.classification = classification;
    if (contactInfo) patch.contactInfo = contactInfo;
    if (imgUrl) patch.imgUrl = imgUrl;
    if (typeof studentApplied !== "undefined") patch.studentApplied = studentApplied;
    if (typeof adminApproved !== "undefined") patch.adminApproved = adminApproved;
    if (partnerId) patch.partnerId = partnerId;
    if (typeof applicationOpen !== "undefined") patch.applicationOpen = applicationOpen;

    // Accept and normalize internshipMode/type if provided
    if (internshipMode) patch.internshipMode = internshipMode;
    if (internshipType) patch.internshipType = internshipType;

    // If patch is empty, return early
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "No updatable fields provided" });
    }

    // Use runValidators:true to trigger schema validation on update
    const updatedInternship = await InternshipPosting.findByIdAndUpdate(
      req.params.id,
      patch,
      { new: true, runValidators: true }
    );

    if (!updatedInternship) {
      return res.status(404).json({ message: "Internship not found" });
    }

    return res.json(updatedInternship);
  } catch (error) {
    console.error("Error updating internship:", error);

    // If Mongoose validation error, include details
    if (error?.name === "ValidationError") {
      const errors = Object.keys(error.errors || {}).reduce((acc, k) => {
        acc[k] = error.errors[k].message;
        return acc;
      }, {});
      return res.status(400).json({ message: "Validation failed", errors });
    }

    return res.status(500).json({
      message: "Error: Unable to update internship post",
      error: error.message || String(error),
    });
  }
});


// DELETE an internship posting by ID
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Log the ID to verify
    console.log("ID to delete:", id);

    // Find and delete the internship in one step
    const deletedInternship = await InternshipPosting.findByIdAndDelete(id);

    if (!deletedInternship) {
      return res.status(404).json({ message: "Internship not found" });
    }

    res.json({ message: "Internship deleted successfully" });
  } catch (error) {
    console.error("Error during deletion:", error); // Log the actual error
    res.status(500).json({
      message: "Server Error: Unable to delete the internship",
      error: error.message,
    });
  }
});

/// Approve an internship posting by ID
router.patch("/:id/approve", async (req, res) => {
  try {
    const internship = await InternshipPosting.findById(req.params.id);

    if (internship) {
      internship.adminApproved = true; // Mark as approved
      await internship.save(); // Save changes

      // Prepare and send email to the partner
      const emailContent = `
        Congratulations! Your internship posting "${internship.jobTitle}" has been approved!
        Company: ${internship.companyName}
        Location: ${internship.location}
        Description: ${internship.jobDescription}
        Start Date: ${internship.startDate}
        End Date/Duration: ${internship.endDateOrDuration}
      `;
      try {
        console.log(`Sending email to: ${internship.contactInfo.email}`);
        await notifyUser(internship.contactInfo.email, "Internship Approved", emailContent);
      } catch (emailError) {
        console.error("Failed to send approval email:", emailError);
      }


      res.json({ message: "Internship approved successfully", internship });
    } else {
      res.status(404).json({ message: "Internship not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Server Error: Unable to approve internship", error: error.message });
  }
});

// Reject an internship posting by ID
router.patch("/:id/reject", async (req, res) => {
  try {
    const internship = await InternshipPosting.findById(req.params.id);

    if (internship) {
      internship.adminApproved = false; // Mark as rejected
      await internship.save(); // Save changes

      // Prepare and send rejection email to the partner
      const emailContent = `
        We regret to inform you that your internship posting "${internship.jobTitle}" has been rejected.
        Reason: ${req.body.reason || "No specific reason provided."}
        Company: ${internship.companyName}
        Location: ${internship.location}
      `;
      try {
        await notifyUser(internship.contactInfo.email, "Internship Rejected", emailContent);
      } catch (emailError) {
        console.error("Failed to send rejection email:", emailError);
      }

      res.json({ message: "Internship rejected successfully", internship });
    } else {
      res.status(404).json({ message: "Internship not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Server Error: Unable to reject internship", error: error.message });
  }
});

router.post("/:id/review", async (req, res) => {
  try {
    console.log("Reviewing internship with ID:", req.params.id); // Debug log

    // Make sure you're using the correct model name
    // Replace 'InternshipPosting' with your actual model name
    const internship = await InternshipPosting.findById(req.params.id);

    if (!internship) {
      console.log("Internship not found with ID:", req.params.id);
      return res.status(404).json({ message: "Internship not found." });
    }

    console.log("Found internship:", internship.jobTitle); // Debug log

    // Mark as reviewed
    internship.isAdminReviewed = true;

    const savedInternship = await internship.save();
    console.log("Successfully marked as reviewed"); // Debug log

    res.status(200).json({
      message: "Internship marked as reviewed.",
      isAdminReviewed: savedInternship.isAdminReviewed,
    });
  } catch (error) {
    console.error("Detailed error in review route:", error); // More detailed logging
    res.status(500).json({
      message: "Server error: Unable to update internship.",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});


module.exports = router;