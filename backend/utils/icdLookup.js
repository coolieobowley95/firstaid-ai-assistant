// backend/utils/icdLookup.js
// Local ICD-11 lookup utility for common first-aid conditions.
// Loads backend/data/icd11.json when available and exposes findICD() to map
// free-form injury names (from AI analysis) to structured ICD metadata.
//
// The database is also embedded below as a fallback so the module works in
// serverless deployments where the JSON file may not be present on disk.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Embedded fallback database (mirrors backend/data/icd11.json).
const EMBEDDED_DB = {
  version: "ICD-11 (WHO)",
  source: "https://icd.who.int/en",
  entries: [
    { name: "burn", aliases: ["burn injury", "thermal burn", "burns"], icd11_code: "NE61", description: "Burn of skin or other tissue. Includes thermal, electrical, and chemical burns when not separately specified.", severity: "moderate" },
    { name: "scald", aliases: ["scalds", "hot liquid burn", "steam burn"], icd11_code: "NE61.0", description: "Burn due to hot liquids or vapours (scald).", severity: "moderate" },
    { name: "laceration", aliases: ["lacerations", "open wound", "skin tear"], icd11_code: "NF03.0", description: "Laceration of skin: a deep cut or tear of the skin.", severity: "moderate" },
    { name: "cut", aliases: ["cuts", "incision", "open wound of skin"], icd11_code: "NF01", description: "Open wound of skin, including cuts and lacerations.", severity: "mild" },
    { name: "abrasion", aliases: ["abrasions", "scrape", "graze"], icd11_code: "NF00", description: "Superficial injury of skin: abrasion or friction burn.", severity: "mild" },
    { name: "fracture", aliases: ["fractures", "broken bone", "bone break"], icd11_code: "NA80", description: "Fracture of bone: a break in the continuity of a bone.", severity: "severe" },
    { name: "sprain", aliases: ["sprains", "ligament injury", "twisted joint"], icd11_code: "ND13", description: "Sprain or strain of joint or ligament.", severity: "moderate" },
    { name: "strain", aliases: ["strains", "muscle strain", "pulled muscle"], icd11_code: "ND14", description: "Strain or sprain of muscle or tendon.", severity: "mild" },
    { name: "choking", aliases: ["airway obstruction", "foreign body airway"], icd11_code: "MD10", description: "Foreign body in airway causing obstruction (choking).", severity: "severe" },
    { name: "poisoning", aliases: ["intoxication", "toxic ingestion", "overdose"], icd11_code: "NE60", description: "Poisoning by drugs, medications, or biological substances.", severity: "severe" },
    { name: "heat stroke", aliases: ["heatstroke", "sunstroke", "hyperthermia"], icd11_code: "NF01.2", description: "Heat stroke: a severe form of heat-related illness with body temperature above 40°C and central nervous system dysfunction.", severity: "severe" },
    { name: "heat exhaustion", aliases: ["heat-related illness", "heat stress"], icd11_code: "NF01.1", description: "Heat exhaustion: milder heat-related illness with symptoms such as heavy sweating, weakness, and cool, pale skin.", severity: "moderate" },
    { name: "hypothermia", aliases: ["low body temperature", "cold exposure"], icd11_code: "NF02", description: "Hypothermia: a dangerous drop in body temperature below 35°C due to cold exposure.", severity: "severe" },
    { name: "allergic reaction", aliases: ["allergy", "hypersensitivity", "mild allergic reaction"], icd11_code: "4A85", description: "Allergic or hypersensitivity disorder: an exaggerated immune response to a foreign substance.", severity: "moderate" },
    { name: "anaphylaxis", aliases: ["anaphylactic shock", "severe allergic reaction"], icd11_code: "4A84", description: "Anaphylaxis: a severe, potentially life-threatening allergic reaction requiring immediate emergency care.", severity: "severe" },
    { name: "eye injury", aliases: ["eye trauma", "eye wound", "foreign body in eye"], icd11_code: "NA06", description: "Injury to the eye or ocular adnexa.", severity: "moderate" },
    { name: "head injury", aliases: ["head trauma", "concussion", "traumatic brain injury"], icd11_code: "NA07", description: "Injury of head: includes concussion, skull fracture, and other intracranial injuries.", severity: "severe" },
    { name: "electrical burn", aliases: ["electric burn", "electrocution injury"], icd11_code: "NE61.2", description: "Burn due to electrical contact.", severity: "severe" },
    { name: "chemical burn", aliases: ["caustic burn", "corrosive injury"], icd11_code: "NE61.1", description: "Burn due to chemical corrosion.", severity: "severe" },
    { name: "nosebleed", aliases: ["epistaxis", "nasal bleeding"], icd11_code: "MA10.0", description: "Epistaxis: bleeding from the nose.", severity: "mild" },
    { name: "insect bite", aliases: ["insect sting", "bee sting", "mosquito bite", "bug bite"], icd11_code: "EH92", description: "Effects of venom or other toxic substances from insects or arthropods following a bite or sting.", severity: "mild" },
    { name: "animal bite", aliases: ["dog bite", "cat bite", "mammal bite"], icd11_code: "PA11", description: "Bite or strike by mammal (excluding venomous snake or insect).", severity: "moderate" },
  ],
};

let cachedDb = null;

function loadDatabase() {
  if (cachedDb) return cachedDb;

  // Try loading from disk first; fall back to embedded copy.
  const dataPath = path.resolve(__dirname, "..", "data", "icd11.json");
  try {
    const raw = fs.readFileSync(dataPath, "utf-8");
    cachedDb = JSON.parse(raw);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("ICD database file exists but could not be loaded:", err.message);
    }
    cachedDb = EMBEDDED_DB;
  }

  console.log("ICD lookup database loaded:", Array.isArray(cachedDb.entries) ? cachedDb.entries.length : 0, "entries");
  return cachedDb;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildIndex(db) {
  const index = new Map();
  for (const entry of db.entries || []) {
    const terms = [entry.name, ...(entry.aliases || [])]
      .map(normalize)
      .filter(Boolean);
    for (const term of terms) {
      if (!index.has(term)) {
        index.set(term, entry);
      }
    }
  }
  return index;
}

let cachedIndex = null;

function getIndex() {
  if (!cachedIndex) {
    cachedIndex = buildIndex(loadDatabase());
  }
  return cachedIndex;
}

/**
 * Find an ICD record matching the given injury name.
 * Performs normalized exact and substring matching against the local database.
 *
 * @param {string} injuryName - The injury/situation string from AI analysis.
 * @returns {{icd_code: string, icd_version: string, description: string, name: string, severity: string}|null}
 */
export function findICD(injuryName) {
  if (!injuryName) return null;
  const needle = normalize(injuryName);
  if (!needle) return null;

  const index = getIndex();
  const db = loadDatabase();

  // 1) Exact match against any known term.
  if (index.has(needle)) {
    const entry = index.get(needle);
    return {
      name: entry.name,
      icd_code: entry.icd11_code,
      icd_version: db.version || "ICD-11",
      description: entry.description,
      severity: entry.severity,
    };
  }

  // 2) Substring match: search the input for a known term.
  for (const [term, entry] of index.entries()) {
    if (term && (needle.includes(term) || term.includes(needle))) {
      return {
        name: entry.name,
        icd_code: entry.icd11_code,
        icd_version: db.version || "ICD-11",
        description: entry.description,
        severity: entry.severity,
      };
    }
  }

  return null;
}

/**
 * Return the loaded ICD database (or the embedded fallback if loading failed).
 * Useful for diagnostics and tests.
 */
export function getDatabase() {
  return loadDatabase();
}
