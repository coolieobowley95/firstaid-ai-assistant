import backgroundImage from "./assets/background.png";
import { useState, useRef } from "react";
import { 
  FaCamera, 
  FaBook, 
  FaHospital, 
  FaSignOutAlt, 
  FaFileUpload, 
  FaFirstAid,
  FaTimes
} from "react-icons/fa";
import "./App.css";

// ======== Login Component ========
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email || !password) {
      alert("Please enter email and password");
      return;
    }
    onLogin();
  };

  return (
    <div className="login-container">
      <h2>Sign in to your account</h2>
      <form onSubmit={handleSubmit} className="login-form">
        <label>Email address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="login-input"
        />

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="login-input"
        />

        <button type="submit" className="login-btn">Sign In</button>
      </form>
    </div>
  );
}

// ======== FirstAid AI App Component ========
function FirstAidApp({ onSignOut }) {
  const [showGuide, setShowGuide] = useState(false);
  const [showDetectionOptions, setShowDetectionOptions] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [analysisResult, setAnalysisResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [openSection, setOpenSection] = useState(null);
  // New: State for tip messages and helper hints
  const [tipMessage, setTipMessage] = useState("");
  // New: State for injury hint based on filename
  const [injuryHint, setInjuryHint] = useState("");

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // ======== Full First Aid Guide (Accordion) ========
  const guideTopics = [
    { title: "Cuts and Wounds", items: ["Clean your hands thoroughly with soap and water", "Rinse the wound gently with clean water", "Apply antibiotic ointment if available", "Cover with a sterile bandage", "For severe bleeding: apply direct pressure and seek emergency care"] },
    { title: "Burns", items: ["Cool the burn under cool (not cold) running water for 10–20 minutes", "Do not apply ice directly to the skin", "Cover loosely with sterile gauze", "Seek medical care for large or blistering burns"] },
    { title: "CPR and Breathing", items: ["Check responsiveness and breathing", "Call emergency services immediately", "Begin chest compressions at a rate of 100–120 per minute", "Provide rescue breaths if trained"] },
    { title: "Choking", items: ["Encourage coughing if the person can still breathe", "Perform abdominal thrusts (Heimlich maneuver) if trained", "Call emergency services if the object cannot be removed"] },
    { title: "Fractures and Sprains", items: ["Immobilize the injured area", "Apply ice to reduce swelling", "Do not attempt to realign broken bones", "Seek medical evaluation promptly"] },
    { title: "Head Injuries", items: ["Keep the person still and calm", "Monitor for confusion, vomiting, or loss of consciousness", "Seek emergency care for severe symptoms"] },
    { title: "Poisoning", items: ["Call poison control or emergency services immediately", "Do not induce vomiting unless instructed", "Keep the substance container for identification"] },
    { title: "Heat-Related Emergencies", items: ["Move the person to a cool area", "Loosen tight clothing and provide fluids", "Seek emergency help for heat stroke"] },
    { title: "Cold-Related Emergencies", items: ["Warm the person gradually", "Remove wet clothing", "Seek medical help for frostbite or hypothermia"] },
    { title: "Allergic Reactions", items: ["Remove the allergen if possible", "Administer antihistamines or epinephrine if prescribed", "Call emergency services for breathing difficulty"] },
    { title: "Eye Injuries", items: ["Rinse the eye gently with clean water", "Do not rub or apply pressure", "Seek urgent medical care for chemical or penetrating injuries"] },
    { title: "Seizures", items: ["Protect the person from injury", "Do not restrain or place objects in the mouth", "Call emergency services if seizure lasts more than 5 minutes"] },
    { title: "Dental Emergencies", items: ["Rinse the mouth with warm water", "Preserve knocked-out teeth in milk or saline", "Seek a dentist immediately"] },
    { title: "Stings and Bites", items: ["Remove the stinger if present", "Wash with soap and water", "Apply cold compress and monitor for allergic reactions"] },
    { title: "Drowning / Near-Drowning", items: ["Remove from water if safe to do so", "Check breathing and circulation", "Begin CPR if necessary", "Call emergency services immediately"] }
  ];

  // ===== First-aid rules for fallback =====
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

  // ======== Image Upload / Camera ========
  const handleInjuryDetectionClick = () => {
    setShowDetectionOptions(true);
    setSelectedImage(null);
    setCapturedImage(null);
    setAnalysisResult("");
    setTipMessage("");
    setInjuryHint("");
  };

  const handleFileClick = () => fileInputRef.current.click();

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedImage(file);
      setCapturedImage(null);
      setAnalysisResult("");
      setInjuryHint("");
      // New: Set tip message with naming advice and injury-specific hints
      const filename = file.name.toLowerCase();
      let tip = "Tip: For better detection, name your image after the injury. Example: cuts.png, burns.jpg, fracture.png";
      const keywords = ['cut', 'bleed', 'burn', 'fracture', 'sprain'];
      const matched = keywords.filter(k => filename.includes(k));
      if (matched.length > 0) {
        const injury = matched[0]; // take first match
        const hints = {
          cut: "For cuts: Clean with water, apply antiseptic, and cover with a bandage.",
          bleed: "For bleeding: Apply firm pressure with a clean cloth, elevate if possible.",
          burn: "For burns: Cool under running water for 10-20 minutes, cover with sterile dressing.",
          fracture: "For fractures: Immobilize the area, apply ice, seek medical help.",
          sprain: "For sprains: Rest, ice, compress, elevate (RICE method)."
        };
        tip += "\n\nHelper hint: " + hints[injury];
      }
      setTipMessage(tip);
    }
  };

  const handleUseCamera = async () => {
    setShowCamera(true);
    setSelectedImage(null);
    setCapturedImage(null);
    setAnalysisResult("");
    setTipMessage(""); // Clear tip for captured images
    setInjuryHint("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      videoRef.current.play();
    } catch (err) {
      alert("Cannot access camera");
    }
  };

  // New: Cancel image function to reset selection
  const handleCancelImage = () => {
    setSelectedImage(null);
    setCapturedImage(null);
    setAnalysisResult("");
    setTipMessage("");
    setInjuryHint("");
    setShowCamera(false);
  };

  const handleCapture = () => {
    const context = canvasRef.current.getContext("2d");
    context.drawImage(videoRef.current, 0, 0, 400, 300);
    const dataUrl = canvasRef.current.toDataURL("image/png");
    setCapturedImage(dataUrl);
    setShowCamera(false);

    const stream = videoRef.current.srcObject;
    stream.getTracks().forEach((track) => track.stop());
  };

  // ======== New handleAnalyzeClick for Gemini ========
  const handleAnalyzeClick = async () => {
    const imageFile = selectedImage;
    const imageData = capturedImage;

    if (!imageFile && !imageData) {
      alert("Please select or capture an image first!");
      return;
    }

    setLoading(true);
    setAnalysisResult("AI analyzing...");

    // New: Check filename for injury keywords and set hint
    const filename = imageFile ? imageFile.name.toLowerCase() : "";
    const keywords = ['cut', 'bleed', 'burn', 'fracture', 'sprain'];
    const matchedKeyword = keywords.find(k => filename.includes(k));
    if (matchedKeyword) {
      const injuryMap = {
        cut: "cut",
        bleed: "bleeding",
        burn: "burn",
        fracture: "fracture",
        sprain: "sprain"
      };
      setInjuryHint(`Looks like a ${injuryMap[matchedKeyword]} injury`);
    } else {
      setInjuryHint("");
    }

    try {
      const formData = new FormData();
      if (imageFile) {
        formData.append('image', imageFile);
        formData.append('filename', imageFile.name);
      } else {
        // For captured image, convert dataURL to blob
        const response = await fetch(imageData);
        const blob = await response.blob();
        const file = new File([blob], 'captured.png', { type: 'image/png' });
        formData.append('image', file);
        formData.append('filename', 'captured.png');
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Analysis failed");
      }

      const result = await response.json();

      const stepsText = result.steps.map(step => `- ${step}`).join("\n");

      const resultText = `
Diagnosis: Possible ${result.injury} detected
Confidence: ${result.confidence}

Recommended First Aid:
${stepsText}

Disclaimer: ${result.disclaimer}
      `.trim();

      setAnalysisResult(resultText);

    } catch (err) {
      console.error("Error analyzing image:", err);
      // Fallback: generate simulated response
      const filename = imageFile ? imageFile.name.toLowerCase() : 'captured.png';
      const keywords = ['cut', 'bleed', 'burn', 'fracture', 'sprain'];
      const matched = keywords.find(k => filename.includes(k));
      let injury;
      if (matched) {
        const injuryMap = {
          cut: 'cut',
          bleed: 'bleeding',
          burn: 'burn',
          fracture: 'cut', // map to cut
          sprain: 'cut'    // map to cut
        };
        injury = injuryMap[matched];
      } else {
        const injuries = ['burn', 'cut', 'bleeding'];
        injury = injuries[Math.floor(Math.random() * injuries.length)];
      }
      const confidence = Math.floor(70 + Math.random() * 25) + '%';
      const steps = rules[injury];
      const disclaimer = "⚠️ Simulated response. This does not replace professional medical care.";

      const stepsText = steps.map(step => `- ${step}`).join("\n");
      const resultText = `
Diagnosis: Possible ${injury} detected
Confidence: ${confidence}

Recommended First Aid:
${stepsText}

Disclaimer: ${disclaimer}
      `.trim();
      setAnalysisResult(resultText);
    } finally {
      setLoading(false);
    }
  };

  // ======== Find Hospital ========
  const handleFindHospital = () => {
    if (!navigator.geolocation) return alert("Geolocation not supported");

    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const url = `https://www.google.com/maps/search/hospital/@${coords.latitude},${coords.longitude},15z`;
      window.open(url, "_blank");
    });
  };

  const filterGuide = (title) => title.toLowerCase().includes(searchQuery.toLowerCase());

  return (
    <>
      {/* ===== Top Header ===== */}
      <div className="top-header">
        <div className="top-left-logo">
          <FaFirstAid style={{ marginRight: "8px", color: "#e53935" }} size={24} />
          <span className="app-title">FirstAid.AI</span>
        </div>

        <div className="top-right-buttons">
          <button className="guide-top-btn" onClick={() => setShowGuide(true)}>
            <FaBook style={{ marginRight: "6px" }} /> First Aid Guide
          </button>

          <button className="hospital-btn" onClick={handleFindHospital}>
            <FaHospital style={{ marginRight: "6px" }} /> Find Hospital
          </button>

          <button className="signout-btn" onClick={onSignOut}>
            <FaSignOutAlt style={{ marginRight: "6px" }} /> Sign Out
          </button>
        </div>
      </div>

      <section className="hero">
        <div className="main-card">
          <h1>Welcome to FirstAid.AI</h1>
          <p>Your intelligent first aid assistant for emergency situations</p>

          {!showDetectionOptions && (
            <button className="primary-btn" onClick={handleInjuryDetectionClick}>
              <FaCamera style={{ marginRight: "8px" }} /> Injury Detection
            </button>
          )}

          {showDetectionOptions && (
            <div className="button-group">
              <button className="primary-btn" onClick={handleFileClick}>
                <FaFileUpload style={{ marginRight: "6px" }} /> Upload from File Explorer
              </button>

              <button className="primary-btn" onClick={handleUseCamera}>
                <FaCamera style={{ marginRight: "6px" }} /> Use Camera
              </button>
              {/* New: Small guidance text */}
              <p className="upload-guidance">Supported example names: burns.jpg, cuts.png, fracture.jpg</p>
            </div>
          )}

          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: "none" }}
          />

          {showCamera && (
            <div className="camera-preview">
              <video ref={videoRef} width="400" height="300" />
              <button onClick={handleCapture}>Capture Photo</button>
              <canvas ref={canvasRef} width="400" height="300" style={{ display: "none" }} />
            </div>
          )}

          {(selectedImage || capturedImage) && (
            <button className="analyze-btn" onClick={handleAnalyzeClick} disabled={loading}>
              {loading ? "Analyzing..." : "Analyze"}
            </button>
          )}

          {(selectedImage || capturedImage) && (
            <div className="image-preview">
              <h3>Selected Image:</h3>
              <img
                src={selectedImage ? URL.createObjectURL(selectedImage) : capturedImage}
                alt="Selected Injury"
              />
              {/* New: Cancel Image button with icon */}
              <button className="cancel-btn" onClick={handleCancelImage}>
                <FaTimes style={{ marginRight: "6px" }} /> Cancel Image
              </button>
            </div>
          )}

          {/* New: Display tip message if available */}
          {tipMessage && (
            <div className="tip-message">
              <pre>{tipMessage}</pre>
            </div>
          )}

          {/* New: Display injury hint if available */}
          {injuryHint && (
            <div className="injury-hint">
              <p>{injuryHint}</p>
            </div>
          )}

          {analysisResult && (
            <div className="analysis-result">
              <pre>{analysisResult}</pre>
            </div>
          )}
        </div>
      </section>

      {/* Guide Modal with Accordion */}
      {showGuide && (
        <div className="guide-modal">
          <div className="guide-content">
            <button className="close-btn" onClick={() => setShowGuide(false)}>×</button>
            <h1>First Aid Guide</h1>

            <input
              type="text"
              placeholder="Search first aid topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="guide-search"
            />

            {guideTopics
              .filter((topic) => filterGuide(topic.title))
              .map((topic, index) => (
                <div key={index} className="accordion-item">
                  <h2
                    className="accordion-title"
                    onClick={() => setOpenSection(openSection === index ? null : index)}
                  >
                    {topic.title}
                  </h2>

                  {openSection === index && (
                    <ul className="accordion-content">
                      {topic.items.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );
}

// ======== Main App Wrapper ========
function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  return (
    <>
      {!isLoggedIn ? (
        <Login onLogin={() => setIsLoggedIn(true)} />
      ) : (
        <FirstAidApp onSignOut={() => setIsLoggedIn(false)} />
      )}
    </>
  );
}

export default App;
