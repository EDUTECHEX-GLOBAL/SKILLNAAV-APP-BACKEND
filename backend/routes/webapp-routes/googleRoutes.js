const express = require('express');
const router = express.Router();
const { googleAuth, googleCallback, updateScheduleInGoogleCalendar, getSyncStatus } = require('../../controllers/GoogleController');

router.get('/auth', googleAuth);
router.get('/callback', googleCallback);
router.post('/update-schedule', updateScheduleInGoogleCalendar);
router.get('/sync-status', getSyncStatus);

module.exports = router;