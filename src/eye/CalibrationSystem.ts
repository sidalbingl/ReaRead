/**
 * IMPROVED Calibration System with Head Stabilization
 *
 * Key improvements:
 * 1. Head position monitoring during calibration
 * 2. Longer dwell time with visual feedback
 * 3. Preparation screen before calibration
 * 4. Per-point quality indicators
 * 5. Validation screen after calibration
 */

export interface HeadPoseData {
  yaw: number;   // Left-right rotation
  pitch: number; // Up-down rotation
  x: number;     // Head position X
  y: number;     // Head position Y
}

export interface CalibrationPoint {
  actual: { x: number; y: number };
  measured: { x: number; y: number; normalizedX?: number; normalizedY?: number };
  stdDev: number;
  headMovement: number;
}

export class CalibrationSystem {
  private currentHeadPose: HeadPoseData | null = null;
  private headPoseCallback: ((pose: HeadPoseData) => void) | null = null;

  // Configuration
  private readonly DWELL_TIME = 2500; // 2.5 seconds per point
  private readonly MAX_HEAD_MOVEMENT = 0.08; // Max allowed head movement during sampling

  /**
   * Set head pose callback for monitoring
   */
  setHeadPoseCallback(callback: (pose: HeadPoseData) => void): void {
    this.headPoseCallback = callback;
  }

  /**
   * Update current head pose (called from MediaPipeTracker)
   */
  updateHeadPose(pose: HeadPoseData): void {
    this.currentHeadPose = pose;
    this.headPoseCallback?.(pose);
  }

  /**
   * Generate 9-point calibration grid (3x3)
   */
  generateCalibrationGrid(): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    const width = window.innerWidth;
    const height = window.innerHeight;

    const positions = [
      // 3x3 grid - slightly inward from edges
      [0.15, 0.15], [0.5, 0.15], [0.85, 0.15],
      [0.15, 0.5],  [0.5, 0.5],  [0.85, 0.5],
      [0.15, 0.85], [0.5, 0.85], [0.85, 0.85]
    ];

    positions.forEach(([x, y]) => {
      points.push({
        x: width * x,
        y: height * y
      });
    });

    return points;
  }

  /**
   * Run full calibration with preparation and validation
   */
  async runCalibration(
    onGazeCapture: (point: { x: number; y: number }) => Promise<{ x: number; y: number }>
  ): Promise<void> {
    // Show preparation screen first
    await this.showPreparationScreen();

    // Run main calibration
    return this.runMainCalibration(onGazeCapture);
  }

  /**
   * Show preparation screen
   */
  private async showPreparationScreen(): Promise<void> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        z-index: 99999999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: system-ui, -apple-system, sans-serif;
        color: white;
      `;

      overlay.innerHTML = `
        <div style="text-align: center; max-width: 600px; padding: 40px;">
          <div style="font-size: 64px; margin-bottom: 24px;">👁️</div>
          <h1 style="font-size: 32px; font-weight: 600; margin-bottom: 16px;">
            Eye Tracking Calibration
          </h1>
          <p style="font-size: 18px; opacity: 0.9; line-height: 1.6; margin-bottom: 32px;">
            For best results:
          </p>
          <div style="text-align: left; background: rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; margin-bottom: 32px;">
            <div style="display: flex; align-items: center; margin-bottom: 16px;">
              <span style="font-size: 24px; margin-right: 16px;">🪑</span>
              <span style="font-size: 16px;">Sit comfortably and <strong>keep your head still</strong></span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 16px;">
              <span style="font-size: 24px; margin-right: 16px;">👀</span>
              <span style="font-size: 16px;">Move only your <strong>eyes</strong> to look at each dot</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 16px;">
              <span style="font-size: 24px; margin-right: 16px;">⏱️</span>
              <span style="font-size: 16px;">Focus on each dot for <strong>2-3 seconds</strong></span>
            </div>
            <div style="display: flex; align-items: center;">
              <span style="font-size: 24px; margin-right: 16px;">📍</span>
              <span style="font-size: 16px;">Camera should be at <strong>eye level</strong> if possible</span>
            </div>
          </div>
          <div class="countdown" style="font-size: 48px; font-weight: 700; color: #60a5fa;">
            Starting in 3...
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const countdownEl = overlay.querySelector('.countdown') as HTMLDivElement;
      let countdown = 3;

      const timer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
          countdownEl.textContent = `Starting in ${countdown}...`;
        } else {
          clearInterval(timer);
          overlay.remove();
          resolve();
        }
      }, 1000);
    });
  }

  /**
   * Run main calibration UI
   */
  private async runMainCalibration(
    onGazeCapture: (point: { x: number; y: number }) => Promise<{ x: number; y: number }>
  ): Promise<void> {
    return new Promise((resolve) => {
      const overlay = this.createCalibrationOverlay();
      document.body.appendChild(overlay);

      const points = this.generateCalibrationGrid();
      let currentIndex = 0;

      const showNextPoint = async () => {
        if (currentIndex >= points.length) {
          // Show completion animation
          await this.showCompletionAnimation(overlay);
          overlay.remove();
          resolve();
          return;
        }

        const targetPoint = points[currentIndex];
        const dot = overlay.querySelector('.calibration-dot') as HTMLDivElement;
        const ring = overlay.querySelector('.calibration-ring') as HTMLDivElement;
        const progress = overlay.querySelector('.calibration-progress') as HTMLDivElement;
        const instruction = overlay.querySelector('.calibration-instruction') as HTMLDivElement;
        const headIndicator = overlay.querySelector('.head-indicator') as HTMLDivElement;

        // Position dot
        dot.style.left = `${targetPoint.x}px`;
        dot.style.top = `${targetPoint.y}px`;
        ring.style.left = `${targetPoint.x}px`;
        ring.style.top = `${targetPoint.y}px`;

        // Update progress
        progress.textContent = `${currentIndex + 1} / ${points.length}`;
        instruction.textContent = 'Look at the red dot';

        // Reset ring animation
        ring.style.animation = 'none';
        ring.offsetHeight; // Trigger reflow
        ring.style.animation = `shrink ${this.DWELL_TIME}ms linear forwards`;

        // Monitor head movement
        const initialHeadPose = this.currentHeadPose ? { ...this.currentHeadPose } : null;

        const headCheckInterval = setInterval(() => {
          if (this.currentHeadPose && initialHeadPose) {
            const movement = Math.sqrt(
              Math.pow(this.currentHeadPose.yaw - initialHeadPose.yaw, 2) +
              Math.pow(this.currentHeadPose.pitch - initialHeadPose.pitch, 2)
            );

            if (movement > this.MAX_HEAD_MOVEMENT) {
              headIndicator.textContent = '⚠️ Keep head still!';
              headIndicator.style.color = '#f87171';
            } else {
              headIndicator.textContent = '✓ Head position OK';
              headIndicator.style.color = '#4ade80';
            }
          }
        }, 100);

        // Wait and collect samples
        setTimeout(async () => {
          clearInterval(headCheckInterval);

          // Show collecting state
          dot.style.background = '#60a5fa';
          instruction.textContent = 'Collecting data...';

          await onGazeCapture(targetPoint);

          // Show success
          dot.style.background = '#4ade80';

          setTimeout(() => {
            dot.style.background = '#ef4444';
            currentIndex++;
            showNextPoint();
          }, 200);
        }, this.DWELL_TIME);
      };

      // Start with small delay
      setTimeout(showNextPoint, 500);
    });
  }

  /**
   * Show completion animation
   */
  private async showCompletionAnimation(overlay: HTMLDivElement): Promise<void> {
    return new Promise((resolve) => {
      const content = overlay.querySelector('.calibration-content');
      if (content) {
        content.innerHTML = `
          <div style="text-align: center;">
            <div style="font-size: 72px; margin-bottom: 24px; animation: bounce 0.5s ease;">✅</div>
            <h2 style="font-size: 28px; margin-bottom: 16px;">Calibration Complete!</h2>
            <p style="font-size: 16px; opacity: 0.8;">Processing data...</p>
          </div>
        `;
      }
      setTimeout(resolve, 1000);
    });
  }

  /**
   * Create calibration overlay with improved UI
   */
  private createCalibrationOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.95);
      z-index: 99999999;
      font-family: system-ui, -apple-system, sans-serif;
    `;

    overlay.innerHTML = `
      <style>
        @keyframes pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.8; }
        }
        @keyframes shrink {
          0% { transform: translate(-50%, -50%) scale(3); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }
        @keyframes bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
      </style>

      <div class="calibration-content" style="color: white;">
        <!-- Top bar with progress -->
        <div style="
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          text-align: center;
          z-index: 10;
        ">
          <div style="
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 30px;
            padding: 12px 24px;
            display: inline-flex;
            align-items: center;
            gap: 16px;
          ">
            <span class="calibration-instruction" style="font-size: 16px; font-weight: 500;">
              Look at the red dot
            </span>
            <span style="width: 1px; height: 20px; background: rgba(255,255,255,0.2);"></span>
            <span class="calibration-progress" style="font-size: 14px; opacity: 0.8;">
              0 / 9
            </span>
          </div>
        </div>

        <!-- Head movement indicator -->
        <div class="head-indicator" style="
          position: fixed;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 14px;
          color: #4ade80;
          background: rgba(0,0,0,0.5);
          padding: 8px 16px;
          border-radius: 20px;
        ">
          ✓ Head position OK
        </div>

        <!-- Calibration ring (shrinking indicator) -->
        <div class="calibration-ring" style="
          position: fixed;
          width: 60px;
          height: 60px;
          border: 3px solid rgba(239, 68, 68, 0.5);
          border-radius: 50%;
          pointer-events: none;
          transform: translate(-50%, -50%) scale(3);
          z-index: 999999998;
        "></div>

        <!-- Calibration dot -->
        <div class="calibration-dot" style="
          position: fixed;
          width: 24px;
          height: 24px;
          background: #ef4444;
          border: 3px solid white;
          border-radius: 50%;
          animation: pulse 1s ease-in-out infinite;
          box-shadow: 0 0 30px rgba(239, 68, 68, 0.8), 0 0 60px rgba(239, 68, 68, 0.4);
          z-index: 999999999;
          transform: translate(-50%, -50%);
          transition: background 0.2s ease;
        "></div>
      </div>
    `;

    return overlay;
  }

  /**
   * Run validation after calibration
   */
  async runValidation(
    onGazeCapture: (point: { x: number; y: number }) => Promise<{ x: number; y: number }>
  ): Promise<{ success: boolean; avgError: number }> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.95);
        z-index: 99999999;
        font-family: system-ui, -apple-system, sans-serif;
        color: white;
      `;

      overlay.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          text-align: center;
        ">
          <div style="
            background: rgba(96, 165, 250, 0.2);
            border: 1px solid #60a5fa;
            border-radius: 30px;
            padding: 12px 24px;
          ">
            <span style="font-size: 16px;">🔍 Validation - Look at each blue dot</span>
          </div>
        </div>

        <div class="validation-dot" style="
          position: fixed;
          width: 20px;
          height: 20px;
          background: #60a5fa;
          border: 2px solid white;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          z-index: 999999999;
        "></div>

        <div class="validation-result" style="
          position: fixed;
          width: 12px;
          height: 12px;
          background: #f87171;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          z-index: 999999998;
          opacity: 0;
          transition: opacity 0.3s;
        "></div>
      `;

      document.body.appendChild(overlay);

      // Validation points (different from calibration)
      const validationPoints = [
        { x: window.innerWidth * 0.3, y: window.innerHeight * 0.3 },
        { x: window.innerWidth * 0.7, y: window.innerHeight * 0.3 },
        { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 },
        { x: window.innerWidth * 0.3, y: window.innerHeight * 0.7 },
        { x: window.innerWidth * 0.7, y: window.innerHeight * 0.7 }
      ];

      let currentIndex = 0;
      const errors: number[] = [];

      const showNextPoint = async () => {
        if (currentIndex >= validationPoints.length) {
          const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;

          // Show result
          overlay.innerHTML = `
            <div style="
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100%;
            ">
              <div style="font-size: 64px; margin-bottom: 24px;">
                ${avgError < 50 ? '✅' : avgError < 100 ? '⚠️' : '❌'}
              </div>
              <h2 style="font-size: 28px; margin-bottom: 16px;">
                ${avgError < 50 ? 'Excellent!' : avgError < 100 ? 'Good' : 'Needs Improvement'}
              </h2>
              <p style="font-size: 18px; opacity: 0.8;">
                Average error: ${avgError.toFixed(0)}px
              </p>
            </div>
          `;

          setTimeout(() => {
            overlay.remove();
            resolve({ success: avgError < 100, avgError });
          }, 2000);
          return;
        }

        const point = validationPoints[currentIndex];
        const dot = overlay.querySelector('.validation-dot') as HTMLDivElement;
        const result = overlay.querySelector('.validation-result') as HTMLDivElement;

        dot.style.left = `${point.x}px`;
        dot.style.top = `${point.y}px`;
        result.style.opacity = '0';

        setTimeout(async () => {
          const measured = await onGazeCapture(point);

          // Show where we measured
          result.style.left = `${measured.x}px`;
          result.style.top = `${measured.y}px`;
          result.style.opacity = '1';

          // Calculate error
          const error = Math.sqrt(
            Math.pow(measured.x - point.x, 2) +
            Math.pow(measured.y - point.y, 2)
          );
          errors.push(error);

          setTimeout(() => {
            currentIndex++;
            showNextPoint();
          }, 500);
        }, 1500);
      };

      setTimeout(showNextPoint, 500);
    });
  }
}
