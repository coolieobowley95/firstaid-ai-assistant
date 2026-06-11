import { describe, it, expect } from "vitest";
import {
  firstValue,
  sanitizeText,
  parseJsonObject,
  normalizeResult,
  getFallbackResult,
  ALLOWED_MIME_TYPES,
  FALLBACK_RULES,
} from "./helpers.js";

// ===== firstValue =====
describe("firstValue", () => {
  it("returns first element of an array", () => {
    expect(firstValue(["a", "b"])).toBe("a");
  });

  it("returns the value itself if not an array", () => {
    expect(firstValue("hello")).toBe("hello");
    expect(firstValue(42)).toBe(42);
    expect(firstValue(null)).toBeNull();
  });

  it("returns undefined for empty array", () => {
    expect(firstValue([])).toBeUndefined();
  });
});

// ===== sanitizeText =====
describe("sanitizeText", () => {
  it("strips control characters", () => {
    expect(sanitizeText("hello\x00world", 100)).toBe("hello world");
    expect(sanitizeText("a\x01b\x1fc", 100)).toBe("a b c");
  });

  it("collapses multiple spaces", () => {
    expect(sanitizeText("  hello   world  ", 100)).toBe("hello world");
  });

  it("trims leading/trailing whitespace", () => {
    expect(sanitizeText("  test  ", 100)).toBe("test");
  });

  it("truncates to maxLength", () => {
    expect(sanitizeText("abcdefghij", 5)).toBe("abcde");
  });

  it("handles null/undefined", () => {
    expect(sanitizeText(null, 100)).toBe("");
    expect(sanitizeText(undefined, 100)).toBe("");
  });

  it("converts numbers to string", () => {
    expect(sanitizeText(123, 100)).toBe("123");
  });
});

// ===== parseJsonObject =====
describe("parseJsonObject", () => {
  it("parses a valid JSON string", () => {
    const obj = parseJsonObject('{"injury":"burn","severity":"mild"}');
    expect(obj.injury).toBe("burn");
    expect(obj.severity).toBe("mild");
  });

  it("extracts JSON from markdown code fence", () => {
    const raw = '```json\n{"injury":"cut"}\n```';
    const obj = parseJsonObject(raw);
    expect(obj.injury).toBe("cut");
  });

  it("extracts JSON embedded in surrounding text", () => {
    const raw = 'Here is the analysis: {"injury":"burn","steps":["a","b","c"]} end';
    const obj = parseJsonObject(raw);
    expect(obj.injury).toBe("burn");
  });

  it("throws when no JSON found", () => {
    expect(() => parseJsonObject("no json here")).toThrow("AI response did not contain JSON.");
  });

  it("throws for completely empty input", () => {
    expect(() => parseJsonObject("")).toThrow();
  });

  it("handles null input", () => {
    expect(() => parseJsonObject(null)).toThrow();
  });
});

// ===== normalizeResult =====
describe("normalizeResult", () => {
  const validResult = {
    injury: "burn",
    severity: "moderate",
    confidence: "85%",
    steps: ["Step 1", "Step 2", "Step 3"],
    call_911: false,
    disclaimer: "Test disclaimer.",
  };

  it("returns a well-structured result from valid input", () => {
    const normalized = normalizeResult(validResult, "gemini");
    expect(normalized.provider).toBe("gemini");
    expect(normalized.injury).toBe("burn");
    expect(normalized.severity).toBe("moderate");
    expect(normalized.confidence).toBe("85%");
    expect(normalized.steps).toHaveLength(3);
    expect(normalized.call_911).toBe(false);
    expect(normalized.disclaimer).toBe("Test disclaimer.");
  });

  it("defaults severity to 'moderate' for unknown values", () => {
    const result = normalizeResult({ ...validResult, severity: "unknown" }, "test");
    expect(result.severity).toBe("moderate");
  });

  it("defaults confidence to '70%' for invalid format", () => {
    const result = normalizeResult({ ...validResult, confidence: "high" }, "test");
    expect(result.confidence).toBe("70%");
  });

  it("defaults injury to 'unknown injury' when missing", () => {
    const result = normalizeResult({ ...validResult, injury: "" }, "test");
    expect(result.injury).toBe("unknown injury");
  });

  it("throws when fewer than 3 steps", () => {
    expect(() =>
      normalizeResult({ ...validResult, steps: ["one", "two"] }, "test")
    ).toThrow("AI response did not include enough first aid steps.");
  });

  it("throws when steps is not an array", () => {
    expect(() =>
      normalizeResult({ ...validResult, steps: "just a string" }, "test")
    ).toThrow("AI response did not include enough first aid steps.");
  });

  it("caps steps at 6", () => {
    const manySteps = Array.from({ length: 10 }, (_, i) => `Step ${i + 1}`);
    const result = normalizeResult({ ...validResult, steps: manySteps }, "test");
    expect(result.steps.length).toBeLessThanOrEqual(6);
  });

  it("sets call_911 true when severity is severe", () => {
    const result = normalizeResult(
      { ...validResult, severity: "severe", call_911: false },
      "test"
    );
    expect(result.call_911).toBe(true);
  });

  it("enriches with ICD data for known injuries", () => {
    const result = normalizeResult(validResult, "test");
    expect(result.icd_code).toBe("NE61");
    expect(result.icd_version).toMatch(/ICD-11/);
  });

  it("uses AI-provided ICD data as fallback for unknown injuries", () => {
    const result = normalizeResult(
      {
        ...validResult,
        injury: "totally unknown xyz",
        icd_code: "XX99",
        icd_version: "ICD-10",
        icd_description: "Test desc",
      },
      "test"
    );
    expect(result.icd_code).toBe("XX99");
    expect(result.icd_version).toBe("ICD-10");
    expect(result.icd_description).toBe("Test desc");
  });

  it("provides a default disclaimer when none given", () => {
    const result = normalizeResult({ ...validResult, disclaimer: "" }, "test");
    expect(result.disclaimer).toBe("This does not replace professional medical care.");
  });

  it("sanitizes step text", () => {
    const result = normalizeResult(
      { ...validResult, steps: ["Step\x00one", "Step  two", "Step\nthree"] },
      "test"
    );
    expect(result.steps[0]).toBe("Step one");
    expect(result.steps[1]).toBe("Step two");
  });
});

// ===== getFallbackResult =====
describe("getFallbackResult", () => {
  it("returns burn fallback for burn-related filenames", () => {
    const result = getFallbackResult({ filename: "burn.jpg", symptoms: "" });
    expect(result.injury).toBe("burn");
    expect(result.severity).toBe("moderate");
    expect(result.call_911).toBe(false);
    expect(result.provider).toBe("local");
  });

  it("returns bleeding fallback for bleed-related filenames", () => {
    const result = getFallbackResult({ filename: "bleeding-wound.png", symptoms: "" });
    expect(result.injury).toBe("bleeding");
    expect(result.severity).toBe("severe");
    expect(result.call_911).toBe(true);
  });

  it("returns bleeding fallback for blood-related symptoms", () => {
    const result = getFallbackResult({ filename: "photo.png", symptoms: "lots of blood" });
    expect(result.injury).toBe("bleeding");
  });

  it("defaults to cut when no keyword matches", () => {
    const result = getFallbackResult({ filename: "photo.png", symptoms: "" });
    expect(result.injury).toBe("cut");
    expect(result.severity).toBe("mild");
  });

  it("uses provided provider name", () => {
    const result = getFallbackResult({ filename: "x.png", symptoms: "" }, "custom");
    expect(result.provider).toBe("custom");
  });

  it("always includes a disclaimer", () => {
    const result = getFallbackResult({ filename: "x.png", symptoms: "" });
    expect(result.disclaimer).toMatch(/does not replace professional medical care/i);
  });

  it("always returns at least 3 steps", () => {
    const result = getFallbackResult({ filename: "x.png", symptoms: "" });
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
  });

  it("has confidence of 60%", () => {
    const result = getFallbackResult({ filename: "x.png", symptoms: "" });
    expect(result.confidence).toBe("60%");
  });
});

// ===== ALLOWED_MIME_TYPES =====
describe("ALLOWED_MIME_TYPES", () => {
  it("allows jpeg, png, webp", () => {
    expect(ALLOWED_MIME_TYPES.has("image/jpeg")).toBe(true);
    expect(ALLOWED_MIME_TYPES.has("image/png")).toBe(true);
    expect(ALLOWED_MIME_TYPES.has("image/webp")).toBe(true);
  });

  it("rejects other types", () => {
    expect(ALLOWED_MIME_TYPES.has("image/gif")).toBe(false);
    expect(ALLOWED_MIME_TYPES.has("application/json")).toBe(false);
    expect(ALLOWED_MIME_TYPES.has("text/plain")).toBe(false);
  });
});

// ===== FALLBACK_RULES =====
describe("FALLBACK_RULES", () => {
  it("has rules for burn, cut, and bleeding", () => {
    expect(FALLBACK_RULES.burn).toBeDefined();
    expect(FALLBACK_RULES.cut).toBeDefined();
    expect(FALLBACK_RULES.bleeding).toBeDefined();
  });

  it("each rule has severity and steps array", () => {
    for (const [, rule] of Object.entries(FALLBACK_RULES)) {
      expect(rule.severity).toBeDefined();
      expect(Array.isArray(rule.steps)).toBe(true);
      expect(rule.steps.length).toBeGreaterThanOrEqual(3);
    }
  });
});
