require("dotenv").config();
const notifyUser = require("./utils/notifyUser");

(async () => {
  const result = await notifyUser(
    "anuradha@edutechex.com", 
    "Test Email from SkillNaav",
    "<p>This is a test email 🚀</p>"
  );
  console.log("Result:", result);
})();
