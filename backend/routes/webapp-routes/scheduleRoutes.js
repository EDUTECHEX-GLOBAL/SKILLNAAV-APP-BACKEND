const express = require('express');
const router = express.Router();
const {
  updateInternshipSchedule,
  getInternshipSchedule,
} = require('../../controllers/scheduleController');

// Create or update schedule
router.post('/create', updateInternshipSchedule);

// Get schedule using query params: ?internshipId=xxx&partnerId=yyy
router.get('/get-schedule', getInternshipSchedule);

// Close schedule permanently
router.put('/close', async (req, res) => {
  const { internshipId, partnerId } = req.body;

  if (!internshipId || !partnerId) {
    return res.status(400).json({ error: 'Missing internshipId or partnerId' });
  }

  try {
    const schedule = await require('../../models/webapp-models/InternshipScheduleModel')
      .findOne({ internshipId, partnerId });

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    if (schedule.isClosed) {
      return res.status(400).json({ error: 'Schedule is already closed' });
    }

    schedule.isClosed = true;
    await schedule.save();

    return res.status(200).json({ message: 'Schedule closed permanently' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to close schedule' });
  }
});

module.exports = router;
