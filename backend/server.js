// ------------------- Imports -------------------
const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const cors = require("cors");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./config/dbConfig");
const { notFound, errorHandler } = require("./middlewares/errorMiddleware");
const cron = require("node-cron");
const checkPremiumExpiration = require("./utils/checkpremiumExipiration");

// ------------------- Load env vars -------------------
dotenv.config();

// ------------------- Initialize app -------------------
const app = express();

// ✅ Razorpay webhook must see the raw body (before JSON parser)
app.use("/api/payments/razorpay-webhook", express.raw({ type: "application/json" }));

// ------------------- Middleware -------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- CORS ---
const FRONTEND_ORIGIN = process.env.FRONTEND_BASE_URL || "http://localhost:3000";

const corsOptions = {
  origin: FRONTEND_ORIGIN, // do NOT use "*" when credentials:true
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-Razorpay-Signature"
  ],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
// Ensure preflight is handled for all routes:
app.options("*", cors(corsOptions));

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ------------------- DB Connection -------------------
connectDB();

// ------------------- Routes -------------------
const instructureRoutes = require("./routes/webapp-routes/InstructureManagementRoutes");
app.use("/api/instructors", instructureRoutes);

const chatRoute = require("./routes/chat");
const chatbotRoute = require("./routes/chatbot");
app.use("/api", chatRoute);
app.use("/api/chatbot", chatbotRoute);

const userRoutes = require("./routes/webapp-routes/userRoutes");
const internRoutes = require("./routes/webapp-routes/internshipPostRoutes");
const skillnaavRoute = require("./routes/skillnaavRoute");
const partnerRoutes = require("./routes/webapp-routes/partnerRoutes");
const adminRoutes = require("./routes/webapp-routes/adminRoutes");
const chatRoutes = require("./routes/webapp-routes/ChatRoutes");
const applicationRoutes = require("./routes/webapp-routes/applicationRoutes");
const savedJobRoutes = require("./routes/webapp-routes/SavedJobRoutes");
const personalityRoutes = require("./routes/webapp-routes/PersonalityRoutes");
const paymentRoutes = require("./routes/webapp-routes/paymentRoutes");
const dashboardRoutes = require("./routes/webapp-routes/dashboardRoutes");
const NotificationRoutes = require("./routes/webapp-routes/NotificatioRoutes");
const googleRoutes = require("./routes/webapp-routes/googleRoutes");

const offerLetterRoutes = require("./routes/webapp-routes/offerLetterRoutes");
const offerTemplateRoutes = require("./routes/webapp-routes/offerTemplateRoutes");
const scheduleRoutes = require("./routes/webapp-routes/scheduleRoutes");
const uploadRoutes = require("./routes/uploadRoutes");

const partnerPaymentRoutes = require("./routes/webapp-routes/partnerPaymentRoutes");
const internshipPaymentRoutes = require("./routes/webapp-routes/internshipPaymentRoutes");

const schoolAdminRoutes = require("./routes/webapp-routes/schoolAdmin/schoolAdminRoutes");
const schoolAdminPaymentRoutes = require("./routes/webapp-routes/schoolAdmin/paymentRoutes");
const schoolAdminLoginSessionRoutes = require("./routes/webapp-routes/schoolAdmin/LoginSessionRoutes");
const stipendDetailsRoutes = require("./routes/webapp-routes/stipendDetailsRoutes");
const assessmentRoutes = require("./routes/webapp-routes/assessmentRoutes");

const curriculumRoutes = require("./routes/webapp-routes/schoolAdmin/curriculumRoutes");
// ------------------- Use routes -------------------
app.use("/api/upload", uploadRoutes);
app.use("/api/users", userRoutes);
app.use("/api/interns", internRoutes);
app.use("/api/skillnaav", skillnaavRoute);
app.use("/api/contact", skillnaavRoute);
app.use("/api/partners", partnerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/savedJobs", savedJobRoutes);
app.use("/api/personality", personalityRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/google", googleRoutes);

app.use("/api/offer-letters", offerLetterRoutes);
app.use("/api/notifications", NotificationRoutes);
app.use("/api/schedule", scheduleRoutes);
app.use("/api/templates", offerTemplateRoutes);

app.use("/api/partner/payments", partnerPaymentRoutes);
app.use("/api/internship/payments", internshipPaymentRoutes);

app.use("/api/school-admin", schoolAdminRoutes);
app.use("/api/school-admin/payments", schoolAdminPaymentRoutes);
app.use("/api/sessions", schoolAdminLoginSessionRoutes);
app.use("/api/internship/stipend-details", stipendDetailsRoutes);
app.use("/api/assessments", assessmentRoutes);

app.use("/api/curriculum", curriculumRoutes);

// Example: Skill gap analysis proxy
app.post("/analyze-skills", async (req, res) => {
  try {
    const resp = await axios.post(
      `${process.env.FASTAPI_BASE_URL}/analyze-skills`, // e.g., http://localhost:8003
      req.body,
      { timeout: 30000 }
    );
    res.json(resp.data);
  } catch (error) {
    console.error("Error from FastAPI:", error.response?.data || error.message);
    res.status(502).json({ error: "Upstream service error" });
  }
});

// ------------------- Production static -------------------
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "client/build")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "client/build/index.html"));
  });
}

// ------------------- Error Handling -------------------
app.use(notFound);
app.use(errorHandler);

// ------------------- Start Server with Socket.IO -------------------
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Attach socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_BASE_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on("connection", (socket) => {
  console.log("🔌 New client connected:", socket.id);

  // Partner/Admin joins a room for a specific internship
  socket.on("joinRoom", ({ internshipId }) => {
    socket.join(internshipId);
    console.log(`${socket.id} joined room ${internshipId}`);
  });

  // Handle sending a new message
  socket.on("sendMessage", async (msg) => {
    try {
      const Chat = require("./models/webapp-models/ChatModel");
      const chat = await Chat.create({
        sender: msg.senderId,
        receiver: msg.receiverId,
        internship: msg.internshipId,
        message: msg.message,
      });

      // Broadcast the new message to everyone in that room
      io.to(msg.internshipId).emit("receiveMessage", chat);
    } catch (err) {
      console.error("Chat save error:", err.message);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server + Socket.IO running on port ${PORT}`)
);