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

    const internship = await InternshipPosting.findById(id);

    if (!internship) {
      return res.status(404).json({ message: "Internship not found" });
    }

    internship.deleted = true;
    await internship.save();

    await Application.updateMany({ internshipId: id }, { deleted: true });
    // Remove saved job references from SavedJobs schema
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

// Restore an internship by setting 'deleted' to false
router.patch("/:id/restore", async (req, res) => {
  const { id } = req.params;

  try {
    // Find the internship by ID
    const internship = await InternshipPosting.findById(id);

    // Check if the internship exists
    if (!internship) {
      return res.status(404).json({ message: "Internship not found" });
    }

    // Set 'deleted' to false (restore the internship)
    internship.deleted = false;

    // Save the updated internship document
    await internship.save();

    // Return the restored internship
    res.status(200).json({
      message: "Internship restored successfully",
      internship,
    });
  } catch (error) {
    console.error("Error restoring internship:", error);
    res.status(500).json({
      message: "Server Error: Unable to restore internship",
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
router.put("/:id", async (req, res) => {
  const {
    jobTitle,
    companyName,
    location,
    jobDescription,
    startDate,
    endDateOrDuration,
    duration,
    salaryDetails,
    qualifications,
    contactInfo,
    imgUrl,
    studentApplied,
    adminApproved,
    partnerId,
    country,
    state,
    city,
    sector,
    classification,            // 🔹 accept new field
    applicationOpen,
  } = req.body;

  try {
    const updatedInternship = await InternshipPosting.findByIdAndUpdate(
      req.params.id,
      {
        ...(jobTitle && { jobTitle }),
        ...(companyName && { companyName }),
        ...((location || city || state || country) && {
          location: (location || [city, state, country].filter(Boolean).join(", "))
        }),
        ...(country && { country }),
        ...(state && { state }),
        ...(city && { city }),
        ...(jobDescription && { jobDescription }),
        ...(startDate && { startDate }),
        ...(endDateOrDuration && { endDateOrDuration }),
        ...(duration && { duration }),
        ...(salaryDetails && { salaryDetails }),
        ...(qualifications && { qualifications }),
        ...(sector && { sector }),
        ...(classification && { classification }), // 🔹 update if provided
        ...(contactInfo && { contactInfo }),
        ...(imgUrl && { imgUrl }),
        ...(studentApplied !== undefined && { studentApplied }),
        ...(adminApproved !== undefined && { adminApproved }),
        ...(partnerId && { partnerId }),
        ...(applicationOpen !== undefined && { applicationOpen }),
      },
      { new: true }
    );

    if (updatedInternship) {
      res.json(updatedInternship);
    } else {
      res.status(404).json({ message: "Internship not found" });
    }
  } catch (error) {
    console.error("Error updating internship:", error.message);
    res.status(500).json({
      message: "Error: Unable to update internship post",
      error: error.message,
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