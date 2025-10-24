# ReaRead – Feature Map (v1.0)

## 1. Purpose
This document defines **all major features**, **trigger conditions**, and **technological components** that power each functionality in ReaRead.  
It also clarifies which actions are part of the **base MVP** and which are **optional extensions**.

---

## 2. Core Behavior → Feature Mapping

| # | Trigger Condition | AI Action | Description | Technology Stack |
|---|-------------------|------------|--------------|------------------|
| 1 | Long fixation on same sentence (>2.5s) | **Simplify text** | Complex or dense sentences are rewritten in simpler language | Groq / Mistral (LLM API) |
| 2 | Multiple revisits to same paragraph | **Summarize** | Long paragraphs summarized concisely | Groq API / GPT-4o-mini |
| 3 | Text language ≠ browser language | **Translate + Simplify** | Detects foreign content and provides translated simplification | Groq LLM + LangDetect |
| 4 | Semantic complexity score > threshold | **Explain technical terms** | Explains domain-specific or scientific phrases | Sentence-BERT + Groq |
| 5 | Gaze instability (rapid left-right movement) | **Highlight current sentence** | Guides the reader visually to maintain focus | DOM manipulation + CSS |
| 6 | Pupil dilation or long fixation on small text | **Zoom text region** | Automatically enlarges difficult text | JavaScript + CSS scaling |
| 7 | Blink frequency or fatigue indicators | **Contrast / Dyslexia mode** | Applies high-contrast or readable font | CSS filters + OpenDyslexic font |
| 8 | Revisits and long fixation repetition | **TTS playback** | Reads the text aloud for auditory learning | Web Speech API |
| 9 | Voice command (“Explain this”) | **Voice-triggered LLM call** | Uses microphone input to query explanation | SpeechRecognition API + Groq |
| 10 | Inactivity (>5s without gaze movement) | **Pause tracking** | Saves CPU and waits for eye motion | JS event observer |

---

## 3. Feature Priority Levels

| Priority | Feature | Type | Included in MVP? |
|-----------|----------|------|------------------|
| ⭐⭐⭐ | Simplify, Summarize, Explain | Core LLM Actions | ✅ Yes |
| ⭐⭐ | Highlight, TTS | Accessibility Core | ✅ Yes |
| ⭐ | Zoom, Contrast, Voice Commands | Visual/Auditory Extension | ❌ Phase 2 |
| ⭐ | Reading Analytics Dashboard | Data Insight | ❌ Phase 3 |
| ⭐ | Offline Mode (local LLM) | Advanced Privacy Feature | ❌ Phase 3 |

---

## 4. User Behavior Profiles and Automatic Feature Mapping

| User Type | Behavior Detected | Automatic Actions |
|------------|------------------|------------------|
| **Dislexia / Reading Difficulty** | Long fixation, revisits, slow pace | Simplify + Highlight + TTS |
| **Language Learner** | Text in different language | Translate + Simplify + Explain |
| **Technical Reader** | High semantic density, technical terms | Summarize + Explain |
| **General User** | Balanced reading | No action or gentle tooltip (“Need help?”) |

---

## 5. Component Interaction Map

```
[Eye Tracker] 
   ↓ gaze data
[Fusion AI Model] 
   ↓ difficulty_detected + confidence
[Decision Layer]
   ↓ action_type = simplify / summarize / explain
[LLM Action Layer]
   ↓ processed text
[Accessibility Engine]
   ↓ DOM / TTS response
[User Feedback Layer]
   ↑ preference learning
```

---

## 6. MVP Feature Set Summary

**To be implemented for first public version:**  
- Eye Tracking (MediaPipe Iris + TensorFlow.js)  
- Semantic Analyzer (Sentence-BERT + textstat)  
- Fusion AI Model (TensorFlow.js)  
- Automatic Difficulty Detection (Decision Layer)  
- Simplify / Summarize / Explain Actions (Groq API)  
- Highlight Current Sentence (CSS DOM)  
- Text-to-Speech Output (Web Speech API)  
- Local Preference Saving (IndexedDB)

---

## 7. Feature Dependencies

| Feature | Depends On | Description |
|----------|-------------|-------------|
| Simplify / Summarize | LLM API | Requires stable Groq integration |
| Translate | Language detection | Requires `langdetect` JS module |
| Explain | Sentence-BERT | Needs semantic embeddings |
| TTS | Web Speech API | Browser native |
| Highlight / Zoom | DOM Access | Needs contentScript injection |

---

## 8. Metrics to Evaluate Each Feature

| Feature | Metric | Success Criteria |
|----------|---------|------------------|
| Simplify | Response latency | < 1.5s |
| Summarize | Compression rate | 60–70% reduction |
| Explain | User clarity rating | > 80% understanding |
| TTS | Speech clarity | ≥ 4/5 user satisfaction |
| Highlight | Eye tracking synchronization | < 200ms lag |
| Fusion AI | Accuracy | ≥ 80% detection precision |
| Decision Layer | Context match accuracy | ≥ 75% |

---

## 9. Scalability Notes
- Each feature is modular and can be toggled independently via configuration.  
- New actions (e.g., “paraphrase,” “quiz,” “visual summary”) can be added easily to the **Decision Layer** switch logic.  
- Local models (Phi-3-mini, TinyLlama) can replace Groq in offline environments.  
- UI popups follow the same reusable tooltip structure.

---

## 10. Summary
ReaRead’s feature system is fully modular, context-driven, and privacy-preserving.  
Every action begins with user behavior — not manual selection — and delivers contextual help instantly within the browser environment.
