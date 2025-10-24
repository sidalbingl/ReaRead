import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
// Icons will be added later
import './styles/main.css';

const App = () => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [settings, setSettings] = useState({
    autoStart: false,
    ttsEnabled: true,
    showHighlights: true,
    language: 'auto',
    confidenceThreshold: 0.7,
  });

  useEffect(() => {
    // Load settings from chrome.storage
    chrome.storage.sync.get('settings', (data) => {
      if (data.settings) {
        setSettings(prev => ({ ...prev, ...data.settings }));
      }
    });

    // Check if tracking is active
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      setIsActive(response?.isActive || false);
    });
  }, []);

  const toggleTracking = async () => {
    setIsLoading(true);
    try {
      if (isActive) {
        // Stop tracking
        const response = await chrome.runtime.sendMessage({ type: 'STOP_TRACKING' });
        setIsActive(false);
      } else {
        // Start tracking
        const response = await chrome.runtime.sendMessage({ 
          type: 'START_TRACKING',
          settings 
        });
        setIsActive(true);
      }
    } catch (error) {
      console.error('Error toggling tracking:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = (newSettings: any) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    chrome.storage.sync.set({ settings: updatedSettings });
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>ReaRead</h1>
        <div className="header-actions">
          <button 
            className="icon-button" 
            onClick={() => setShowSettings(!showSettings)}
            aria-label="Settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      <main className="app-content">
        {showSettings ? (
          <div className="settings-panel">
            <h2>Settings</h2>
            <div className="setting-item">
              <label>
                <input 
                  type="checkbox" 
                  checked={settings.autoStart}
                  onChange={(e) => saveSettings({ autoStart: e.target.checked })}
                />
                Auto-start on page load
              </label>
            </div>
            <div className="setting-item">
              <label>
                <input 
                  type="checkbox" 
                  checked={settings.ttsEnabled}
                  onChange={(e) => saveSettings({ ttsEnabled: e.target.checked })}
                />
                Enable Text-to-Speech
              </label>
            </div>
            <div className="setting-item">
              <label>
                <input 
                  type="checkbox" 
                  checked={settings.showHighlights}
                  onChange={(e) => saveSettings({ showHighlights: e.target.checked })}
                />
                Show reading highlights
              </label>
            </div>
            <div className="setting-item">
              <label>
                Language:
                <select 
                  value={settings.language}
                  onChange={(e) => saveSettings({ language: e.target.value })}
                >
                  <option value="auto">Auto-detect</option>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="zh">Chinese</option>
                </select>
              </label>
            </div>
            <div className="setting-item">
              <label>
                Confidence Threshold: {settings.confidenceThreshold.toFixed(1)}
                <input 
                  type="range" 
                  min="0.1" 
                  max="1" 
                  step="0.1" 
                  value={settings.confidenceThreshold}
                  onChange={(e) => saveSettings({ confidenceThreshold: parseFloat(e.target.value) })}
                />
              </label>
            </div>
            <button 
              className="close-settings"
              onClick={() => setShowSettings(false)}
            >
              Close Settings
            </button>
          </div>
        ) : (
          <div className="main-panel">
            <div className="status-indicator">
              <div className={`status-dot ${isActive ? 'active' : ''}`}></div>
              <span>{isActive ? 'Active' : 'Inactive'}</span>
            </div>
            
            <button 
              className={`primary-button ${isActive ? 'stop' : 'start'}`}
              onClick={toggleTracking}
              disabled={isLoading}
            >
              {isLoading ? (
                'Loading...'
              ) : isActive ? (
                <>
                  👁️ Stop Tracking
                </>
              ) : (
                <>
                  ⚡ Start Reading
                </>
              )}
            </button>

            <div className="quick-actions">
              <button className="secondary-button">
                📚 Reading History
              </button>
              <button className="secondary-button">
                ℹ️ Help
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>ReaRead v1.0.0</p>
      </footer>
    </div>
  );
};

// Initialize the app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

export default App;
