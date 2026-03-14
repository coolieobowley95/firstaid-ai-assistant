// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" })); // allow large images

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ===== First-aid rules =====
const rules = {
  burn: [
    "Cool the burn under running water for 10–20 minutes",
    "Cover with a sterile, non-stick dressing",
    "Do NOT apply butter or toothpaste",
    "Seek medical help if severe or blistered",
  ],
  cut: [
    "Clean the wound with water",
    "Apply antiseptic",
    "Cover with a clean bandage",
    "Seek medical attention if deep or bleeding persists",
  ],
  bleeding: [
    "Apply firm pressure with a clean cloth",
    "Elevate the affected limb if possible",
    "Keep pressure until bleeding stops",
    "Seek emergency care if heavy bleeding",
  ],
};

// ===== Dynamic mock fallback =====
function randomMock() {
  const injuries = ["burn", "cut", "bleeding"];
  const injury = injuries[Math.floor(Math.random() * injuries.length)];
  const confidence = Math.floor(70 + Math.random() * 25) + "%";

  return {
    mock: true,
    injury,
    confidence,
    steps: rules[injury],
    disclaimer: "⚠️ Mock response used. This does not replace professional medical care.",
  };
}

// ===== Analyze endpoint =====
app.post("/api/analyze", async (req, res) => {
  const { imageBase64, filename } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: "No image provided" });
  }

  // New: Check if filename has injury keywords
  const hasKeywords = filename && ['cut', 'bleed', 'burn', 'fracture', 'sprain'].some(k => filename.toLowerCase().includes(k));

  if (!hasKeywords) {
    // For files without keywords, try Gemini, if fails use mock
    if (!GEMINI_API_KEY) {
      console.warn("No API key found — using mock response");
      return res.json(randomMock());
    }
  } else {
    // For files with keywords, require Gemini, no mock fallback
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "API key required for injury analysis" });
    }
  }

  try {
    console.log("Sending image to Gemini Vision API...");

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=" +
        GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: imageBase64,
                  },
                },
                {
                  text: `You are a medical AI assistant.
Analyze this injury image.
Classify it as burn, cut, or bleeding.
Provide a confidence percentage.
Then give step-by-step first aid instructions.`,
                },
              ],
            },
          ],
        }),
      }
    );

    console.log("Gemini HTTP status:", geminiResponse.status);

    const rawText = await geminiResponse.text();
    console.log("Gemini raw response:", rawText);

    let aiText = "";

    try {
      const data = JSON.parse(rawText);
      aiText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (err) {
      console.warn("Could not parse Gemini JSON — using mock");
      return res.json(randomMock());
    }

    console.log("Extracted AI text:", aiText);

    // ===== Flexible extraction =====
    let injury = "unknown";
    let confidence = "N/A";

    const injuryMatch = aiText.match(/\b(burn|cut|bleeding)\b/i);
    if (injuryMatch) injury = injuryMatch[1].toLowerCase();

    const confidenceMatch = aiText.match(/(\d{1,3})\s*%/);
    if (confidenceMatch) confidence = confidenceMatch[1] + "%";

    if (!rules[injury]) {
      console.warn("AI unclear");
      if (hasKeywords) {
        return res.status(500).json({ error: "Unable to analyze injury. Please try again." });
      } else {
        return res.json(randomMock());
      }
    }

    // ✅ Send real structured result
    res.json({
      mock: false,
      injury,
      confidence,
      steps: rules[injury],
      disclaimer: "This does not replace professional medical care.",
    });
  } catch (err) {
    console.error("Gemini API error:", err);
    if (hasKeywords) {
      // For files with keywords, don't use mock on failure
      return res.status(500).json({ error: "AI analysis failed. Please try again." });
    } else {
      // For files without keywords, use mock on failure
      console.log("Using mock fallback");
      res.json(randomMock());
    }
  }
});

// ===== Test endpoint =====
app.get("/api/test", (req, res) => {
  res.json({ success: true, message: "Backend running with Gemini Vision" });
});

// ===== Start server =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
