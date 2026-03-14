export default async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { imageBase64, filename } = await req.json();

  if (!imageBase64) {
    return Response.json({ error: "No image provided" }, { status: 400 });
  }

  // New: Check if filename has injury keywords
  const hasKeywords = filename && ['cut', 'bleed', 'burn', 'fracture', 'sprain'].some(k => filename.toLowerCase().includes(k));

  if (!hasKeywords) {
    // For files without keywords, try Gemini, if fails use mock
    if (!GEMINI_API_KEY) {
      console.warn("No API key found — using mock response");
      return Response.json(randomMock());
    }
  } else {
    // For files with keywords, require Gemini, no mock fallback
    if (!GEMINI_API_KEY) {
      return Response.json({ error: "API key required for injury analysis" }, { status: 500 });
    }
  }

  // First-aid rules
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

  function randomMock() {
    const injuries = ["burn", "cut", "bleeding"];
    const injury = injuries[Math.floor(Math.random() * injuries.length)];
    const confidence = Math.floor(70 + Math.random() * 25) + "%";
    return {
      mock: true,
      injury,
      confidence,
      steps: rules[injury],
      disclaimer:
        "Mock response used. This does not replace professional medical care.",
    };
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.warn("No API key found — using mock response");
    return Response.json(randomMock());
  }

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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

    const rawText = await geminiResponse.text();
    let aiText = "";

    try {
      const data = JSON.parse(rawText);
      aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch {
      console.warn("Could not parse Gemini JSON");
      if (hasKeywords) {
        return Response.json({ error: "AI analysis failed. Please try again." }, { status: 500 });
      } else {
        return Response.json(randomMock());
      }
    }

    let injury = "unknown";
    let confidence = "N/A";

    const injuryMatch = aiText.match(/\b(burn|cut|bleeding)\b/i);
    if (injuryMatch) injury = injuryMatch[1].toLowerCase();

    const confidenceMatch = aiText.match(/(\d{1,3})\s*%/);
    if (confidenceMatch) confidence = confidenceMatch[1] + "%";

    if (!rules[injury]) {
      console.warn("AI unclear");
      if (hasKeywords) {
        return Response.json({ error: "Unable to analyze injury. Please try again." }, { status: 500 });
      } else {
        return Response.json(randomMock());
      }
    }

    return Response.json({
      mock: false,
      injury,
      confidence,
      steps: rules[injury],
      disclaimer: "This does not replace professional medical care.",
    });
  } catch (err) {
    console.error("Gemini API error:", err);
    if (hasKeywords) {
      return Response.json({ error: "AI analysis failed. Please try again." }, { status: 500 });
    } else {
      return Response.json(randomMock());
    }
  }
};

export const config = {
  path: "/api/analyze",
};
