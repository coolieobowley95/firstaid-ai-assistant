// Shared constants for the /api/analyze endpoint (Vercel & Netlify).

export const MAX_FILE_SIZE = 5 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    injury: { type: "string" },
    severity: { type: "string", enum: ["mild", "moderate", "severe"] },
    confidence: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    call_911: { type: "boolean" },
    disclaimer: { type: "string" },
  },
  required: [
    "injury",
    "severity",
    "confidence",
    "steps",
    "call_911",
    "disclaimer",
  ],
};

export const SYSTEM_PROMPT = `You are a first aid assistant for urgent but non-diagnostic guidance.
Return only JSON matching this shape:
{
  "injury": "brief likely injury or situation",
  "severity": "mild | moderate | severe",
  "confidence": "percentage like 85%",
  "steps": ["clear first aid step", "clear first aid step", "clear first aid step"],
  "call_911": true,
  "disclaimer": "This does not replace professional medical care."
}
Prioritize safety. Recommend emergency services for heavy bleeding, breathing issues, burns to face/genitals/hands, suspected fracture, loss of consciousness, poisoning, chest pain, stroke symptoms, severe allergic reaction, or uncertainty with severe symptoms.`;

export const FALLBACK_RULES = {
  burn: {
    severity: "moderate",
    steps: [
      "Cool the burn under cool running water for 20 minutes.",
      "Remove tight jewelry or clothing near the burn if it is not stuck to skin.",
      "Cover loosely with a sterile, non-stick dressing.",
      "Seek urgent care for large, deep, chemical, electrical, or blistering burns.",
    ],
  },
  cut: {
    severity: "mild",
    steps: [
      "Wash your hands before touching the wound.",
      "Rinse the cut with clean running water.",
      "Apply gentle pressure with clean gauze if bleeding continues.",
      "Cover with a sterile bandage and seek care if deep, dirty, or gaping.",
    ],
  },
  bleeding: {
    severity: "severe",
    steps: [
      "Apply firm, direct pressure with a clean cloth or gauze.",
      "Keep pressure steady and add more cloth if blood soaks through.",
      "Have the person lie down and elevate the injured area if possible.",
      "Call emergency services if bleeding is heavy, spurting, or does not slow.",
    ],
  },
};
