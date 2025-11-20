/**
 * MINIMAL MediaPipe Eye Tracker
 *
 * Simple, clean implementation focused on accuracy
 * No unnecessary complexity
 */

import { SandboxBridge, type SandboxGazeData } from './SandboxBridge';

export interface GazePoint {
  x: number;  // Screen coordinates (pixels)
  y: number;  // Screen coordinates (pixels)
  timestamp: number;
  confidence: number;
  // Raw normalized coordinates (for calibration)
  normalizedX?: number;  // [-1, 1] range
  normalizedY?: number;  // [-1, 1] range
}

export interface MediaPipeConfig {
  onGazeUpdate?: (gaze: GazePoint) => void;
  onError?: (error: Error) => void;
  videoElement: HTMLVideoElement;
}

export class MediaPipeTracker {
  private sandboxBridge: SandboxBridge | null = null;
  private config: MediaPipeConfig;
  private isRunning = false;
  private mediaStream: MediaStream | null = null;

  // Linear calibration (least squares regression)
  private calibrationMatrix: {
    scaleX: number;
    scaleY: number;
    offsetX: number;
    offsetY: number;
  } = {
    scaleX: 1.0,
    scaleY: 1.0,
    offsetX: 0,
    offsetY: 0
  };

  // Smoothing filter - separate windows for X and Y
  private gazeHistory: Array<{ x: number; y: number }> = [];
  private readonly SMOOTHING_WINDOW_X = 8;
  private readonly SMOOTHING_WINDOW_Y = 4; // Less smoothing for Y to preserve movement

  // Eye height stabilization (to prevent blink jitter)
  private eyeHeightHistory: Array<number> = [];
  private readonly EYE_HEIGHT_WINDOW = 15;
  private stableEyeHeight: number = 0.03; // Default fallback

  constructor(config: MediaPipeConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log('[MediaPipe] Initializing...');

    if (this.config.videoElement?.srcObject) {
      this.mediaStream = this.config.videoElement.srcObject as MediaStream;
    }

    this.sandboxBridge = new SandboxBridge({
      onGazeData: (data) => this.handleGazeData(data),
      onReady: () => console.log('[MediaPipe] Ready'),
      onError: (error) => this.config.onError?.(error),
      debugMode: true
    });

    await this.sandboxBridge.initialize();
    console.log('[MediaPipe] ✅ Initialized');
  }

  async start(): Promise<void> {
    if (!this.sandboxBridge) {
      throw new Error('Not initialized');
    }

    if (this.mediaStream) {
      await this.sandboxBridge.setVideoStream(this.mediaStream);
    }

    this.isRunning = true;
    await this.sandboxBridge.start();
    console.log('[MediaPipe] ✅ Started');
  }

  stop(): void {
    this.isRunning = false;
    this.sandboxBridge?.stop();
    console.log('[MediaPipe] Stopped');
  }

  private frameCounter = 0;

  /**
   * Handle gaze data from sandbox
   */
  private handleGazeData(data: SandboxGazeData): void {
    this.frameCounter++;

    if (!this.isRunning) {
      if (this.frameCounter % 100 === 0) {
        console.log('[MediaPipe] Not running, ignoring gaze data');
      }
      return;
    }

    const { leftIris, rightIris, landmarks } = data;

    // Validate data
    if (!landmarks || landmarks.length < 478) {
      console.warn('[MediaPipe] Invalid landmarks:', landmarks?.length);
      return;
    }
    if (!leftIris || !rightIris) {
      console.warn('[MediaPipe] Invalid iris data');
      return;
    }

    // Get screen dimensions
    const sw = window.innerWidth;
    const sh = window.innerHeight;

    // Use STABLE eye landmarks (corner points, not eyelids which move on blink)
    const leftEyeLeft = landmarks[33];      // Left corner of left eye
    const leftEyeRight = landmarks[133];    // Right corner of left eye
    const rightEyeLeft = landmarks[362];    // Left corner of right eye
    const rightEyeRight = landmarks[263];   // Right corner of right eye

    // Calculate eye widths (stable)
    const leftEyeWidth = Math.abs(leftEyeRight.x - leftEyeLeft.x);
    const rightEyeWidth = Math.abs(rightEyeRight.x - rightEyeLeft.x);
    const avgEyeWidth = (leftEyeWidth + rightEyeWidth) / 2;

    // Calculate eye height using STABLE landmarks (inner eye points)
    // Using average of multiple inner eye points for stability
    const leftEyeTop = landmarks[159];      // Top of left eye
    const leftEyeBottom = landmarks[145];   // Bottom of left eye
    const rightEyeTop = landmarks[386];     // Top of right eye
    const rightEyeBottom = landmarks[374];  // Bottom of right eye

    const leftEyeHeight = Math.abs(leftEyeBottom.y - leftEyeTop.y);
    const rightEyeHeight = Math.abs(rightEyeBottom.y - rightEyeTop.y);
    const currentEyeHeight = (leftEyeHeight + rightEyeHeight) / 2;

    // Blink detection: eye height drops significantly during blink
    const aspectRatio = currentEyeHeight / avgEyeWidth;
    const isBlinking = aspectRatio < 0.15; // Eye aspect ratio threshold

    if (isBlinking) {
      // Skip this frame during blink
      return;
    }

    // Update stable eye height using moving average
    this.eyeHeightHistory.push(currentEyeHeight);
    if (this.eyeHeightHistory.length > this.EYE_HEIGHT_WINDOW) {
      this.eyeHeightHistory.shift();
    }
    this.stableEyeHeight = this.eyeHeightHistory.reduce((sum, h) => sum + h, 0) / this.eyeHeightHistory.length;

    // Calculate eye centers
    const leftEyeCenterX = (leftEyeLeft.x + leftEyeRight.x) / 2;
    const rightEyeCenterX = (rightEyeLeft.x + rightEyeRight.x) / 2;
    const leftEyeCenterY = (leftEyeTop.y + leftEyeBottom.y) / 2;
    const rightEyeCenterY = (rightEyeTop.y + rightEyeBottom.y) / 2;

    // Calculate iris offset from eye center
    const leftIrisOffsetX = (leftIris.x - leftEyeCenterX) / (leftEyeWidth / 2);
    const rightIrisOffsetX = (rightIris.x - rightEyeCenterX) / (rightEyeWidth / 2);
    const leftIrisOffsetY = (leftIris.y - leftEyeCenterY) / (leftEyeHeight / 2);
    const rightIrisOffsetY = (rightIris.y - rightEyeCenterY) / (rightEyeHeight / 2);


    // Average both eyes
    const avgIrisOffsetX = (leftIrisOffsetX + rightIrisOffsetX) / 2;
    const avgIrisOffsetY = (leftIrisOffsetY + rightIrisOffsetY) / 2;


    // DEBUG: Log eye dimensions and offsets (first time only)
    if (this.frameCounter === 1) {
      console.log('[MediaPipe] Eye dimensions:', {
        avgEyeWidth: avgEyeWidth.toFixed(4),
        stableEyeHeight: this.stableEyeHeight.toFixed(4),
        aspectRatio: (this.stableEyeHeight / avgEyeWidth).toFixed(3)
      });
      console.log('[MediaPipe] Using IRIS Y POSITION for Y-axis');
    }

    // Map to normalized coordinates [-1, 1]
    const normalizedX = avgIrisOffsetX;
    const normalizedY = avgIrisOffsetY;

    // Apply calibration on NORMALIZED coordinates: actual = scale * measured + offset
    const calibratedX = normalizedX * this.calibrationMatrix.scaleX + this.calibrationMatrix.offsetX;
    const calibratedY = normalizedY * this.calibrationMatrix.scaleY + this.calibrationMatrix.offsetY;

    // Map to screen coordinates
    const screenX = (calibratedX + 1) * 0.5 * sw; // [-1,1] -> [0, sw]
    const screenY = (calibratedY + 1) * 0.5 * sh; // [-1,1] -> [0, sh]

    // Clamp to screen bounds AFTER calibration
    const gazeX = Math.max(0, Math.min(sw, screenX));
    const gazeY = Math.max(0, Math.min(sh, screenY));

    // Apply separate smoothing for X and Y
    this.gazeHistory.push({ x: gazeX, y: gazeY });
    const maxWindow = Math.max(this.SMOOTHING_WINDOW_X, this.SMOOTHING_WINDOW_Y);
    if (this.gazeHistory.length > maxWindow) {
      this.gazeHistory.shift();
    }

    const recentX = this.gazeHistory.slice(-this.SMOOTHING_WINDOW_X);
    const recentY = this.gazeHistory.slice(-this.SMOOTHING_WINDOW_Y);
    const smoothedX = recentX.reduce((sum, p) => sum + p.x, 0) / recentX.length;
    const smoothedY = recentY.reduce((sum, p) => sum + p.y, 0) / recentY.length;

    // Debug log
    if (this.frameCounter === 1 || this.frameCounter % 100 === 0) {
      console.log(`[MediaPipe] Frame ${this.frameCounter}:`);
      console.log(`  iris=(${avgIrisOffsetX.toFixed(3)}, ${avgIrisOffsetY.toFixed(3)})`);
      console.log(`  normalized=(${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)})`);
      console.log(`  calibrated=(${calibratedX.toFixed(3)}, ${calibratedY.toFixed(3)})`);
      console.log(`  screen=(${screenX.toFixed(0)}, ${screenY.toFixed(0)})`);
      console.log(`  calibration: scale=(${this.calibrationMatrix.scaleX.toFixed(2)}, ${this.calibrationMatrix.scaleY.toFixed(2)}), offset=(${this.calibrationMatrix.offsetX.toFixed(2)}, ${this.calibrationMatrix.offsetY.toFixed(2)})`);
      console.log(`  final gaze=(${smoothedX.toFixed(0)}, ${smoothedY.toFixed(0)})`);
    }

    // Send update (include raw normalized coordinates for calibration)
    if (this.config.onGazeUpdate) {
      this.config.onGazeUpdate({
        x: smoothedX,
        y: smoothedY,
        timestamp: performance.now(),
        confidence: 0.8,
        normalizedX,  // Raw normalized (before calibration)
        normalizedY   // Raw normalized (before calibration)
      });
    } else {
      if (this.frameCounter === 1) {
        console.warn('[MediaPipe] No onGazeUpdate callback!');
      }
    }
  }

  /**
   * Apply calibration data
   * Uses linear regression on NORMALIZED coordinates: actual_norm = scale * measured_norm + offset
   *
   * @param points - Array where:
   *   - actual: target screen coordinates (pixels)
   *   - measured: can be either screen pixels OR normalized coords
   *     If measured has normalizedX/normalizedY, use those
   *     Otherwise convert screen coords to normalized
   */
  applyCalibration(points: Array<{
    actual: { x: number; y: number },
    measured: { x: number; y: number; normalizedX?: number; normalizedY?: number }
  }>): void {
    if (points.length === 0) return;

    console.log('[MediaPipe] Applying calibration with', points.length, 'points');

    const sw = window.innerWidth;
    const sh = window.innerHeight;

    // Convert all points to normalized coordinates [-1, 1]
    const normalizedPoints = points.map(p => ({
      actual: {
        x: (p.actual.x / sw) * 2 - 1,    // [0, sw] -> [-1, 1]
        y: (p.actual.y / sh) * 2 - 1     // [0, sh] -> [-1, 1]
      },
      measured: {
        // Use raw normalized if available, otherwise convert screen to normalized
        x: p.measured.normalizedX !== undefined ? p.measured.normalizedX : (p.measured.x / sw) * 2 - 1,
        y: p.measured.normalizedY !== undefined ? p.measured.normalizedY : (p.measured.y / sh) * 2 - 1
      }
    }));

    // DEBUG: Log sample calibration points
    console.log('[MediaPipe] Sample calibration points (normalized):');
    for (let i = 0; i < Math.min(5, normalizedPoints.length); i++) {
      const p = normalizedPoints[i];
      console.log(`  Point ${i+1}: actual=(${p.actual.x.toFixed(3)}, ${p.actual.y.toFixed(3)}) measured=(${p.measured.x.toFixed(3)}, ${p.measured.y.toFixed(3)})`);
    }

    // Calculate means
    let meanActualX = 0, meanActualY = 0;
    let meanMeasuredX = 0, meanMeasuredY = 0;

    normalizedPoints.forEach(p => {
      meanActualX += p.actual.x;
      meanActualY += p.actual.y;
      meanMeasuredX += p.measured.x;
      meanMeasuredY += p.measured.y;
    });

    meanActualX /= normalizedPoints.length;
    meanActualY /= normalizedPoints.length;
    meanMeasuredX /= normalizedPoints.length;
    meanMeasuredY /= normalizedPoints.length;

    // Calculate scale using least squares regression
    let numeratorX = 0, denominatorX = 0;
    let numeratorY = 0, denominatorY = 0;

    normalizedPoints.forEach(p => {
      const dx = p.measured.x - meanMeasuredX;
      const dy = p.measured.y - meanMeasuredY;

      numeratorX += dx * (p.actual.x - meanActualX);
      denominatorX += dx * dx;

      numeratorY += dy * (p.actual.y - meanActualY);
      denominatorY += dy * dy;
    });

    const scaleX = denominatorX !== 0 ? numeratorX / denominatorX : 1.0;
    const scaleY = denominatorY !== 0 ? numeratorY / denominatorY : 1.0;

    // Calculate offset: offset = mean(actual) - scale * mean(measured)
    const offsetX = meanActualX - scaleX * meanMeasuredX;
    const offsetY = meanActualY - scaleY * meanMeasuredY;

    this.calibrationMatrix = {
      scaleX,
      scaleY,
      offsetX,
      offsetY
    };

    // Calculate calibration quality in SCREEN coordinates for readability
    let totalErrorBefore = 0;
    let totalErrorAfter = 0;

    points.forEach((p, i) => {
      const pNorm = normalizedPoints[i];

      // Before (in screen px)
      const dxBefore = p.actual.x - p.measured.x;
      const dyBefore = p.actual.y - p.measured.y;
      totalErrorBefore += Math.sqrt(dxBefore * dxBefore + dyBefore * dyBefore);

      // After: apply calibration in normalized space, then convert to screen
      const correctedNormX = scaleX * pNorm.measured.x + offsetX;
      const correctedNormY = scaleY * pNorm.measured.y + offsetY;
      const correctedX = (correctedNormX + 1) * 0.5 * sw;
      const correctedY = (correctedNormY + 1) * 0.5 * sh;

      const dxAfter = p.actual.x - correctedX;
      const dyAfter = p.actual.y - correctedY;
      totalErrorAfter += Math.sqrt(dxAfter * dxAfter + dyAfter * dyAfter);
    });

    const avgErrorBefore = totalErrorBefore / points.length;
    const avgErrorAfter = totalErrorAfter / points.length;

    console.log('[MediaPipe] ✅ Calibration applied:');
    console.log(`  Scale: (${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`);
    console.log(`  Offset: (${offsetX.toFixed(3)}, ${offsetY.toFixed(3)})`);
    console.log(`  Avg error BEFORE: ${avgErrorBefore.toFixed(0)}px`);
    console.log(`  Avg error AFTER: ${avgErrorAfter.toFixed(0)}px`);
    console.log(`  Improvement: ${((avgErrorBefore - avgErrorAfter) / avgErrorBefore * 100).toFixed(1)}%`);
  }

  async dispose(): Promise<void> {
    this.stop();
    this.sandboxBridge?.dispose();
    this.sandboxBridge = null;
    this.mediaStream = null;
    console.log('[MediaPipe] Disposed');
  }
}
