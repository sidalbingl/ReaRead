# ReaRead – Development Roadmap (10 Weeks)
**Author:** Sidal Deniz Bingöl  
**Project:** ReaRead – Smart Reading Companion  
**Environment:** Cursor AI + React + Manifest V3 + TensorFlow.js + Groq API  
**Date:** 2025  

---

## 🧭 Overview
This roadmap defines the **10-week engineering plan** for implementing ReaRead as a fully functional AI browser extension.  
The plan ensures incremental feature delivery, each phase adding a functional layer — from extension setup to LLM integration and accessibility features.

---

## 🗓️ Phase 1 – Setup & Foundation (Week 1–2)
**Goal:** Establish working browser extension structure and popup UI.

**Tasks**
- [ ] Initialize project with **Vite + React + Manifest V3**.  
- [ ] Create folder structure: `src/popup`, `src/content`, `src/background`.  
- [ ] Add base **manifest.json** with permissions (`tabs`, `activeTab`, `scripting`, `storage`, `camera`).  
- [ ] Build minimal React popup with buttons: “Start Tracking”, “Stop Tracking”, “Settings”.  
- [ ] Configure message passing between popup → contentScript → background.

**Deliverables**
- React popup opens correctly in Chrome.
- Manifest recognized; permissions accepted.
- Logs confirm message flow across components.

---

## 🧠 Phase 2 – Eye Tracking Integration (Week 3–4)
**Goal:** Enable gaze tracking inside the webpage.

**Tasks**
- [ ] Integrate **MediaPipe Iris** for real-time gaze and pupil detection.  
- [ ] Implement fallback with **WebGazer.js** for compatibility.  
- [ ] Draw live gaze cursor overlay for debugging.  
- [ ] Collect metrics: `(x, y, fixation_time, revisit_count)`.  
- [ ] Stream gaze data to background process every 250ms.  

**Deliverables**
- Gaze tracking works inside content script.  
- Console logs show consistent gaze coordinate data.  
- Browser remains responsive (<25% CPU).

---

## 🧩 Phase 3 – Semantic Analyzer (Week 5)
**Goal:** Understand text structure and difficulty levels on any page.

**Tasks**
- [ ] Extract visible DOM text via `document.body.innerText`.  
- [ ] Split text into sentences with tokenizer.  
- [ ] Calculate **readability scores** using `textstat` (Flesch–Kincaid, SMOG, etc.).  
- [ ] Generate **semantic embeddings** using **Sentence-BERT (HuggingFace)** API.  
- [ ] Combine both to produce `{sentence, complexity_score}` objects.  

**Deliverables**
- Output: JSON list of sentences with complexity values.  
- Logs display semantic density scores.  
- Browser latency unaffected by text parsing.  

---

## ⚙️ Phase 4 – Fusion AI Model (Week 6–7)
**Goal:** Predict “reading difficulty” by combining eye and text data.

**Tasks**
- [ ] Build and train a **Lightweight LSTM** in **TensorFlow.js**.  
- [ ] Inputs: `[fixation_time, revisit_count, complexity_score]`.  
- [ ] Output: `difficulty_detected (true/false)` + `confidence (0–1)`.  
- [ ] Implement local model loading (no external server).  
- [ ] Add real-time inference in background script.  

**Deliverables**
- AI model correctly detects reading difficulty.  
- Confidence threshold adjustable from popup UI.  
- Logged predictions visible in DevTools console.

---

## 🧠 Phase 5 – Decision Layer + LLM Integration (Week 8)
**Goal:** Dynamically choose appropriate AI action (simplify, summarize, explain).

**Tasks**
- [ ] Implement **context-aware Decision Layer** in JS:
  ```js
  if (lang !== userLang) mode = "foreign";
  else if (complexity > 0.75) mode = "technical";
  else if (fixation > 2.5 || revisit > 3) mode = "reading_difficulty";
  ```  
- [ ] Map modes to actions:
  ```js
  { foreign: ["translate","simplify"], technical: ["summarize","explain"], reading_difficulty: ["simplify","tts"] }
  ```  
- [ ] Integrate **Groq API** (primary) and **Ollama (Mistral)** as fallback.  
- [ ] Define LLM prompts for each task type.  
- [ ] Parse LLM output and send it back to content script.

**Deliverables**
- Correct LLM action automatically triggered.  
- Simplify/Summarize/Explain results visible in tooltip.  
- API responses under 1.5 seconds latency.

---

## 🔊 Phase 6 – Accessibility Engine (Week 9)
**Goal:** Provide real-time user assistance inside the page.

**Tasks**
- [ ] Create **Tooltip/Popup component** to show simplified/translated text.  
- [ ] Implement **highlight** for active sentence.  
- [ ] Add **zoom** and **contrast** toggles for visual aid.  
- [ ] Enable **Text-to-Speech** playback via Web Speech API.  
- [ ] Store user preferences in **IndexedDB** for persistence.  

**Deliverables**
- Tooltip dynamically appears at gaze location.  
- Highlight and zoom react to detected difficulty.  
- Speech output synchronized with text.  

---

## 🚀 Phase 7 – Testing, Optimization & Deployment (Week 10)
**Goal:** Finalize performance, security, and release candidate.

**Tasks**
- [ ] Test gaze accuracy (target ≥85%).  
- [ ] Quantize TensorFlow.js model (reduce <5MB).  
- [ ] Optimize event frequency (10FPS limit).  
- [ ] Ensure privacy: no camera frames stored or sent.  
- [ ] Prepare **demo video** and **presentation slides**.  
- [ ] Package and upload `.zip` to Chrome Web Store (developer mode).  

**Deliverables**
- Fully functional MVP extension.  
- Documented privacy and performance reports.  
- Chrome store listing ready for testing.

---

## 🧩 Optional Phase – Post-MVP Enhancements (Future Sprints)

| Feature | Description | Tech Stack |
|----------|--------------|------------|
| Voice Command Mode | Trigger “Explain” or “Read aloud” via voice | Web SpeechRecognition API |
| Offline AI | Run on-device LLM (Phi-3-mini or TinyLlama) | Ollama local inference |
| Reading Analytics Dashboard | Visualize attention heatmaps, reading time | Chart.js + IndexedDB |
| Multi-language Support | English, Turkish, German NLP tuning | HuggingFace multilingual SBERT |

---

## ✅ Summary of Milestones

| Week | Milestone | Deliverable |
|------|------------|-------------|
| 1–2 | Extension skeleton ready | Popup + Manifest |
| 3–4 | Eye tracking online | Gaze logs visible |
| 5 | Semantic analysis functional | Complexity output |
| 6–7 | Fusion AI model integrated | Difficulty detection |
| 8 | Decision + LLM actions working | Auto simplify/summarize/explain |
| 9 | Accessibility engine done | Tooltip + TTS |
| 10 | Optimization + Deployment | MVP ready |
