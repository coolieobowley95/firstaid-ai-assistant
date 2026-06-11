// Basic first-aid rules shared between the frontend fallback (App.jsx)
// and the backend mock endpoint (server.js).

export const FIRST_AID_RULES = {
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
