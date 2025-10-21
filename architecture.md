# ReaRead – System Architecture Document (2025 Edition)
**Author:** Sidal Deniz Bingöl  
**Version:** 1.0  
**Date:** 2025

---

## 1. System Overview
ReaRead is a **browser-based AI extension** that detects where a user struggles while reading and provides **context‑aware help** (simplify, summarize, translate, explain, TTS, highlight, zoom).  
All critical processing (eye tracking, fusion model inference, DOM actions) runs **on-device** inside the browser for **privacy and low latency**.

**Key traits**
- Manifest V3 compliant (Chrome, Edge; Firefox MV3 port-ready).
- Zero backend requirement for MVP (LLM via public API or local Ollama).
- Modular layers so each capability can evolve independently.

---

## 2. High‑Level Architecture

```
+--------------------------------------------------------------+
|                     Browser Extension Layer                  |
|  (React Popup, Content Script, Background Service Worker)    |
+--------------------------------------------------------------+
                |                    |                   
                | runtime messaging  |                    
                v                    v                    
+---------------------------+   +---------------------------+
|   Eye Tracking Module     |   |    Semantic Analyzer      |
| (MediaPipe/TensorFlow.js) |   | (Sentence-BERT + textstat)|
+---------------------------+   +---------------------------+
                \                    /
                 \                  /
                  v                v
               +----------------------+
               |    Fusion AI Model   |
               | (TF.js LSTM/LogReg)  |
               +----------------------+
                         |
                         v
               +----------------------+
               |    Decision Layer    |
               | (Context-Aware Mode) |
               +----------------------+
                         |
                         v
               +----------------------+
               |    LLM Action Layer  |
               | (Groq/Ollama/OpenAI) |
               +----------------------+
                         |
                         v
               +----------------------+
               | Accessibility Engine |
               | (DOM, TTS, Zoom, UX) |
               +----------------------+
                         |
                         v
               +----------------------+
               |  Local Data Storage  |
               |   (IndexedDB/Firebase)|
               +----------------------+
```

---

## 3. Data Flow (End‑to‑End)

| Step | Producer → Consumer | Payload | Notes |
|-----:|---------------------|---------|------|
| 1 | Content Script → Semantic Analyzer | Visible text (sentences) | Extract with DOM; ignore hidden/offscreen nodes. |
| 2 | Camera (WebRTC) → Eye Module | Frames (local only) | No upload; MediaPipe Iris returns gaze landmarks. |
| 3 | Eye Module → Fusion AI | `{x,y,fixation,revisit}` | Stream every 200–300 ms (throttled). |
| 4 | Semantic Analyzer → Fusion AI | `{sentenceId, complexity}` | Precomputed per sentence. |
| 5 | Fusion AI → Decision Layer | `{difficulty, confidence, sentenceId}` | TF.js model predicts flag. |
| 6 | Decision Layer → LLM Layer | `{action, text}` | Chooses simplify/summarize/explain/translate/TTS. |
| 7 | LLM Layer → Accessibility Engine | `{outputText, meta}` | API or local model response. |
| 8 | Accessibility Engine → User | Tooltip/Highlight/TTS/Zoom | Non‑intrusive UI inside page. |
| 9 | Accessibility Engine → IndexedDB | Minimal logs/preferences | No PII; aggregate metrics only. |

---

## 4. Components

### 4.1 Browser Extension Layer
- **Popup (React + Vite)**: start/stop tracking, model/provider selection, thresholds.
- **Content Script**: DOM access, sentence bounding boxes, inject tooltip UI.
- **Background Service Worker**: LLM calls, model loading, long‑running tasks.
- **Messaging**: `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage`.

**Manifest (essentials)**
```json
{
  "manifest_version": 3,
  "name": "ReaRead",
  "version": "1.0.0",
  "permissions": ["activeTab","scripting","storage"],
  "host_permissions": ["<all_urls>"],
  "action": { "default_popup": "popup.html" },
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["contentScript.js"],
    "run_at": "document_idle"
  }]
}
```

### 4.2 Eye Tracking Module
- **Primary:** MediaPipe Iris (browser‑optimized eye landmarks).  
- **Fallback:** WebGazer.js for broader compatibility.
- **Outputs:** `(x, y)`, `fixation_time`, `revisit_count`, optional `blink_rate`.

Sampling: 8–10 FPS is sufficient for reading; throttle to reduce CPU.

### 4.3 Semantic Analyzer
- **Extraction:** collect visible sentences; map each to DOM ranges + bounding boxes via `Range.getBoundingClientRect()`.
- **Metrics:**
  - Readability via `textstat`.
  - Semantic complexity via **Sentence‑BERT** embeddings + norm/entropy heuristics.
- **Output:** `[{sentenceId, rect, complexity, language}]`.

### 4.4 Fusion AI Model (TF.js)
- **Inputs:** `[fixation_time, revisit_count, complexity]` (+ optional blink variance).
- **Model:** Lightweight LSTM or logistic regression in TensorFlow.js.
- **Output:** `{difficulty_detected:boolean, confidence:0..1, sentenceId}`.
- **Training:** small labeled set (synthetic + pilot users). Quantize to keep < 5MB.

### 4.5 Decision Layer (Context‑Aware)
Heuristics combine content and behavior to infer *why* user struggles.

```js
function detectMode({lang,textLang,complexity,fixation,revisits}){
  if (textLang && lang && textLang !== lang) return "foreign";
  if (complexity > 0.75) return "technical";
  if (fixation > 2.5 || revisits >= 3) return "reading_difficulty";
  return "normal";
}

const ACTIONS = {
  foreign: ["translate","simplify"],
  technical: ["summarize","explain"],
  reading_difficulty: ["simplify","tts","highlight"],
  normal: []
};
```
Confidence threshold (e.g. `>0.7`) gates LLM usage to save tokens.

### 4.6 LLM Action Layer
- **Providers:** Groq (primary, fast), Ollama (local Mistral/Phi‑3), OpenAI GPT‑4o‑mini (optional).
- **Prompts:**
  - Simplify: “Rewrite this concisely and clearly for general readers.”
  - Summarize: “Summarize in one sentence; keep key result.”
  - Explain: “Explain the term in plain language with one example.”
  - Translate: “Translate to {userLang} and simplify wording.”

Example (Groq pseudo):
```js
const res = await groq.chat.completions.create({
  model: "mixtral-8x7b",
  messages: [{role:"user", content:`${prompt}
---
${text}`}]
});
const output = res.choices[0].message.content.trim();
```

### 4.7 Accessibility Engine
- **Tooltip/Popup:** absolute‑positioned container near sentence rect.
- **Highlight:** background/underline on active sentence.
- **Zoom/Contrast:** `element.style.zoom` or CSS class toggles (dyslexia‑friendly font).
- **TTS:** `speechSynthesis.speak(new SpeechSynthesisUtterance(output))`.
- **State:** store preferences (`ttsEnabled`, `zoomLevel`, thresholds) in IndexedDB.

---

## 5. Storage Design
- **IndexedDB**: `{ prefs, provider, thresholds, lastActions, anonymizedMetrics }`
- **No video storage**; gaze coordinates kept ephemeral or aggregated.
- **Optional Firebase Sync**: only aggregated metrics for research (opt‑in).

Schema sketch:
```json
{
  "prefs": {"tts": true, "zoom": 1.25, "contrast": false},
  "provider": "groq",
  "thresholds": {"fixation": 2.5, "complexity": 0.75},
  "metrics": [{"ts": 1712345678, "difficulty": true, "mode":"technical"}]
}
```

---

## 6. Privacy & Security
- All camera frames are processed **locally**; no uploads.  
- LLMs receive **only text spans**, never identity or URLs (configurable).  
- Per‑domain camera permission; clear consent UX.  
- Compliant with GDPR/KVKK: no PII, data minimization, easy reset (“Clear Data”).

---

## 7. Performance Strategy
- TF.js **quantization** and lazy loading.  
- Cap gaze sampling to ≤10 FPS and debounce computations.  
- Cache LLM outputs per sentence hash to avoid repeats.  
- Use **Web Workers** (service worker / dedicated worker) to keep UI responsive.  
- Aim for DOM action latency **< 200 ms** and LLM latency **< 1.5 s**.

---

## 8. Error Handling & Resilience
- Provider fallback: Groq → Ollama → OpenAI (configurable).  
- Timeouts & retries with exponential backoff for API calls.  
- Circuit breaker: disable LLM temporarily if error rate spikes.  
- Safe UI: tooltip never blocks native page interactions (esc to close).

---

## 9. Testing Plan
- **Unit**: tokenizers, heuristics, decision mapping, storage.  
- **Integration**: eye→fusion→decision→LLM→UI pipeline on sample pages.  
- **Performance**: CPU/memory via Chrome Performance panel.  
- **Privacy**: verify no camera frames leave device (network inspector).  
- **UX**: pilot tests with 3–5 users (dyslexia, language learners, technical readers).

---

## 10. Deployment
- Dev: load unpacked extension in Chrome.  
- Beta: compress `/dist` to `.zip`, upload to **Chrome Web Store** dev listing.  
- Cross‑browser: test on Edge; prepare Firefox MV3 manifest adjustments.  
- Versioning: semantic versioning, changelog, feature flags.

---

## 11. Reference Folder Structure

```
rea-read-extension/
├─ public/
│  ├─ popup.html
│  ├─ icon128.png
│  └─ manifest.json
├─ src/
│  ├─ popup/              # React popup
│  │  └─ index.tsx
│  ├─ content/            # contentScript: DOM + UI
│  │  ├─ contentScript.ts
│  │  └─ tooltip.css
│  ├─ background/         # service worker
│  │  └─ background.ts
│  ├─ ml/
│  │  ├─ fusionModel.ts   # TF.js model load/predict
│  │  └─ semantic.ts      # textstat + SBERT calls
│  ├─ eye/
│  │  └─ gaze.ts          # MediaPipe/WebGazer wrapper
│  ├─ core/
│  │  ├─ decision.ts      # context-aware mapping
│  │  └─ messaging.ts     # runtime messaging helpers
│  └─ storage/
│     └─ db.ts            # IndexedDB utilities
├─ docs/
│  ├─ prd.md
│  ├─ feature_map.md
│  ├─ development_roadmap.md
│  └─ architecture.md
└─ package.json
```

---

## 12. Example Message Contracts

**Content → Background (difficulty event)**
```json
{
  "type": "DIFFICULTY_DETECTED",
  "payload": {
    "sentenceId": "s42",
    "text": "Photovoltaic upconversion...",
    "mode": "technical",
    "confidence": 0.86,
    "requestedAction": "summarize"
  }
}
```

**Background → Content (LLM result)**
```json
{
  "type": "AI_ACTION_RESULT",
  "payload": {
    "sentenceId": "s42",
    "action": "summarize",
    "output": "Researchers built a new solar panel type that converts more light into power."
  }
}
```

---

## 13. Risks & Mitigations
- **Eye tracking noise** → smooth/median filters; lower FPS; calibration step.  
- **Token costs/latency** → confidence gating + caching; local Ollama fallback.  
- **DOM variability** → robust sentence mapping; use Ranges; observe mutations.  
- **Permission friction** → clear, minimal prompts; per‑site opt‑in.

---

## 14. Conclusion
This architecture enables a **privacy‑first**, **low‑latency**, and **user‑adaptive** reading assistant.  
It is production‑minded (MV3, modular, testable), extensible (offline LLM, analytics), and suitable for an undergraduate capstone with genuine research value.
