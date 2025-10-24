// Background script for ReaRead extension
// Handles core functionality and message passing

// State
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
  language: 'auto',
  confidenceThreshold: 0.7,
};

const state: AppState = {
  isActive: false,
  settings: { ...defaultSettings },
};

// Load settings from storage
chrome.storage.sync.get('settings', (data) => {
  if (data.settings) {
    state.settings = { ...defaultSettings, ...data.settings };
  }
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab) return; // Only accept messages from tabs

  switch (message.type) {
    case 'START_TRACKING':
      handleStartTracking(message.settings, sender.tab.id);
      break;
    
    case 'STOP_TRACKING':
      handleStopTracking(sender.tab.id);
      break;
    
    case 'GET_STATUS':
      sendResponse({ isActive: state.isActive });
      break;
    
    case 'UPDATE_SETTINGS':
      state.settings = { ...state.settings, ...message.settings };
      chrome.storage.sync.set({ settings: state.settings });
      break;
    
    case 'GAZE_DATA':
      // Process gaze data from content script
      processGazeData(message.data, sender.tab.id);
      break;
    
    default:
      console.warn('Unknown message type:', message.type);
  }

  return true; // Required for async sendResponse
});

// Handle tab updates and removals
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && state.isActive && tabId === state.currentTabId) {
    // Re-inject content script if the page reloads
    injectContentScript(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === state.currentTabId) {
    state.isActive = false;
    state.currentTabId = undefined;
  }
});

// Helper functions
function handleStartTracking(settings: any, tabId?: number) {
  if (tabId) {
    state.currentTabId = tabId;
    state.isActive = true;
    
    if (settings) {
      state.settings = { ...state.settings, ...settings };
      chrome.storage.sync.set({ settings: state.settings });
    }
    
    // Inject content script into the current tab
    injectContentScript(tabId);
    
    console.log('ReaRead: Tracking started on tab', tabId);
  }
}

function handleStopTracking(tabId?: number) {
  if (!tabId || tabId === state.currentTabId) {
    state.isActive = false;
    
    // Notify content script to stop tracking
    if (state.currentTabId) {
      chrome.tabs.sendMessage(state.currentTabId, { type: 'STOP_TRACKING' });
    }
    
    console.log('ReaRead: Tracking stopped');
  }
}

async function injectContentScript(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/index.js'],
    });
    
    console.log('ReaRead: Content script injected');
  } catch (error) {
    console.error('Failed to inject content script:', error);
  }
}

function processGazeData(data: any, tabId?: number) {
  if (!state.isActive || !tabId || tabId !== state.currentTabId) return;
  
  // TODO: Implement gaze data processing and difficulty detection
  // This will be expanded to include the fusion AI model
  console.log('Processing gaze data:', data);
  
  // For now, just forward to content script for visualization
  chrome.tabs.sendMessage(tabId, {
    type: 'UPDATE_GAZE_VISUALIZATION',
    data: {
      x: data.x,
      y: data.y,
      timestamp: Date.now(),
    },
  });
}

// Initialize extension
console.log('ReaRead background script loaded');
