/**
 * SIMPLE 9-Point Calibration System
 *
 * Just shows dots, collects data, done.
 */

export class CalibrationSystem {
  /**
   * Generate 9-point calibration grid (3x3)
   */
  generateCalibrationGrid(): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    const width = window.innerWidth;
    const height = window.innerHeight;

    const positions = [
      // 3x3 grid
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
   * Run calibration UI
   */
  async runCalibration(
    onGazeCapture: (point: { x: number; y: number }) => Promise<{ x: number; y: number }>
  ): Promise<void> {
    return new Promise((resolve) => {
      const overlay = this.createOverlay();
      document.body.appendChild(overlay);

      const points = this.generateCalibrationGrid();
      let currentIndex = 0;

      const showNextPoint = async () => {
        if (currentIndex >= points.length) {
          overlay.remove();
          resolve();
          return;
        }

        const targetPoint = points[currentIndex];
        const dot = overlay.querySelector('.calibration-dot') as HTMLDivElement;
        const progress = overlay.querySelector('.calibration-progress') as HTMLDivElement;

        dot.style.left = `${targetPoint.x}px`;
        dot.style.top = `${targetPoint.y}px`;
        progress.textContent = `${currentIndex + 1} / ${points.length}`;

        // Wait for user to look at dot
        setTimeout(async () => {
          await onGazeCapture(targetPoint);
          currentIndex++;
          showNextPoint();
        }, 1000); // 1 second dwell time
      };

      showNextPoint();
    });
  }

  /**
   * Create calibration overlay
   */
  private createOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.9);
      z-index: 99999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, sans-serif;
    `;

    overlay.innerHTML = `
      <style>
        @keyframes pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.5); }
        }
      </style>

      <div style="color: white; text-align: center;">
        <h2 style="font-size: 28px; margin-bottom: 20px;">Eye Tracking Calibration</h2>
        <p style="font-size: 16px; opacity: 0.8;">Look at each red dot until it disappears</p>
        <div class="calibration-progress" style="margin-top: 20px; font-size: 14px; opacity: 0.6;">0 / 9</div>
      </div>

      <div class="calibration-dot" style="
        position: fixed;
        width: 20px;
        height: 20px;
        background: #ef4444;
        border: 3px solid white;
        border-radius: 50%;
        animation: pulse 0.8s ease-in-out infinite;
        box-shadow: 0 0 30px rgba(239, 68, 68, 0.8);
        z-index: 999999999;
        transform: translate(-50%, -50%);
      "></div>
    `;

    return overlay;
  }
}
