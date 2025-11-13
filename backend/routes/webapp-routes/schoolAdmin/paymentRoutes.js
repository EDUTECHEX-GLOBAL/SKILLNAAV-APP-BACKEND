const express = require("express");
const router = express.Router();
const { protectSchool } = require("../../../middlewares/protectSchool");
const { subscribeToPlan  } = require("../../../controllers/schoolAdmin/paymentController");

router.post("/subscribe", protectSchool, subscribeToPlan );

module.exports = router;
