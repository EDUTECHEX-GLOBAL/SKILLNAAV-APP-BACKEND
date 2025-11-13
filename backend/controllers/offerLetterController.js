const mongoose = require('mongoose');
const generateOfferPDFBuffer = require('../utils/pdfGenerator');
const { uploadOfferLetterBuffer } = require('../utils/multer');
const OfferLetter = require('../models/webapp-models/offerLetterModel');
const notifyUser = require('../utils/notifyUser');
const sendNotification = require('../utils/Notification');
const InternshipSchedule = require('../models/webapp-models/InternshipScheduleModel');
const Partnerwebapp = require('../models/webapp-models/partnerModel'); // Import partner model if needed
const OfferTemplate = require('../models/webapp-models/OfferTemplateModel'); // Import OfferTemplate model
const Payment = require('../models/webapp-models/internshipPaymentModel'); // Import payment model

const sendOfferLetter = async (req, res) => {
  try {
    const {
      partnerId,
      student_id: studentId,
      name,
      email,
      position,
      startDate,
      internshipId,
      schoolAdminId,
      company,
      location,
      duration,
      internshipType,
      compensationDetails,
      jobDescription,
      qualifications,
      contactInfo,
      noticePeriod,
      templateId // ✅ added this
    } = req.body;

    if (!partnerId) {
      return res.status(400).json({ error: "Missing partnerId" });
    }

    const partner = await Partnerwebapp.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ error: "Partner not found" });
    }

    if (partner.planType === "Freemium") {
      return res.status(403).json({ error: "Upgrade your plan to send offer letters" });
    }

    if (partner.isPremium && partner.premiumExpiration && new Date() > partner.premiumExpiration) {
      return res.status(403).json({ error: "Your premium plan has expired. Please renew to continue." });
    }

    const requiredFields = ['student_id', 'name', 'email', 'position', 'startDate', 'internshipId'];
    const missing = requiredFields.filter(field => !req.body[field]);

    if (missing.length > 0) {
      return res.status(400).json({ error: 'Missing required fields', missing });
    }

    let studentObjId, internshipObjId, normalizedStart;
    try {
      studentObjId = new mongoose.Types.ObjectId(studentId);
      internshipObjId = new mongoose.Types.ObjectId(internshipId);
      normalizedStart = new Date(new Date(startDate).setHours(0, 0, 0, 0));
      if (isNaN(normalizedStart.getTime())) throw new Error('Invalid startDate');
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    // ✅ Fetch template if templateId is present
    let template = null;
    if (templateId) {
      template = await OfferTemplate.findById(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
    }

    // ✅ Generate PDF with template
    const pdfBuffer = await generateOfferPDFBuffer({
      name,
      email,
      position,
      startDate,
      internshipId,
      companyName: company,
      location,
      duration,
      internshipType,
      compensationDetails,
      jobDescription,
      qualifications,
      contactInfo,
      noticePeriod,
      template // ✅ passed to generator
    });

    const fileName = `offer-${studentId}-${Date.now()}.pdf`;
    const s3Url = await uploadOfferLetterBuffer(pdfBuffer, fileName);

    const offerDoc = {
      studentId: studentObjId,
      internshipId: internshipObjId,
      name,
      email,
      position,
      companyName: company,
      startDate: normalizedStart,
      sentDate: new Date(),
      status: 'Sent',
      s3Url,
      qualifications: qualifications || [],
      schoolAdminId: schoolAdminId && mongoose.Types.ObjectId.isValid(schoolAdminId)
        ? new mongoose.Types.ObjectId(schoolAdminId)
        : null
    };

    const offerLetter = await OfferLetter.create(offerDoc);

    sendNotification({
      studentId,
      title: 'Offer Letter Sent!',
      message: `Congratulations ${name}, your offer for "${position}" is live.`,
      link: s3Url
    }).catch(err => console.error('In-app notification failed:', err));

    notifyUser(
      email,
      'Your SkillNaav Offer Letter',
      `Hi ${name}, <a href="${s3Url}">download your offer letter</a>.`
    ).catch(err => console.error('Email notification failed:', err));

    return res.status(201).json({
      message: 'Offer letter sent successfully',
      offerLetter: {
        _id: offerLetter._id,
        studentId: offerLetter.studentId,
        position: offerLetter.position,
        startDate: offerLetter.startDate,
        downloadUrl: s3Url
      }
    });
  } catch (err) {
    console.error('Offer Letter Error:', err);
    return res.status(500).json({
      error: err.message || 'Failed to process offer letter'
    });
  }
};

const getOfferLetterByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: "Invalid student ID" });
    }

    const offers = await OfferLetter.find({ studentId });

    if (!offers || offers.length === 0) {
      return res.status(200).json([]); // <-- better than 404 for your use case
    }

    return res.status(200).json(offers);
  } catch (err) {
    console.error("Error fetching offer letter:", err);
    return res.status(500).json({ error: err.message });
  }
};

const updateOfferStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentId } = req.body;

    console.log('Updating offer status:', { id, status, paymentId }); // ✅ Debug log

    // ✅ Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid offer ID format' });
    }

    // ✅ Validate status
    if (!['Accepted', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be Accepted or Rejected' });
    }

    // ✅ For PAID internships, verify payment before acceptance
    if (status === 'Accepted' && paymentId) {
      console.log('Verifying payment:', paymentId); // ✅ Debug log

      // ✅ Validate payment ID format
      if (!mongoose.Types.ObjectId.isValid(paymentId)) {
        return res.status(400).json({ error: 'Invalid payment ID format' });
      }

      try {
        const payment = await Payment.findById(paymentId);
        console.log('Payment found:', payment); // ✅ Debug log

        if (!payment) {
          return res.status(404).json({ error: 'Payment record not found' });
        }

        if (payment.status !== 'COMPLETED') {
          return res.status(400).json({
            error: 'Payment verification failed',
            details: `Payment status is ${payment.status}, expected COMPLETED`
          });
        }
      } catch (paymentError) {
        console.error('Payment verification error:', paymentError);
        return res.status(500).json({
          error: 'Payment verification failed',
          details: paymentError.message
        });
      }
    }

    // ✅ Prepare update data
    const updateData = { status };
    if (paymentId) {
      updateData.paymentId = paymentId;
    }

    console.log('Updating offer with data:', updateData); // ✅ Debug log

    // ✅ Update offer letter
    const offer = await OfferLetter.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true // ✅ Run schema validation
      }
    );

    if (!offer) {
      return res.status(404).json({ error: 'Offer letter not found' });
    }

    console.log('Offer updated successfully:', offer); // ✅ Debug log

    // ✅ If a schedule already exists, email THIS student their schedule
    if (status === 'Accepted') {
      try {
        const schedule = await InternshipSchedule
          .findOne({ internshipId: offer.internshipId })
          .lean();

        if (schedule && (schedule.timetable || []).length) {
          const upcoming = schedule.timetable.find(s => {
            const d = new Date(s.date); const today = new Date();
            d.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0);
            return d >= today;
          });

          // Send users to the public login page
          const appUrl = (process.env.WEBAPP_BASE_URL || 'https://www.skillnaav.com') + '/user/login';
          const previewHtml = upcoming
            ? `<p><b>Next session:</b> ${new Date(upcoming.date).toLocaleDateString('en-IN')} ${upcoming.startTime}–${upcoming.endTime} (${upcoming.type || 'online'})</p>`
            : '';

          await notifyUser(
            offer.email,
            'Your internship schedule is available',
            `
            <p>Hi ${offer.name || 'there'},</p>
            <p>Your internship schedule is now available.</p>
            ${previewHtml}
            <p><a href="${appUrl}">Open your dashboard</a> to review all sessions.</p>
            <p>— Skillnaav Team</p>
            `
          ).catch(err => console.error('Schedule email (accept) failed:', offer.email, err));

          // Optional in-app ping
          await sendNotification({
            studentId: offer.studentId,
            title: 'Schedule available',
            message: 'Tap to view your sessions.',
            link: appUrl
          }).catch(() => { });
        }
      } catch (e) {
        console.error('Post-accept schedule notify failed:', e);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Offer ${status.toLowerCase()} successfully`,
      offer
    });

  } catch (err) {
    // ✅ Enhanced error logging
    console.error('Update offer status error:', {
      message: err.message,
      stack: err.stack,
      params: req.params,
      body: req.body
    });

    // ✅ Return detailed error for debugging
    return res.status(500).json({
      error: 'Failed to update offer status',
      details: err.message,
      // ✅ Only include stack in development
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }
};


const getOffersByInternship = async (req, res) => {
  const { internshipId } = req.params;
  const { schoolAdminId } = req.query;

  const query = { internshipId: new mongoose.Types.ObjectId(internshipId) };

  if (schoolAdminId && mongoose.Types.ObjectId.isValid(schoolAdminId)) {
    query.schoolAdminId = new mongoose.Types.ObjectId(schoolAdminId);
  }

  const offers = await OfferLetter.find(query);
  return res.status(200).json({ offers });
};

// Add this function to your offerLetterController.js

const getOfferStatusesForInternship = async (req, res) => {
  try {
    const { internshipId } = req.params;
    const { studentIds } = req.body;

    if (!mongoose.Types.ObjectId.isValid(internshipId)) {
      return res.status(400).json({ error: 'Invalid internship ID' });
    }

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'Student IDs array is required' });
    }

    // Validate all student IDs
    const validStudentIds = studentIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validStudentIds.length === 0) {
      return res.status(400).json({ error: 'No valid student IDs provided' });
    }

    // Find all offers for this internship and these students
    const offers = await OfferLetter.find({
      internshipId: new mongoose.Types.ObjectId(internshipId),
      studentId: { $in: validStudentIds }
    });

    // Create a mapping of studentId to offer status
    const statusMap = {};
    offers.forEach(offer => {
      statusMap[offer.studentId.toString()] = offer.status;
    });

    // Prepare response with status for each student
    const response = validStudentIds.map(studentId => ({
      studentId,
      status: statusMap[studentId] || 'Not Sent'
    }));

    return res.status(200).json(response);
  } catch (err) {
    console.error('Error fetching offer statuses:', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  sendOfferLetter,
  getOfferLetterByStudent,
  updateOfferStatus,
  getOffersByInternship,
  getOfferStatusesForInternship
};