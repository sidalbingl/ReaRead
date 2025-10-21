# ReaRead – Smart Reading Companion  
**Product Requirements Document (PRD)**  
**Author:** Sidal Deniz Bingöl  
**Department:** Computer Engineering  
**Date:** 2025  

---

## 1. Overview  
ReaRead is a **browser-based AI extension** that enhances reading comprehension by observing users’ eye behavior and automatically identifying where they struggle while reading.  
It provides **real-time adaptive assistance** such as text simplification, summarization, translation, and audio playback — *without requiring manual profile selection.*  

This project combines **computer vision, natural language processing, and accessibility design** to create a seamless assistive reading experience for everyone.  

---

## 2. Problem Statement  
Users often face different reading difficulties:  
- People with **dyslexia or visual stress** may struggle with long or dense texts.  
- **Language learners** face comprehension and vocabulary barriers.  
- **Professionals or students** reading technical content spend time deciphering complex phrasing.  

Existing extensions require manual input (“simplify this” or “translate this”).  
ReaRead introduces **intelligent, context-aware support** — it *detects* the difficulty and automatically assists.  

---

## 3. Project Goals  
- Develop a **Manifest V3 Chrome extension** that works on any webpage.  
- Detect user reading difficulty through **eye-tracking + text analysis.**  
- Automatically select the appropriate action (simplify, summarize, translate, explain, or TTS).  
- Preserve **data privacy** — all camera and gaze processing runs locally.  
- Offer a minimal, non-intrusive UX that feels natural and intuitive.  

---

## 4. Target User Segments  
| User Group | Core Need | System Response |
|-------------|------------|----------------|
| 🧩 Dyslexia / Reading Difficulty | Struggles with reading focus & comprehension | Simplify + Highlight + TTS |
| 🌍 Language Learners | Understanding non-native language content | Translate + Simplify + Explain |
| 🧠 Technical Readers | Decoding dense academic/technical text | Summarize + Explain |

---

## 5. Core Features (Base MVP)

| Layer | Feature | Description | Technologies |
|--------|----------|--------------|--------------|
| **Eye Tracking** | Gaze detection (x, y, fixation, revisits) | Real-time tracking via webcam | `MediaPipe Iris`, `TensorFlow.js` |
| **Semantic Analyzer** | Readability & complexity scoring | Determines which sentences are difficult | `Sentence-BERT (HuggingFace)`, `textstat` |
| **Fusion AI Model** | Difficulty classifier | Merges gaze + semantic data to predict struggle | `TensorFlow.js`, `Lightweight LSTM` |
| **Decision Layer (Auto Mode)** | Context-aware mode detection | Auto-detects user type (dyslexia / foreign / technical) | `Custom JS logic + semantic heuristics` |
| **LLM Action Layer** | Simplify / Summarize / Translate / Explain | Calls appropriate language model | `Groq API`, `Ollama (Mistral 7B)`, `OpenAI GPT-4o-mini` |
| **Accessibility Engine** | Apply real-time DOM actions | Popup summaries, zoom, highlight, or TTS | `Web Speech API`, `CSS DOM manipulation` |
| **Data Layer** | Local user profile + preferences | Saves usage patterns (no personal data) | `IndexedDB`, `Firebase Sync (optional)` |
| **UI Layer** | Minimal React popup | Start/stop tracking, quick settings | `React.js + Manifest V3` |

---

## 6. Extended (Future) Features  

| Feature | Description | Target |
|----------|--------------|--------|
| **Dynamic Zoom & Contrast Mode** | Auto enlarge text or switch to dyslexia-friendly font when visual strain detected | Accessibility |
| **Real-Time Translation Mode** | Detects non-native language and auto-translates | Language Learners |
| **Voice Interaction** | “Explain this” or “Summarize that” via SpeechRecognition API | All users |
| **Offline Mode** | On-device LLM (Phi-3-mini or TinyLlama) | Privacy |
| **Reading Analytics** | Displays comprehension stats and gaze heatmaps | Research/Education |

---

## 7. System Architecture  

```
Browser Extension (Manifest V3 + React)
         ↓
Eye Tracking (MediaPipe / TensorFlow.js)
         ↓
Gaze Data (x, y, fixation_time, revisits)
         ↓
Semantic Analyzer (Sentence-BERT + textstat)
         ↓
Fusion AI Model (difficulty_detected)
         ↓
Decision Layer (context-aware)
         ↓
LLM API (Simplify / Summarize / Translate / Explain)
         ↓
Accessibility Engine (DOM Popup / TTS / Zoom)
         ↓
User Feedback + IndexedDB Logs
```

---

## 8. Technology Stack (2025 Stable & Supported)

| Category | Stack | Notes |
|-----------|--------|-------|
| **Frontend (Extension)** | React.js, Vite, Chrome Manifest V3 | Fast development, MV3 compliance |
| **Computer Vision** | MediaPipe Iris + TensorFlow.js | Google-backed, efficient on browser |
| **NLP / Embedding** | Sentence-BERT (HuggingFace) | Lightweight semantic understanding |
| **ML Fusion Model** | TensorFlow.js (client-side LSTM) | Runs locally without backend |
| **LLM Integration** | Groq API (fast inference), Ollama (local), OpenAI GPT-4o-mini | Multi-provider flexibility |
| **TTS & Speech** | Web Speech API, gTTS (fallback) | Cross-browser support |
| **Data Storage** | IndexedDB (local), Firebase (optional sync) | Privacy-first local persistence |
| **Deployment** | Chrome Web Store, Edge Add-ons | Easy cross-browser distribution |

---

## 9. Data Flow Summary  

| Step | Component | Input | Output |
|------|------------|--------|---------|
| 1 | Eye Tracking | Webcam feed | Gaze coordinates |
| 2 | Semantic Analyzer | Webpage text | Readability score |
| 3 | Fusion AI | Gaze + text data | “difficulty_detected” flag |
| 4 | Decision Layer | Context (text type, user behavior) | Appropriate response type |
| 5 | LLM Integration | Selected text | Simplified / translated / summarized text |
| 6 | Accessibility Engine | LLM output | Tooltip / audio / zoom update |
| 7 | Feedback Layer | User interactions | Stored preferences for learning |

---

## 10. Privacy & Ethics  
- **Local-first processing:** No webcam footage or personal data leaves the device.  
- **Anonymized learning:** Only statistical gaze metrics (not video) are stored.  
- **Explicit consent:** The extension requests camera access per domain.  
- **Transparency:** All AI models and logs are open-source and user-auditable.  

---

## 11. Success Metrics  

| Metric | Goal |
|---------|------|
| Eye tracking accuracy | ≥ 85% within browser |
| Difficulty detection precision | ≥ 80% (test dataset) |
| LLM response latency | < 1.5 seconds |
| User satisfaction (pilot test) | ≥ 4/5 |
| CPU usage (average) | < 25% during continuous use |

---

## 12. Development Timeline (10 Weeks)

| Phase | Duration | Deliverable |
|--------|-----------|-------------|
| **Week 1–2** | Setup extension + popup UI | Working React + Manifest V3 structure |
| **Week 3–4** | Eye tracking integration | MediaPipe gaze detection active |
| **Week 5–6** | Semantic analyzer + readability | Sentence-BERT + textstat scoring |
| **Week 7–8** | Fusion AI + LLM integration | Automatic difficulty detection |
| **Week 9** | Accessibility Engine + UI polish | Tooltip, TTS, zoom actions |
| **Week 10** | Testing + Chrome Store prep | MVP submission & documentation |

---

## 13. Deliverables  
- Full browser extension (React + MV3)  
- Trained lightweight Fusion AI model (TensorFlow.js)  
- Functional LLM pipeline (Groq / Ollama)  
- Demo video & technical presentation  
- Documentation (`architecture.md`, `prd.md`, `feature_map.md`)  

---

## 14. Key Innovation  
ReaRead replaces static “AI readers” with a **context-aware, adaptive assistant** that:  
- Understands *what* makes text hard,  
- Detects *when* the reader struggles,  
- Decides *how* to help — all automatically, in real time.  

It brings together **assistive tech, cognitive AI, and privacy-first engineering** into a unified browser tool for universal reading accessibility.
