// Background script for ReaRead extension

type AppState = {
  isActive: boolean;
  settings: {
    autoStart: boolean;
    ttsEnabled: boolean;
    showHighlights: boolean;
    language: string;
    confidenceThreshold: number;
  };
  currentTabId?: number;
};

const defaultSettings = {
  autoStart: false,
  ttsEnabled: true,
  showHighlights: true,
  language: "auto",
  confidenceThreshold: 0.7,
};

const state: AppState = {
  isActive: false,
  settings: { ...defaultSettings },
};

// Load settings
chrome.storage.sync.get("settings", (data) => {
  if (data.settings) state.settings = { ...defaultSettings, ...data.settings };
  console.log("⚙️ Settings loaded:", state.settings);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📩 Message received:", message);

  (async () => {
    switch (message.type) {
      case "START_TRACKING":
        await startForActiveTab(message.settings);
        sendResponse?.({ ok: true });
        break;

      case "STOP_TRACKING":
        await stopForActiveTab();
        sendResponse?.({ ok: true });
        break;

      case "GET_STATUS":
        sendResponse?.({ isActive: state.isActive });
        break;

      case "UPDATE_SETTINGS":
        state.settings = { ...state.settings, ...message.settings };
        chrome.storage.sync.set({ settings: state.settings });
        console.log("💾 Settings updated:", state.settings);
        sendResponse?.({ ok: true });
        break;

      case "GAZE_DATA":
        processGazeData(message.data, sender.tab?.id);
        sendResponse?.({ ok: true });
        break;

      default:
        console.warn("⚠️ Unknown message type:", message.type);
        sendResponse?.({ ok: false, reason: "unknown_type" });
    }
  })();

  return true; // keep port open
});

// ---- Core flow ----

async function startForActiveTab(settings?: any) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    console.warn("🚫 No active tab found.");
    return;
  }

  state.currentTabId = activeTab.id;
  if (settings) {
    state.settings = { ...state.settings, ...settings };
    chrome.storage.sync.set({ settings: state.settings });
  }

  // 1) PING content; 2) yoksa enjekte et; 3) START gönder
  const ok = await ensureContentReady(activeTab.id);
  if (!ok) {
    console.warn("🚫 Content script not available for tab:", activeTab.id);
    return;
  }

  chrome.tabs.sendMessage(activeTab.id, { type: "START_TRACKING", settings }, () => {
    if (chrome.runtime.lastError) {
      console.warn("⚠️ START_TRACKING send error:", chrome.runtime.lastError.message);
    } else {
      state.isActive = true;
      console.log("✅ START_TRACKING delivered to tab:", activeTab.id);
    }
  });
}

async function stopForActiveTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    console.warn("🚫 No active tab found.");
    return;
  }

  const ok = await ensureContentReady(activeTab.id);
  if (!ok) {
    console.warn("🚫 Content script not available for tab:", activeTab.id);
    return;
  }

  chrome.tabs.sendMessage(activeTab.id, { type: "STOP_TRACKING" }, () => {
    if (chrome.runtime.lastError) {
      console.warn("⚠️ STOP_TRACKING send error:", chrome.runtime.lastError.message);
    } else {
      state.isActive = false;
      state.currentTabId = undefined;
      console.log("✅ STOP_TRACKING delivered to tab:", activeTab.id);
    }
  });
}

// PING → enjekte et (fallback) → tekrar PING
async function ensureContentReady(tabId: number): Promise<boolean> {
  const ping = () =>
    new Promise<boolean>((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: "PING" }, (res) => {
        if (chrome.runtime.lastError) return resolve(false);
        resolve(Boolean(res?.pong));
      });
    });

  // 1) İlk deneme - content script zaten yüklü mü?
  if (await ping()) {
    console.log("✅ Content script already loaded for tab:", tabId);
    return true;
  }

  // 2) Kısa bir süre bekle (content script yükleniyordur)
  console.log("⏳ Waiting for content script to load...");
  for (let i = 0; i < 3; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (await ping()) {
      console.log("✅ Content script loaded after waiting");
      return true;
    }
  }

  // 3) Fallback: Manuel inject dene (özel sayfalar için)
  console.log("🔄 Attempting manual injection...");
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"], // ✅ DÜZELTME: @crxjs/vite-plugin bu dosyayı oluşturur
    });
    console.log("🧩 content.js manually injected to tab:", tabId);
    
    // Inject sonrası kısa bir süre bekle ve tekrar dene
    await new Promise(resolve => setTimeout(resolve, 200));
    const finalCheck = await ping();
    
    if (finalCheck) {
      console.log("✅ Content script ready after manual injection");
    } else {
      console.warn("⚠️ Content script still not responding after injection");
    }
    
    return finalCheck;
  } catch (e) {
    console.error("❌ Script injection failed:", e);
    return false;
  }
}

// optional
function processGazeData(data: any, tabId?: number) {
  if (!state.isActive || !tabId || tabId !== state.currentTabId) return;
  chrome.tabs.sendMessage(tabId, {
    type: "UPDATE_GAZE_VISUALIZATION",
    data: { x: data.x, y: data.y, timestamp: Date.now() },
  });
}

console.log("🚀 ReaRead background script loaded");