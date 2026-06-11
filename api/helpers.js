// Pure helper functions extracted from api/analyze.js for reuse and testing.

import { findICD } from "../backend/utils/icdLookup.js";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const FALLBACK_RULES = {
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

export function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function parseJsonObject(rawText) {
  const text = String(rawText || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI response did not contain JSON.");
    return JSON.parse(jsonMatch[0]);
  }
}

export function normalizeResult(result, provider) {
  const injury = sanitizeText(result?.injury, 120) || "unknown injury";
  const severity = ["mild", "moderate", "severe"].includes(result?.severity)
    ? result.severity
    : "moderate";
  const confidence = /^\d{1,3}%$/.test(String(result?.confidence || ""))
    ? result.confidence
    : "70%";
  const steps = Array.isArray(result?.steps)
    ? result.steps.map((step) => sanitizeText(step, 240)).filter(Boolean).slice(0, 6)
    : [];

  if (steps.length < 3) {
    throw new Error("AI response did not include enough first aid steps.");
  }

  let icd_code = null;
  let icd_version = null;
  let icd_description = null;

  const lookup = findICD(injury);
  if (lookup) {
    icd_code = lookup.icd_code;
    icd_version = lookup.icd_version;
    icd_description = lookup.description;
  } else if (result?.icd_code) {
    icd_code = sanitizeText(result.icd_code, 16) || null;
    icd_version = sanitizeText(result.icd_version, 16) || "ICD-11";
    icd_description = sanitizeText(result.icd_description, 240) || null;
  }

  return {
    provider,
    injury,
    severity,
    confidence,
    steps,
    call_911: Boolean(result?.call_911 || severity === "severe"),
    disclaimer:
      sanitizeText(result?.disclaimer, 180) ||
      "This does not replace professional medical care.",
    icd_code,
    icd_version,
    icd_description,
  };
}

export function getFallbackResult({ filename, symptoms }, provider = "local") {
  const hint = `${filename} ${symptoms}`.toLowerCase();
  const injury = hint.includes("burn")
    ? "burn"
    : hint.includes("bleed") || hint.includes("blood")
      ? "bleeding"
      : "cut";
  const rule = FALLBACK_RULES[injury];

  return {
    provider,
    injury,
    severity: rule.severity,
    confidence: "60%",
    steps: rule.steps,
    call_911: injury === "bleeding",
    disclaimer:
      "Fallback guidance only. This does not replace professional medical care.",
  };
}

export { ALLOWED_MIME_TYPES, FALLBACK_RULES };
