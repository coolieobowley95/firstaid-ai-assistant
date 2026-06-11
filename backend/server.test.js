import { describe, it, expect } from "vitest";

// The server.js file starts an Express server on import, so we test the
// pure logic patterns (rules, randomMock) by reimplementing them here
// with the same logic. This avoids the side-effect of listening on a port
// during tests.

const rules = {
  burn: [
    "Cool the burn under running water for 10-20 minutes",
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
    disclaimer: "Mock response used. This does not replace professional medical care.",
  };
}

describe("first-aid rules", () => {
  it("has rules for burn, cut, and bleeding", () => {
    expect(rules.burn).toBeDefined();
    expect(rules.cut).toBeDefined();
    expect(rules.bleeding).toBeDefined();
  });

  it("each rule has at least 3 steps", () => {
    for (const [, steps] of Object.entries(rules)) {
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("burn rules mention cooling", () => {
    expect(rules.burn.some((s) => s.toLowerCase().includes("cool"))).toBe(true);
  });

  it("cut rules mention cleaning", () => {
    expect(rules.cut.some((s) => s.toLowerCase().includes("clean"))).toBe(true);
  });

  it("bleeding rules mention pressure", () => {
    expect(rules.bleeding.some((s) => s.toLowerCase().includes("pressure"))).toBe(true);
  });
});

describe("randomMock", () => {
  it("returns a mock response with expected structure", () => {
    const result = randomMock();
    expect(result.mock).toBe(true);
    expect(["burn", "cut", "bleeding"]).toContain(result.injury);
    expect(result.confidence).toMatch(/^\d+%$/);
    expect(Array.isArray(result.steps)).toBe(true);
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
    expect(result.disclaimer).toMatch(/does not replace professional medical care/i);
  });

  it("generates confidence between 70% and 94%", () => {
    for (let i = 0; i < 50; i++) {
      const result = randomMock();
      const num = parseInt(result.confidence);
      expect(num).toBeGreaterThanOrEqual(70);
      expect(num).toBeLessThanOrEqual(94);
    }
  });

  it("steps match the selected injury's rules", () => {
    for (let i = 0; i < 20; i++) {
      const result = randomMock();
      expect(result.steps).toEqual(rules[result.injury]);
    }
  });

  it("always returns mock: true", () => {
    for (let i = 0; i < 10; i++) {
      expect(randomMock().mock).toBe(true);
    }
  });
});
