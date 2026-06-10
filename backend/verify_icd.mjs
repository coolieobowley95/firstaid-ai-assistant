// Verification script for the ICD-11 lookup.
// Run with: node verify_icd.mjs
import { findICD, getDatabase } from "./utils/icdLookup.js";

const cases = [
  "burn",
  "Burn",
  "deep cut on hand",
  "laceration",
  "fracture of arm",
  "sprained ankle",
  "heat stroke",
  "anaphylaxis",
  "nosebleed",
  "bee sting",
  "dog bite",
  "choking",
  "head injury",
  "frostbite-like condition",
  "unknown condition xyz",
];

console.log("ICD database entries:", getDatabase().entries.length);
console.log("\n--- findICD verification ---\n");

let pass = 0;
let fail = 0;
for (const input of cases) {
  const result = findICD(input);
  if (result) {
    console.log(`OK   "${input}" -> ${result.icd_code} (${result.icd_version}) [${result.name}]`);
    pass++;
  } else {
    console.log(`NULL "${input}" -> no match`);
    if (input === "unknown condition xyz") pass++;
    else fail++;
  }
}

console.log(`\nResults: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
