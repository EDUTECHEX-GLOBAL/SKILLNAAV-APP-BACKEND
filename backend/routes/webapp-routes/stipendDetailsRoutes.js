const express = require('express');
const router = express.Router();
const stipendDetailsController = require('../../controllers/stipendDetailsController');

router.post('/', stipendDetailsController.submitStipendDetails);
router.get('/internship/:internshipId', stipendDetailsController.getStipendDetailsByInternship);

module.exports = router;
