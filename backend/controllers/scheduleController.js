const InternshipSchedule = require('../models/webapp-models/InternshipScheduleModel');
const { addScheduleToGoogleCalendar } = require('../controllers/GoogleController');
const Student = require('../models/webapp-models/userModel'); // <-- replace with your actual student model
const OfferLetter = require('../models/webapp-models/offerLetterModel');
const notifyUser = require('../utils/notifyUser');
const sendNotification = require('../utils/Notification');

// Utility function to fetch student who accepted
const getStudentByInternshipId = async (internshipId) => {
  // Adjust query based on your schema (assumption: status = 'accepted')
  return await Student.findOne({ internshipId, status: 'accepted' });
};

// Send schedule email only to accepted students of this internship
async function notifyAcceptedStudentsOfSchedule({ internshipId, scheduleDoc, isNew }) {
  // Find accepted offers for this internship
  const offers = await OfferLetter
    .find({ internshipId, status: 'Accepted' })
    .select('email studentId name')
    .lean();

  if (!offers.length) return; // nobody accepted yet → do nothing

  // Minimal “what’s next” preview
  const upcoming = (scheduleDoc?.timetable || []).find(s => {
    const d = new Date(s.date);
    const today = new Date();
    d.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0);
    return d >= today;
  });

  const subject = isNew
    ? 'Your internship schedule is published'
    : 'Your internship schedule was updated';

  // Send users to the public login page
  const appUrl = (process.env.WEBAPP_BASE_URL || 'https://www.skillnaav.com') + '/user/login';

  const previewHtml = upcoming
    ? `<p><b>Next session:</b> ${new Date(upcoming.date).toLocaleDateString('en-IN')} ${upcoming.startTime}–${upcoming.endTime} (${upcoming.type || 'online'})</p>`
    : '';

  // Send emails
  await Promise.all(
    offers.map(o =>
      notifyUser(
        o.email,
        subject,
        `
        <p>Hi ${o.name || 'there'},</p>
        <p>${isNew ? 'A new' : 'An updated'} schedule has been posted for your internship.</p>
        ${previewHtml}
        <p><a href="${appUrl}">Open your dashboard</a> to view all sessions.</p>
        <p>— Skillnaav Team</p>
        `
      ).catch(err => console.error('Schedule email failed:', o.email, err))
    )
  );

  // Optional in-app notification
  await Promise.all(
    offers.map(o =>
      sendNotification({
        studentId: o.studentId,
        title: isNew ? 'Schedule published' : 'Schedule updated',
        message: 'Tap to view your sessions.',
        link: appUrl
      }).catch(() => { })
    )
  );
}

// Create or update a schedule
const updateInternshipSchedule = async (req, res) => {
  try {
    const {
      internshipId,
      partnerId,
      startDate,
      endDate,
      workHours,
      timetable = [],
      defaultStartTime,
      defaultEndTime,
      defaultEventLink,
      defaultLocation,
      defaultType,
      selectedDays
    } = req.body;

    if (!internshipId || !partnerId || !startDate || !endDate || !workHours) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Sanitize timetable for saving
    const sanitizedTimetable = timetable.map(entry => ({
      date: new Date(entry.date),
      day: entry.day,
      startTime: entry.startTime,
      endTime: entry.endTime,
      eventLink: entry.eventLink || '',
      sectionSummary: entry.sectionSummary || '',
      instructor: entry.instructor || '',
      assignment: entry.assignment || null,
      type: entry.type || 'online',
      location: (entry.type === 'online') ? null : {
        name: entry.location?.name || '',
        address: entry.location?.address || '',
        mapLink: entry.location?.mapLink || ''
      },
      events: (entry.events || []).map(ev => ({
        description: ev.description,
        type: ev.type || 'online',
        location: (ev.type === 'online') ? null : {
          name: ev.location?.name || '',
          address: ev.location?.address || '',
          mapLink: ev.location?.mapLink || ''
        }
      }))
    }));

    const scheduleData = {
      internshipId,
      partnerId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      workHours,
      defaultStartTime,
      defaultEndTime,
      defaultEventLink,
      defaultLocation: (defaultType === 'online') ? null : {
        name: defaultLocation?.name || '',
        address: defaultLocation?.address || '',
        mapLink: defaultLocation?.mapLink || ''
      },
      defaultType,
      selectedDays,
      timetable: sanitizedTimetable
    };

    let schedule = await InternshipSchedule.findOne({ internshipId, partnerId });

    // 🚫 Block updates if schedule already closed
    if (schedule && schedule.isClosed) {
      return res.status(403).json({
        error: 'This schedule has been closed permanently and cannot be updated.'
      });
    }

    let wasCreated = false;
    if (schedule) {
      schedule.set(scheduleData);
    } else {
      schedule = new InternshipSchedule(scheduleData);
      wasCreated = true;
    }

    await schedule.save();

    // ✅ Send schedule email only to accepted students
    try {
      await notifyAcceptedStudentsOfSchedule({
        internshipId,
        scheduleDoc: schedule,   // saved schedule doc
        isNew: wasCreated
      });
    } catch (e) {
      console.error('notifyAcceptedStudentsOfSchedule failed:', e);
    }

    // Step: Send to Google Calendar
    const student = await getStudentByInternshipId(internshipId);
    if (student?.email) {
      await addScheduleToGoogleCalendar({
        studentEmail: student.email,
        timetable: sanitizedTimetable, // IMPORTANT: pass sanitized data
        internshipTitle: "Internship Schedule"
      });
    }

    return res.status(200).json({
      message: 'Schedule saved successfully',
      schedule,
    });
  } catch (err) {
    console.error('Schedule Save Error:', err);
    return res.status(500).json({
      error: err.message || 'Failed to save schedule',
    });
  }
};

// Get schedule by internshipId and partnerId
const getInternshipSchedule = async (req, res) => {
  try {
    const { internshipId, partnerId } = req.query;

    if (!internshipId || !partnerId) {
      return res.status(400).json({ error: 'Missing internshipId or partnerId' });
    }

    const schedule = await InternshipSchedule.findOne({ internshipId, partnerId });

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    return res.status(200).json(schedule);
  } catch (err) {
    console.error('Fetch Schedule Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch schedule' });
  }
};

module.exports = {
  updateInternshipSchedule,
  getInternshipSchedule,
};
