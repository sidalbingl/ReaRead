/**
 * ReaRead Content Script - MINIMAL VERSION
 *
 * Clean, simple eye tracking
 */

import { MediaPipeTracker, GazePoint, HeadPose } from '../eye/MediaPipeTracker';
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
      onHeadPoseUpdate: handleHeadPoseUpdate,
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
    // Wait a bit before collecting to let user's gaze stabilize
    await new Promise(r => setTimeout(r, 300));

    return new Promise((resolve) => {
      const samples: GazePoint[] = [];
      const sampleCount = 50; // Increased from 30 to 50 for better averaging

      const interval = setInterval(() => {
        if (currentGaze) {
          samples.push(currentGaze);
        }

        if (samples.length >= sampleCount) {
          clearInterval(interval);

          // Remove outliers (top/bottom 10%)
          const sortedX = [...samples].sort((a, b) => a.x - b.x);
          const sortedY = [...samples].sort((a, b) => a.y - b.y);
          const trimCount = Math.floor(sampleCount * 0.1);
          const trimmedSamples = samples.filter((_, i) => {
            const xRank = sortedX.indexOf(samples[i]);
            const yRank = sortedY.indexOf(samples[i]);
            return xRank >= trimCount && xRank < sampleCount - trimCount &&
                   yRank >= trimCount && yRank < sampleCount - trimCount;
          });

          const validSamples = trimmedSamples.length >= 10 ? trimmedSamples : samples;

          // Average samples (screen coordinates)
          const avgX = validSamples.reduce((sum, g) => sum + g.x, 0) / validSamples.length;
          const avgY = validSamples.reduce((sum, g) => sum + g.y, 0) / validSamples.length;

          // Average RAW normalized coordinates (before calibration)
          const avgNormX = validSamples.reduce((sum, g) => sum + (g.normalizedX || 0), 0) / validSamples.length;
          const avgNormY = validSamples.reduce((sum, g) => sum + (g.normalizedY || 0), 0) / validSamples.length;

          // Calculate variance to check stability
          const varX = validSamples.reduce((sum, g) => sum + Math.pow(g.x - avgX, 2), 0) / validSamples.length;
          const varY = validSamples.reduce((sum, g) => sum + Math.pow(g.y - avgY, 2), 0) / validSamples.length;
          const stdDev = Math.sqrt(varX + varY);

          console.log(`[Calibration] Point: actual=(${targetPoint.x.toFixed(0)}, ${targetPoint.y.toFixed(0)}), measured=(${avgX.toFixed(0)}, ${avgY.toFixed(0)}), normalized=(${avgNormX.toFixed(3)}, ${avgNormY.toFixed(3)}), stdDev=${stdDev.toFixed(0)}px, samples=${validSamples.length}/${sampleCount}`);

          calibrationData.push({
            actual: targetPoint,
            measured: { x: avgX, y: avgY, normalizedX: avgNormX, normalizedY: avgNormY },
            stdDev
          });

          resolve({ x: avgX, y: avgY });
        }
      }, 40); // Slightly faster sampling (25fps)
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
// GAZE HANDLING - Satır Bazlı Stabilizasyon
// ========================================

// Kimi AI önerileri v2:
// 1. Frame skip → 30 FPS → 15 FPS (feedback loop kırılır)
// 2. Low-pass α = 0.15 → daha agresif (6-7 frame ortalama)
// 3. Satır yüksekliği bazlı dead-zone (Y: 16px, X: 20px)
// 4. Cursor her zaman görünsün ama sabit kalsın

const SMOOTHING_ALPHA = 0.15;  // Çok agresif smoothing
const LINE_HEIGHT = 16;        // Tipik satır yüksekliği
const DEAD_ZONE_Y = LINE_HEIGHT * 0.5; // ±8px dikey (yarım satır)
const DEAD_ZONE_X = 20;        // ±20px yatay

let smoothedX = 0;
let smoothedY = 0;
let displayX = 0;
let displayY = 0;
let isFirstGaze = true;
let frameSkip = 0;

// Head pose handler for calibration monitoring
function handleHeadPoseUpdate(pose: HeadPose): void {
  if (calibration) {
    calibration.updateHeadPose({
      yaw: pose.yaw,
      pitch: pose.pitch,
      x: pose.x,
      y: pose.y
    });
  }
}

function handleGazeUpdate(gaze: GazePoint): void {
  currentGaze = gaze;

  // A. Frame skip - her 2. frame'i atla (30 FPS → 15 FPS)
  frameSkip = (frameSkip + 1) % 2;
  if (frameSkip !== 0) return;

  // İlk frame'de başlangıç değerlerini ayarla
  if (isFirstGaze) {
    smoothedX = gaze.x;
    smoothedY = gaze.y;
    displayX = gaze.x;
    displayY = gaze.y;
    isFirstGaze = false;
  }

  // B. Low-pass filter - α=0.15 (çok yavaş tepki, titreme yok)
  smoothedX = SMOOTHING_ALPHA * gaze.x + (1 - SMOOTHING_ALPHA) * smoothedX;
  smoothedY = SMOOTHING_ALPHA * gaze.y + (1 - SMOOTHING_ALPHA) * smoothedY;

  // C. Dead-zone - satır içinde kaldığı sürece hareket etme
  // X: Yatayda ±20px içinde sabit kal
  if (Math.abs(smoothedX - displayX) > DEAD_ZONE_X) {
    displayX = smoothedX;
  }

  // Y: Dikeyde ±8px (yarım satır) içinde sabit kal
  if (Math.abs(smoothedY - displayY) > DEAD_ZONE_Y) {
    displayY = smoothedY;
  }

  // D. Cursor'u güncelle - her zaman görünsün
  if (gazeIndicator) {
    gazeIndicator.style.left = `${displayX - 8}px`;
    gazeIndicator.style.top = `${displayY - 8}px`;
    gazeIndicator.style.opacity = '0.8';  // Her zaman görünür
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
    transition: opacity 0.2s ease-out, left 0.1s ease-out, top 0.1s ease-out;
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
