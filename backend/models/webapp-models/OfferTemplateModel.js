const mongoose = require("mongoose");

const offerTemplateSchema = new mongoose.Schema(
  {
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Partnerwebapp",
    },
    name: {
      type: String,
      required: true, // ✅ Template name is required
    },
    title: {
      type: String,
      default: "Standard Offer Letter",
    },
    content: {
      type: String,
      default: "",
    },
    backgroundImageUrl: {
      type: String,
    },
    textStyle: {
      fontSize: { type: Number, default: 12 },
      fontColor: { type: String, default: "#000000" },
      marginTop: { type: Number, default: 100 },
      marginLeft: { type: Number, default: 50 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OfferTemplate", offerTemplateSchema);
