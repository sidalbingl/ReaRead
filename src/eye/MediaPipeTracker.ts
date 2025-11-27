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

export interface HeadPose {
  yaw: number;   // Left-right head rotation
  pitch: number; // Up-down head rotation
  x: number;     // Nose X position (0-1)
  y: number;     // Nose Y position (0-1)
}

export interface MediaPipeConfig {
  onGazeUpdate?: (gaze: GazePoint) => void;
  onHeadPoseUpdate?: (pose: HeadPose) => void;
  onError?: (error: Error) => void;
  videoElement: HTMLVideoElement;
}

export class MediaPipeTracker {
  private sandboxBridge: SandboxBridge | null = null;
  private config: MediaPipeConfig;
  private isRunning = false;
  private mediaStream: MediaStream | null = null;

  // Affine calibration matrix (2x3)
  // [a, b, tx]   ->  x' = a*x + b*y + tx
  // [c, d, ty]   ->  y' = c*x + d*y + ty
  // This allows for rotation, scale, shear, and translation
  private calibrationMatrix: {
    a: number;   // X scale + rotation
    b: number;   // X shear
    c: number;   // Y shear
    d: number;   // Y scale + rotation
    tx: number;  // X translation
    ty: number;  // Y translation
  } = {
    a: 1, b: 0, tx: 0,
    c: 0, d: 1, ty: 0
  };

  private isCalibrated = false;

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

    // Calculate iris offset from eye center (normalized by eye dimensions)
    const leftIrisCenter = {
      x: (leftIris.x - leftEyeCenterX) / (leftEyeWidth / 2),
      y: (leftIris.y - leftEyeCenterY) / (leftEyeHeight / 2)
    };
    const rightIrisCenter = {
      x: (rightIris.x - rightEyeCenterX) / (rightEyeWidth / 2),
      y: (rightIris.y - rightEyeCenterY) / (rightEyeHeight / 2)
    };

    // Weighted average based on eye size (larger eye = more reliable)
    const leftWeight = leftEyeWidth * leftEyeHeight;
    const rightWeight = rightEyeWidth * rightEyeHeight;
    const totalWeight = leftWeight + rightWeight;

    // Raw iris offsets from both eyes
    const irisOffsetX = (leftIrisCenter.x * leftWeight + rightIrisCenter.x * rightWeight) / totalWeight;
    const irisOffsetY = (leftIrisCenter.y * leftWeight + rightIrisCenter.y * rightWeight) / totalWeight;

    // Get face landmarks for head pose estimation
    const noseTip = landmarks[4];        // Nose tip
    const forehead = landmarks[10];      // Forehead center
    const chin = landmarks[152];         // Chin
    const leftCheek = landmarks[234];    // Left cheek
    const rightCheek = landmarks[454];   // Right cheek

    // HEAD YAW (left-right head rotation) for X-axis correction
    // When head turns RIGHT, nose appears on LEFT side of face center
    // Face center X = average of cheeks
    const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
    const noseOffsetFromCenter = noseTip.x - faceCenterX;
    // Normalize by face width
    const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
    const headYaw = faceWidth > 0.01 ? (noseOffsetFromCenter / faceWidth) * 2 : 0; // Range ~ -1 to 1

    // HEAD PITCH for Y-axis (up-down head tilt)
    // Nose tip relative to forehead-chin line indicates pitch
    const faceHeight = Math.abs(chin.y - forehead.y);
    const nosePitchOffset = (noseTip.y - forehead.y) / faceHeight - 0.5;
    const headPitch = nosePitchOffset * 2; // Range ~ -1 to 1

    // === REDUCED HEAD POSE COMPENSATION ===
    // Previous gains (1.2, 0.8) were causing iris range to collapse
    // Reducing to let calibration matrix handle the compensation
    const yawGain = 0.3;   // Reduced from 1.2 - let calibration handle most of it
    const pitchGain = 0.2; // Reduced from 0.8 - let calibration handle most of it

    // Head pose katkısını hesapla ve CLAMP'le (taşmayı önle)
    let dx = headYaw * yawGain;
    let dy = headPitch * pitchGain;
    dx = Math.max(-0.3, Math.min(0.3, dx));
    dy = Math.max(-0.3, Math.min(0.3, dy));

    // X-axis: Iris + head yaw (MIRROR: tersle)
    let avgIrisOffsetX = -(irisOffsetX + dx);

    // Y-axis: Iris + head pitch
    let avgIrisOffsetY = -(irisOffsetY + dy);

    // Send head pose update for calibration monitoring
    if (this.config.onHeadPoseUpdate) {
      this.config.onHeadPoseUpdate({
        yaw: headYaw,
        pitch: headPitch,
        x: noseTip.x,
        y: noseTip.y
      });
    }

    // SON CLAMP: Normalized değerleri güvenli aralıkta tut
    avgIrisOffsetX = Math.max(-0.95, Math.min(0.95, avgIrisOffsetX));
    avgIrisOffsetY = Math.max(-0.95, Math.min(0.95, avgIrisOffsetY));


    // DEBUG: Log eye dimensions and offsets (first time only)
    if (this.frameCounter === 1) {
      console.log('[MediaPipe] Eye dimensions:', {
        avgEyeWidth: avgEyeWidth.toFixed(4),
        stableEyeHeight: this.stableEyeHeight.toFixed(4),
        aspectRatio: (this.stableEyeHeight / avgEyeWidth).toFixed(3)
      });
      console.log('[MediaPipe] Using IRIS + HEAD_POSE for Y-axis');
    }

    // Map to normalized coordinates [-1, 1]
    const normalizedX = avgIrisOffsetX;
    const normalizedY = avgIrisOffsetY;

    let gazeX: number;
    let gazeY: number;

    if (!this.isCalibrated) {
      // BEFORE CALIBRATION: Use simple linear mapping
      // Iris offset typically ranges from -0.3 to 0.3
      // Map this to screen coordinates with center at screen center
      const irisRange = 0.4; // Expected range of iris movement
      gazeX = sw / 2 + (normalizedX / irisRange) * (sw / 2);
      gazeY = sh / 2 + (normalizedY / irisRange) * (sh / 2);
    } else {
      // AFTER CALIBRATION: Use affine transform
      // x' = a*x + b*y + tx
      // y' = c*x + d*y + ty
      const { a, b, c, d, tx, ty } = this.calibrationMatrix;
      gazeX = a * normalizedX + b * normalizedY + tx;
      gazeY = c * normalizedX + d * normalizedY + ty;
    }

    // Clamp to screen bounds
    gazeX = Math.max(0, Math.min(sw, gazeX));
    gazeY = Math.max(0, Math.min(sh, gazeY));

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
      console.log(`[MediaPipe] Frame ${this.frameCounter} (calibrated=${this.isCalibrated}):`);
      console.log(`  iris=(${avgIrisOffsetX.toFixed(3)}, ${avgIrisOffsetY.toFixed(3)})`);
      console.log(`  normalized=(${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)})`);
      console.log(`  raw gaze=(${gazeX.toFixed(0)}, ${gazeY.toFixed(0)})`);
      if (this.isCalibrated) {
        const { a, b, c, d, tx, ty } = this.calibrationMatrix;
        console.log(`  affine: [${a.toFixed(1)}, ${b.toFixed(1)}, ${tx.toFixed(0)}] [${c.toFixed(1)}, ${d.toFixed(1)}, ${ty.toFixed(0)}]`);
      }
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
   * Apply calibration using Affine Transform (2x3 matrix)
   * Solves for: [a, b, tx; c, d, ty] where
   *   x' = a*x + b*y + tx
   *   y' = c*x + d*y + ty
   * Uses least squares to fit all calibration points
   */
  applyCalibration(points: Array<{
    actual: { x: number; y: number },
    measured: { x: number; y: number; normalizedX?: number; normalizedY?: number },
    stdDev?: number
  }>): void {
    if (points.length === 0) return;

    console.log('[MediaPipe] Applying affine calibration with', points.length, 'points');

    // OUTLIER FILTERING: Remove points with high stdDev (> 50px)
    // Gevşetildi: 25 -> 50 (daha fazla nokta geçsin)
    const MAX_STDDEV = 50;
    const goodPoints = points.filter(p => {
      const isGood = !p.stdDev || p.stdDev < MAX_STDDEV;
      if (!isGood) {
        console.log(`[MediaPipe] Filtering out point (${p.actual.x.toFixed(0)}, ${p.actual.y.toFixed(0)}) with stdDev=${p.stdDev?.toFixed(0)}px`);
      }
      return isGood;
    });

    console.log(`[MediaPipe] ${goodPoints.length}/${points.length} points passed quality filter`);

    // Require at least 4 good points for affine transform (3 minimum, 4 for stability)
    if (goodPoints.length < 4) {
      console.warn(`[MediaPipe] Not enough good calibration points (${goodPoints.length}/4), using default matrix`);
      this.useDefaultCalibration();
      return;
    }

    const sw = window.innerWidth;
    const sh = window.innerHeight;

    // Prepare data: measured (iris) -> actual (screen pixels)
    const data = goodPoints.map(p => ({
      // Source: normalized iris position
      srcX: p.measured.normalizedX !== undefined ? p.measured.normalizedX : 0,
      srcY: p.measured.normalizedY !== undefined ? p.measured.normalizedY : 0,
      // Destination: actual screen position (pixels)
      dstX: p.actual.x,
      dstY: p.actual.y
    }));

    // DEBUG: Log calibration points
    console.log('[MediaPipe] Calibration points:');
    data.forEach((p, i) => {
      console.log(`  Point ${i+1}: src=(${p.srcX.toFixed(3)}, ${p.srcY.toFixed(3)}) -> dst=(${p.dstX.toFixed(0)}, ${p.dstY.toFixed(0)})`);
    });

    // Solve affine transform using least squares
    // For X: dstX = a*srcX + b*srcY + tx
    // For Y: dstY = c*srcX + d*srcY + ty
    //
    // Using normal equations: A^T * A * params = A^T * b
    // where A = [[srcX1, srcY1, 1], [srcX2, srcY2, 1], ...]
    //       b = [dstX1, dstX2, ...] or [dstY1, dstY2, ...]

    const n = data.length;

    // Build matrices for least squares
    let sumX = 0, sumY = 0;
    let sumXX = 0, sumYY = 0, sumXY = 0;
    let sumDstX = 0, sumDstY = 0;
    let sumXDstX = 0, sumYDstX = 0;
    let sumXDstY = 0, sumYDstY = 0;

    data.forEach(p => {
      sumX += p.srcX;
      sumY += p.srcY;
      sumXX += p.srcX * p.srcX;
      sumYY += p.srcY * p.srcY;
      sumXY += p.srcX * p.srcY;
      sumDstX += p.dstX;
      sumDstY += p.dstY;
      sumXDstX += p.srcX * p.dstX;
      sumYDstX += p.srcY * p.dstX;
      sumXDstY += p.srcX * p.dstY;
      sumYDstY += p.srcY * p.dstY;
    });

    // Solve 3x3 system for X: [sumXX, sumXY, sumX; sumXY, sumYY, sumY; sumX, sumY, n] * [a; b; tx] = [sumXDstX; sumYDstX; sumDstX]
    // Using Cramer's rule for simplicity

    const detA = sumXX * (sumYY * n - sumY * sumY)
               - sumXY * (sumXY * n - sumY * sumX)
               + sumX * (sumXY * sumY - sumYY * sumX);

    if (Math.abs(detA) < 1e-10) {
      console.warn('[MediaPipe] Singular matrix in calibration, using default');
      this.useDefaultCalibration();
      return;
    }

    // Solve for a, b, tx (X equation)
    const detAa = sumXDstX * (sumYY * n - sumY * sumY)
                - sumXY * (sumYDstX * n - sumY * sumDstX)
                + sumX * (sumYDstX * sumY - sumYY * sumDstX);

    const detAb = sumXX * (sumYDstX * n - sumY * sumDstX)
                - sumXDstX * (sumXY * n - sumY * sumX)
                + sumX * (sumXY * sumDstX - sumYDstX * sumX);

    const detAtx = sumXX * (sumYY * sumDstX - sumYDstX * sumY)
                 - sumXY * (sumXY * sumDstX - sumYDstX * sumX)
                 + sumXDstX * (sumXY * sumY - sumYY * sumX);

    const a = detAa / detA;
    const b = detAb / detA;
    const tx = detAtx / detA;

    // Solve for c, d, ty (Y equation) - same matrix, different RHS
    const detAc = sumXDstY * (sumYY * n - sumY * sumY)
                - sumXY * (sumYDstY * n - sumY * sumDstY)
                + sumX * (sumYDstY * sumY - sumYY * sumDstY);

    const detAd = sumXX * (sumYDstY * n - sumY * sumDstY)
                - sumXDstY * (sumXY * n - sumY * sumX)
                + sumX * (sumXY * sumDstY - sumYDstY * sumX);

    const detAty = sumXX * (sumYY * sumDstY - sumYDstY * sumY)
                 - sumXY * (sumXY * sumDstY - sumYDstY * sumX)
                 + sumXDstY * (sumXY * sumY - sumYY * sumX);

    const c = detAc / detA;
    const d = detAd / detA;
    const ty = detAty / detA;

    console.log(`[MediaPipe] Raw affine: a=${a.toFixed(1)}, b=${b.toFixed(1)}, tx=${tx.toFixed(0)}`);
    console.log(`[MediaPipe] Raw affine: c=${c.toFixed(1)}, d=${d.toFixed(1)}, ty=${ty.toFixed(0)}`);

    // SANITY CHECK: Normalized scale values should be reasonable
    // After mirror fix and head-pose, normalized range should be ~0.6-0.8
    // So scale to fill screen should be ~1.5-2.5x, max 3x
    // Scale in pixels = (screen_size / normalized_range)
    // For sw=1536 and normalized_range=0.6: scale ≈ 2560
    const expectedScale = sw / 0.6;  // Expected scale for typical iris range
    const MAX_SCALE = expectedScale * 3;  // Allow 3x expected
    const MIN_SCALE = expectedScale / 5;  // Allow 0.2x expected

    const scaleX = Math.sqrt(a * a + c * c);  // Effective X scale
    const primaryScaleY = Math.abs(d);        // Primary Y scale

    console.log(`[MediaPipe] Effective scales: X=${scaleX.toFixed(0)}, Y=${primaryScaleY.toFixed(0)} (expected ~${expectedScale.toFixed(0)})`);

    if (scaleX > MAX_SCALE || scaleX < MIN_SCALE) {
      console.warn(`[MediaPipe] ScaleX ${scaleX.toFixed(0)} out of valid range [${MIN_SCALE.toFixed(0)}, ${MAX_SCALE.toFixed(0)}], using default`);
      this.useDefaultCalibration();
      return;
    }
    if (primaryScaleY > MAX_SCALE || primaryScaleY < MIN_SCALE) {
      console.warn(`[MediaPipe] ScaleY ${primaryScaleY.toFixed(0)} out of valid range [${MIN_SCALE.toFixed(0)}, ${MAX_SCALE.toFixed(0)}], using default`);
      this.useDefaultCalibration();
      return;
    }

    // Apply the calibration
    this.calibrationMatrix = { a, b, c, d, tx, ty };
    this.isCalibrated = true;

    // Calculate calibration quality
    let totalErrorBefore = 0;
    let totalErrorAfter = 0;

    data.forEach(p => {
      // Before: simple center mapping
      const beforeX = sw / 2 + p.srcX * sw;
      const beforeY = sh / 2 + p.srcY * sh;
      const dxBefore = p.dstX - beforeX;
      const dyBefore = p.dstY - beforeY;
      totalErrorBefore += Math.sqrt(dxBefore * dxBefore + dyBefore * dyBefore);

      // After: apply affine
      const afterX = a * p.srcX + b * p.srcY + tx;
      const afterY = c * p.srcX + d * p.srcY + ty;
      const dxAfter = p.dstX - afterX;
      const dyAfter = p.dstY - afterY;
      totalErrorAfter += Math.sqrt(dxAfter * dxAfter + dyAfter * dyAfter);
    });

    const avgErrorBefore = totalErrorBefore / n;
    const avgErrorAfter = totalErrorAfter / n;

    console.log('[MediaPipe] ✅ Affine calibration applied:');
    console.log(`  Matrix: [${a.toFixed(1)}, ${b.toFixed(1)}, ${tx.toFixed(0)}]`);
    console.log(`          [${c.toFixed(1)}, ${d.toFixed(1)}, ${ty.toFixed(0)}]`);
    console.log(`  Avg error BEFORE: ${avgErrorBefore.toFixed(0)}px`);
    console.log(`  Avg error AFTER: ${avgErrorAfter.toFixed(0)}px`);
    console.log(`  Improvement: ${((avgErrorBefore - avgErrorAfter) / avgErrorBefore * 100).toFixed(1)}%`);
  }

  /**
   * Use default calibration matrix when quality is too low
   * This provides a reasonable baseline that maps iris position to screen
   */
  private useDefaultCalibration(): void {
    const sw = window.innerWidth;
    const sh = window.innerHeight;

    // Default affine: simple scale + center offset
    // Iris range ~0.6 should map to full screen
    // x' = a*x + b*y + tx  ->  x' = (sw/0.6)*x + 0*y + sw/2
    // y' = c*x + d*y + ty  ->  y' = 0*x + (sh/0.6)*y + sh/2
    const irisRange = 0.6;

    this.calibrationMatrix = {
      a: sw / irisRange,  // X scale
      b: 0,               // No X-Y coupling
      c: 0,               // No Y-X coupling
      d: sh / irisRange,  // Y scale
      tx: sw / 2,         // X center
      ty: sh / 2          // Y center
    };

    this.isCalibrated = true;
    console.log('[MediaPipe] Using default affine calibration');
    console.log(`  Matrix: [${this.calibrationMatrix.a.toFixed(0)}, 0, ${this.calibrationMatrix.tx.toFixed(0)}]`);
    console.log(`          [0, ${this.calibrationMatrix.d.toFixed(0)}, ${this.calibrationMatrix.ty.toFixed(0)}]`);
  }

  async dispose(): Promise<void> {
    this.stop();
    this.sandboxBridge?.dispose();
    this.sandboxBridge = null;
    this.mediaStream = null;
    console.log('[MediaPipe] Disposed');
  }
}
