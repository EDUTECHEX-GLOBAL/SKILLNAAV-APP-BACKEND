const asyncHandler = require('express-async-handler');
const LoginSession = require('../../models/webapp-models/schoolAdmin/LoginSessionModel');
const Userwebapp = require('../../models/webapp-models/userModel');

const handleLogin = asyncHandler(async (req, res) => {
  const student = req.user;

  // ✅ Case: Normal B2C user (no school admin)
  if (!student.schoolAdmin) {
    return res.status(200).json({
      message: 'Login successful (B2C user)',
      sessionId: null,
    });
  }

  // ✅ Case: School-linked student
  const existingSession = await LoginSession.findOne({
    studentId: student._id,
    schoolAdmin: student.schoolAdmin,
    logoutAt: { $exists: false },
  });

  if (existingSession) {
    const now = new Date();
    existingSession.logoutAt = now;
    existingSession.sessionDuration = now - existingSession.loginAt;
    await existingSession.save();
  }

  const newSession = new LoginSession({
    studentId: student._id,
    schoolAdmin: student.schoolAdmin,
    loginAt: new Date(),
  });

  await newSession.save();

  res.status(200).json({
    message: 'Login session started',
    sessionId: newSession._id,
  });
});


const handleLogout = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;

  const session = await LoginSession.findById(sessionId);
  if (!session) return res.status(404).json({ message: 'Session not found' });

  const logoutAt = new Date();
  session.logoutAt = logoutAt;
  session.sessionDuration = logoutAt - session.loginAt;

  await session.save();

  res.status(200).json({ message: 'Logout recorded successfully' });
});

const getStudentSessions = asyncHandler(async (req, res) => {
  const { id: studentId } = req.params;
  const schoolAdminId = req.schoolAdmin?._id;

  const sessions = await LoginSession.find({
    studentId,
    schoolAdmin: schoolAdminId, // ensure it's this admin's student
  }).sort({ loginAt: -1 });

  res.status(200).json(sessions);
});


module.exports = {
  handleLogin,
  handleLogout,
  getStudentSessions,
};
