// Shared utility functions and AI provider logic for the /api/analyze endpoint.
// Used by both api/analyze.js (Vercel) and netlify/functions/analyze.mjs.

import Groq from "groq-sdk";
import { findICD } from "../backend/utils/icdLookup.js";
import {
  FALLBACK_RULES,
  GEMINI_MODEL,
  GROQ_MODEL,
  RESPONSE_SCHEMA,
  SYSTEM_PROMPT,
} from "./constants.js";

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
    ? result.steps
        .map((step) => sanitizeText(step, 240))
        .filter(Boolean)
        .slice(0, 6)
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

/**
 * Analyze an image with Google Gemini (vision model).
 * @param {{imageBase64: string, mimeType: string, filename: string, symptoms: string}} payload
 */
export async function analyzeWithGemini(payload) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API key is not configured.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: payload.mimeType,
                  data: payload.imageBase64,
                },
              },
              {
                text: `${SYSTEM_PROMPT}

Filename: ${payload.filename || "unknown"}
User-described symptoms: ${payload.symptoms || "none provided"}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}.`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return normalizeResult(parseJsonObject(rawText), "gemini");
}

/**
 * Analyze using Groq (text-only fallback).
 * @param {{filename: string, symptoms: string}} payload
 */
export async function analyzeWithGroq(payload) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("Groq API key is not configured.");
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analyze this first aid situation based on TEXT ONLY (no image available to this model).
Filename hint: ${payload.filename || "unknown"}
User-described symptoms: ${payload.symptoms || "none provided"}
Note: You cannot see the image. Use the filename and symptoms to give safe, conservative first aid guidance. If you are uncertain, recommend the user see a medical professional.`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 700,
  });

  return normalizeResult(
    parseJsonObject(completion.choices?.[0]?.message?.content),
    "groq",
  );
}

/**
 * Try each AI provider in order; fall back to rule-based response.
 * @param {{imageBase64: string, mimeType: string, filename: string, symptoms: string}} payload
 */
export async function runAnalysis(payload) {
  const providerErrors = [];

  const providers = [
    { name: "Gemini", fn: analyzeWithGemini },
    { name: "Groq", fn: analyzeWithGroq },
  ];

  for (const provider of providers) {
    try {
      const result = await provider.fn(payload);
      console.log(`Provider ${provider.name} succeeded.`);
      return { result, providerErrors };
    } catch (error) {
      console.error(`Provider ${provider.name} failed:`, error.message);
      providerErrors.push({ provider: provider.name, message: error.message });
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn("AI providers unavailable:", providerErrors);
  }

  return { result: getFallbackResult(payload), providerErrors };
}
