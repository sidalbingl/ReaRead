/**
 * ReaRead Content Script - MINIMAL VERSION
 *
 * Clean, simple eye tracking
 */

import { MediaPipeTracker, GazePoint } from '../eye/MediaPipeTracker';
import { CalibrationSystem } from '../eye/CalibrationSystem';

// ========================================
// STATE
// ========================================

let stream: MediaStream | null = null;
let tracker: MediaPipeTracker | null = null;
let calibration: CalibrationSystem | null = null;

let isActive = false;
let currentGaze: GazePoint | null = null;

// UI Elements
let videoEl: HTMLVideoElement | null = null;
let gazeIndicator: HTMLDivElement | null = null;
let statusBadge: HTMLDivElement | null = null;

// ========================================
// INITIALIZATION
// ========================================

async function startCamera(): Promise<void> {
  if (isActive) return;

  try {
    console.log('[ReaRead] Starting...');

    // Create UI
    createUI();

    // Get camera
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
    });

    if (!videoEl) throw new Error('Video element not created');
    videoEl.srcObject = stream;

    await new Promise<void>((resolve, reject) => {
      videoEl!.addEventListener('loadedmetadata', () => {
        videoEl!.play().then(resolve).catch(reject);
      }, { once: true });
      setTimeout(() => reject(new Error('Video timeout')), 5000);
    });

    // Initialize tracker
    updateStatus('Loading AI models...', '#f59e0b');
    calibration = new CalibrationSystem();
    tracker = new MediaPipeTracker({
      videoElement: videoEl,
      onGazeUpdate: handleGazeUpdate,
      onError: (error) => console.error('[ReaRead] Error:', error)
    });

    await tracker.initialize();
    updateStatus('Starting tracking...', '#f59e0b');
    await tracker.start();

    // Run calibration
    updateStatus('Calibrating...', '#f59e0b');
    await runCalibration();

    // Done
    isActive = true;
    updateStatus('Active ✓', '#10b981');
    createGazeIndicator();

    console.log('[ReaRead] ✅ Ready');

  } catch (error) {
    console.error('[ReaRead] Error:', error);
    updateStatus('Error', '#ef4444');
    throw error;
  }
}

async function runCalibration(): Promise<void> {
  if (!calibration || !tracker) return;

  const calibrationData: Array<{
    actual: { x: number; y: number },
    measured: { x: number; y: number; normalizedX?: number; normalizedY?: number },
    stdDev?: number
  }> = [];

  await calibration.runCalibration(async (targetPoint) => {
    // Collect gaze samples - INCREASED for better accuracy
    return new Promise((resolve) => {
      const samples: GazePoint[] = [];
      const sampleCount = 30; // Increased from 20 to 30

      const interval = setInterval(() => {
        if (currentGaze) {
          samples.push(currentGaze);
        }

        if (samples.length >= sampleCount) {
          clearInterval(interval);

          // Average samples (screen coordinates)
          const avgX = samples.reduce((sum, g) => sum + g.x, 0) / samples.length;
          const avgY = samples.reduce((sum, g) => sum + g.y, 0) / samples.length;

          // Average RAW normalized coordinates (before calibration)
          const avgNormX = samples.reduce((sum, g) => sum + (g.normalizedX || 0), 0) / samples.length;
          const avgNormY = samples.reduce((sum, g) => sum + (g.normalizedY || 0), 0) / samples.length;

          // Calculate variance to check stability
          const varX = samples.reduce((sum, g) => sum + Math.pow(g.x - avgX, 2), 0) / samples.length;
          const varY = samples.reduce((sum, g) => sum + Math.pow(g.y - avgY, 2), 0) / samples.length;
          const stdDev = Math.sqrt(varX + varY);

          console.log(`[Calibration] Point: actual=(${targetPoint.x.toFixed(0)}, ${targetPoint.y.toFixed(0)}), measured=(${avgX.toFixed(0)}, ${avgY.toFixed(0)}), normalized=(${avgNormX.toFixed(3)}, ${avgNormY.toFixed(3)}), stdDev=${stdDev.toFixed(0)}px`);

          calibrationData.push({
            actual: targetPoint,
            measured: { x: avgX, y: avgY, normalizedX: avgNormX, normalizedY: avgNormY },
            stdDev
          });

          resolve({ x: avgX, y: avgY });
        }
      }, 50);
    });
  });

  // Apply calibration
  console.log('[ReaRead] Applying calibration with data:', JSON.stringify(calibrationData, null, 2));
  tracker.applyCalibration(calibrationData);
  console.log('[ReaRead] ✅ Calibration complete');
}

function stopCamera(): void {
  if (!isActive) return;

  stream?.getTracks().forEach(track => track.stop());
  tracker?.stop();
  tracker?.dispose();

  stream = null;
  tracker = null;
  isActive = false;

  gazeIndicator?.remove();
  gazeIndicator = null;

  updateStatus('Stopped', '#6b7280');
  console.log('[ReaRead] Stopped');
}

// ========================================
// GAZE HANDLING
// ========================================

function handleGazeUpdate(gaze: GazePoint): void {
  currentGaze = gaze;

  if (gazeIndicator) {
    gazeIndicator.style.left = `${gaze.x - 8}px`;
    gazeIndicator.style.top = `${gaze.y - 8}px`;
    gazeIndicator.style.display = 'block';
  }
}

// ========================================
// UI
// ========================================

function createUI(): void {
  // Container
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 999999;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;

  // Status badge
  statusBadge = document.createElement('div');
  statusBadge.style.cssText = `
    font-family: system-ui, sans-serif;
    font-size: 12px;
    color: #fff;
    padding: 6px 12px;
    border-radius: 20px;
    background: #6b7280;
    font-weight: 500;
  `;
  statusBadge.textContent = 'ReaRead • Starting...';

  // Video preview
  videoEl = document.createElement('video');
  videoEl.autoplay = true;
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.style.cssText = `
    width: 160px;
    height: 120px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  `;

  container.appendChild(statusBadge);
  container.appendChild(videoEl);
  document.body.appendChild(container);
}

function createGazeIndicator(): void {
  if (gazeIndicator) return;

  gazeIndicator = document.createElement('div');
  gazeIndicator.style.cssText = `
    position: fixed;
    width: 16px;
    height: 16px;
    border: 2px solid #ef4444;
    border-radius: 50%;
    pointer-events: none;
    z-index: 9999999;
    box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
    display: none;
  `;
  document.body.appendChild(gazeIndicator);
}

function updateStatus(text: string, color: string): void {
  if (statusBadge) {
    statusBadge.textContent = `ReaRead • ${text}`;
    statusBadge.style.background = color;
  }
}

// ========================================
// MESSAGE HANDLER
// ========================================

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PING') {
    sendResponse({ pong: true });
    return true;
  }

  if (msg?.type === 'START_TRACKING') {
    startCamera()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg?.type === 'STOP_TRACKING') {
    stopCamera();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

// ========================================
// CLEANUP
// ========================================

window.addEventListener('beforeunload', () => {
  if (isActive) stopCamera();
});

console.log('[ReaRead] 🚀 Content script loaded (Minimal Edition)');
