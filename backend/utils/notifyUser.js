const nodemailer = require("nodemailer");

const notifyUser = async (email, subject, bodyHtml, attachments = []) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      logger: true,
      debug: true,
    });

    // Always use the SkillNaav template wrapper
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
        <header style="text-align: center; padding: 20px; background-color: #007bff; color: white; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">SkillNaav</h1>
          <p>Your Gateway to Opportunities</p>
        </header>
        <div style="padding: 20px; color: #333;">
          ${bodyHtml}
          <p>For more information, visit <a href="https://www.skillnaav.com" style="color:#007bff;">SkillNaav</a>.</p>
          <p>If you have any questions, contact <a href="mailto:support@skillnaav.com" style="color:#007bff;">support@skillnaav.com</a>.</p>
        </div>
        <footer style="text-align: center; padding: 10px; background: #f8f9fa; color: #555; border-radius: 0 0 8px 8px;">
          <p>Thank you for being a part of SkillNaav.</p>
          <p>Best Regards,<br>The SkillNaav Team</p>
        </footer>
      </div>
    `;

    const mailOptions = {
      from: `"SkillNaav Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      text: bodyHtml.replace(/<[^>]+>/g, ""), // plain-text fallback
      html: htmlContent,
      attachments,
    };

    console.log("📧 Sending email to:", email);
    const result = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully:", result.response);
    return result;
  } catch (error) {
    console.error("❌ Failed to send email:", error.message);
    return null;
  }
};
module.exports = notifyUser;
