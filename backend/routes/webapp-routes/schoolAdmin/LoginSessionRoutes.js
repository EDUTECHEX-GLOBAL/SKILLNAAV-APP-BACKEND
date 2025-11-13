const express = require('express');
const {
  handleLogin,
  handleLogout,
  getStudentSessions
} = require('../../../controllers/schoolAdmin/LoginSessionController.js');
const { authenticate } = require('../../../middlewares/authMiddleware.js');
const { protectSchool } = require('../../../middlewares/protectSchool.js');

const router = express.Router();

router.post('/login', authenticate, handleLogin);
router.post('/logout', authenticate, handleLogout);
router.get('/students/:id/sessions', protectSchool, getStudentSessions);

module.exports = router;
