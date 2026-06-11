import { describe, it, expect, beforeEach } from "vitest";
import { findICD, getDatabase } from "./icdLookup.js";

describe("getDatabase", () => {
  it("returns a database object with entries array", () => {
    const db = getDatabase();
    expect(db).toBeDefined();
    expect(Array.isArray(db.entries)).toBe(true);
    expect(db.entries.length).toBeGreaterThan(0);
  });

  it("has a version field", () => {
    const db = getDatabase();
    expect(db.version).toBeDefined();
    expect(typeof db.version).toBe("string");
  });

  it("entries have required fields", () => {
    const db = getDatabase();
    for (const entry of db.entries) {
      expect(entry.name).toBeDefined();
      expect(entry.icd11_code).toBeDefined();
      expect(entry.description).toBeDefined();
      expect(entry.severity).toBeDefined();
      expect(Array.isArray(entry.aliases)).toBe(true);
    }
  });
});

describe("findICD", () => {
  it("returns null for null/undefined/empty input", () => {
    expect(findICD(null)).toBeNull();
    expect(findICD(undefined)).toBeNull();
    expect(findICD("")).toBeNull();
  });

  it("finds 'burn' by exact name", () => {
    const result = findICD("burn");
    expect(result).not.toBeNull();
    expect(result.name).toBe("burn");
    expect(result.icd_code).toBe("NE61");
    expect(result.icd_version).toMatch(/ICD-11/);
    expect(result.description).toMatch(/burn/i);
    expect(result.severity).toBe("moderate");
  });

  it("finds 'cut' by exact name", () => {
    const result = findICD("cut");
    expect(result).not.toBeNull();
    expect(result.name).toBe("cut");
    expect(result.icd_code).toBe("NF01");
    expect(result.severity).toBe("mild");
  });

  it("finds 'fracture' by exact name", () => {
    const result = findICD("fracture");
    expect(result).not.toBeNull();
    expect(result.name).toBe("fracture");
    expect(result.icd_code).toBe("NA80");
    expect(result.severity).toBe("severe");
  });

  it("is case-insensitive", () => {
    expect(findICD("BURN")).not.toBeNull();
    expect(findICD("Burn")).not.toBeNull();
    expect(findICD("FRACTURE")).not.toBeNull();
  });

  it("finds entries by alias", () => {
    const result = findICD("thermal burn");
    expect(result).not.toBeNull();
    expect(result.name).toBe("burn");
  });

  it("finds 'broken bone' alias for fracture", () => {
    const result = findICD("broken bone");
    expect(result).not.toBeNull();
    expect(result.name).toBe("fracture");
  });

  it("finds 'concussion' alias for head injury", () => {
    const result = findICD("concussion");
    expect(result).not.toBeNull();
    expect(result.name).toBe("head injury");
  });

  it("does substring matching on the input", () => {
    const result = findICD("it looks like a burn injury");
    expect(result).not.toBeNull();
    expect(result.name).toBe("burn");
  });

  it("returns null for unknown injuries", () => {
    expect(findICD("xyzabc123unknown")).toBeNull();
  });

  it("handles special characters gracefully", () => {
    const result = findICD("  burn!!  ");
    expect(result).not.toBeNull();
    expect(result.name).toBe("burn");
  });

  it("finds entries with multi-word names", () => {
    const result = findICD("allergic reaction");
    expect(result).not.toBeNull();
    expect(result.name).toBe("allergic reaction");
  });

  it("finds 'insect bite'", () => {
    const result = findICD("insect bite");
    expect(result).not.toBeNull();
    expect(result.name).toBe("insect bite");
  });

  it("finds 'nosebleed'", () => {
    const result = findICD("nosebleed");
    expect(result).not.toBeNull();
    expect(result.icd_code).toBe("MA10.0");
  });

  it("finds 'anaphylaxis'", () => {
    const result = findICD("anaphylaxis");
    expect(result).not.toBeNull();
    expect(result.name).toBe("anaphylaxis");
    expect(result.severity).toBe("severe");
  });

  it("finds by alias 'epistaxis' for nosebleed", () => {
    const result = findICD("epistaxis");
    expect(result).not.toBeNull();
    expect(result.name).toBe("nosebleed");
  });

  it("finds 'sprain' and 'strain' as separate entries", () => {
    const sprain = findICD("sprain");
    const strain = findICD("strain");
    expect(sprain).not.toBeNull();
    expect(strain).not.toBeNull();
    expect(sprain.name).toBe("sprain");
    expect(strain.name).toBe("strain");
    expect(sprain.icd_code).not.toBe(strain.icd_code);
  });

  it("result shape is consistent", () => {
    const result = findICD("burn");
    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("icd_code");
    expect(result).toHaveProperty("icd_version");
    expect(result).toHaveProperty("description");
    expect(result).toHaveProperty("severity");
  });
});
