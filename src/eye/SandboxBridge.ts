/**
 * SandboxBridge - Manages communication between content script and sandbox iframe
 *
 * The sandbox runs MediaPipe in a relaxed CSP environment where WASM can load properly.
 * This bridge handles message passing and video stream transfer.
 */

export interface SandboxGazeData {
  leftIris: { x: number; y: number };
  rightIris: { x: number; y: number };
  landmarks: Array<{ x: number; y: number }>;
  faceY?: number;  // Nose Y position (0-1) for vertical gaze
  timestamp: number;
}

export interface SandboxBridgeConfig {
  onGazeData?: (data: SandboxGazeData) => void;
  onReady?: () => void;
  onError?: (error: Error) => void;
  debugMode?: boolean;
}

export class SandboxBridge {
  private iframe: HTMLIFrameElement | null = null;
  private config: SandboxBridgeConfig;
  private isMediaPipeReady = false;
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private messageQueue: any[] = [];
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;

  constructor(config: SandboxBridgeConfig) {
    this.config = config;
    this.setupMessageListener();

    // Create ready promise
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  /**
   * Initialize sandbox iframe
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.log('Initializing sandbox iframe...');

        // Create iframe element
        this.iframe = document.createElement('iframe');
        this.iframe.src = chrome.runtime.getURL('sandbox.html');
        this.iframe.style.cssText = `
          position: fixed;
          top: -9999px;
          left: -9999px;
          width: 1px;
          height: 1px;
          border: none;
          opacity: 0;
          pointer-events: none;
        `;

        // Append iframe to page first
        document.documentElement.appendChild(this.iframe);
        this.log('Sandbox iframe created');

        // Wait for both sandbox and MediaPipe to be ready
        const readyTimeout = setTimeout(() => {
          reject(new Error('Sandbox initialization timeout (60s) - MediaPipe model download may be slow'));
        }, 60000); // 60 seconds for slow connections (OpenCV + MediaPipe model ~18MB)

        // This will be resolved by message listener when MediaPipe is ready
        if (this.readyPromise) {
          this.readyPromise.then(() => {
            clearTimeout(readyTimeout);
            this.log('✅ Sandbox and MediaPipe fully ready');
            resolve();
          }).catch(reject);
        }

      } catch (error) {
        this.logError('Sandbox initialization failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Wait for sandbox to be ready
   */
  async waitForReady(): Promise<void> {
    if (this.isMediaPipeReady) return;
    return this.readyPromise || Promise.resolve();
  }

  /**
   * Setup message listener for sandbox communication
   */
  private setupMessageListener(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      // Verify message is from our sandbox
      if (!this.iframe || event.source !== this.iframe.contentWindow) {
        return;
      }

      const { type, data, message, isError, success, error } = event.data;

      switch (type) {
        case 'SANDBOX_READY':
          this.log('Sandbox iframe loaded, initializing MediaPipe...');
          // Initialize MediaPipe in sandbox
          this.sendMessage({ type: 'INIT_MEDIAPIPE' });
          break;

        case 'SANDBOX_LOG':
          if (this.config.debugMode) {
            if (isError) {
              console.error('[Sandbox]', message);
            } else {
              console.log('[Sandbox]', message);
            }
          }
          break;

        case 'MEDIAPIPE_READY':
          if (success) {
            this.log('MediaPipe initialized in sandbox');
            this.isMediaPipeReady = true;

            // Resolve ready promise
            if (this.readyResolve) {
              this.readyResolve();
            }

            this.config.onReady?.();
            this.flushMessageQueue();
          } else {
            this.logError('MediaPipe initialization failed in sandbox:', error);
            this.config.onError?.(new Error(error));
          }
          break;

        case 'GAZE_DATA':
          // Don't log every gaze update (too spammy)
          if (this.config.onGazeData) {
            this.config.onGazeData(data);
          }
          break;

        default:
          if (this.config.debugMode) {
            this.log(`Unknown message from sandbox: ${type}`);
          }
      }
    });
  }

  /**
   * Set video stream for tracking
   */
  async setVideoStream(stream: MediaStream): Promise<void> {
    this.mediaStream = stream;

    // Create a video element in the main page to capture frames
    if (!this.videoElement) {
      this.videoElement = document.createElement('video');
      this.videoElement.autoplay = true;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;
      this.videoElement.style.cssText = `
        position: fixed;
        top: -9999px;
        left: -9999px;
        width: 640px;
        height: 480px;
      `;
      document.documentElement.appendChild(this.videoElement);
    }

    this.videoElement.srcObject = stream;

    // Wait for video to be ready
    await new Promise<void>((resolve) => {
      const onPlay = () => {
        this.log('Video element playing');
        resolve();
      };
      this.videoElement!.addEventListener('playing', onPlay, { once: true });
      this.videoElement!.play();
    });

    this.log('Video stream set and playing');

    // Transfer video frames to sandbox via canvas
    await this.startVideoTransfer();
  }

  /**
   * Transfer video frames to sandbox
   * Since we can't directly pass MediaStream to sandbox, we capture frames via canvas
   * and send ImageData to the sandbox for processing
   */
  private async startVideoTransfer(): Promise<void> {
    this.log('Starting video transfer to sandbox...');

    // Create canvas for frame capture
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      this.logError('Failed to get canvas context');
      return;
    }

    let framesSent = 0;

    // Send frames at ~30 FPS
    const transferFrame = () => {
      if (!this.videoElement || !this.mediaStream) {
        this.logError(`Transfer stopped: video=${!!this.videoElement}, stream=${!!this.mediaStream}`);
        return;
      }

      if (!this.isMediaPipeReady) {
        // MediaPipe not ready yet, wait and retry
        requestAnimationFrame(transferFrame);
        return;
      }

      if (this.videoElement.readyState >= 2) {
        try {
          // Draw video frame to canvas
          ctx.drawImage(this.videoElement, 0, 0, 640, 480);

          // Get image data
          const imageData = ctx.getImageData(0, 0, 640, 480);

          // Send to sandbox
          this.sendMessage({
            type: 'VIDEO_FRAME',
            data: { imageData }
          });

          framesSent++;
          if (framesSent === 1) {
            this.log('✅ First frame sent to sandbox');
          } else if (framesSent % 100 === 0) {
            this.log(`Frame transfer active (${framesSent} frames sent)`);
          }
        } catch (error) {
          this.logError('Frame transfer error:', error);
        }
      } else {
        if (framesSent === 0) {
          this.log(`Video not ready yet (readyState: ${this.videoElement.readyState})`);
        }
      }

      // Continue transferring at ~30 FPS
      requestAnimationFrame(transferFrame);
    };

    this.sendMessage({ type: 'VIDEO_READY' });
    this.log('Starting frame transfer loop...');

    // Wait a bit for video to be fully ready
    setTimeout(() => {
      this.log('Initiating frame transfer');
      transferFrame();
    }, 100);
  }

  /**
   * Start tracking
   */
  async start(): Promise<void> {
    // Wait for MediaPipe to be ready
    await this.waitForReady();

    if (!this.isMediaPipeReady) {
      this.logError('Cannot start: MediaPipe not ready');
      throw new Error('MediaPipe not ready');
    }

    this.sendMessage({ type: 'START_TRACKING' });
    this.log('Tracking started');
  }

  /**
   * Stop tracking
   */
  stop(): void {
    this.sendMessage({ type: 'STOP_TRACKING' });
    this.log('Tracking stopped');
  }

  /**
   * Send message to sandbox
   */
  private sendMessage(message: any): void {
    if (!this.iframe || !this.iframe.contentWindow) {
      if (this.config.debugMode) {
        this.log('Queueing message (iframe not ready): ' + message.type);
      }
      this.messageQueue.push(message);
      return;
    }

    // Queue messages if MediaPipe not ready (except initialization messages)
    if (!this.isMediaPipeReady &&
        message.type !== 'INIT_MEDIAPIPE' &&
        message.type !== 'VIDEO_READY' &&
        message.type !== 'VIDEO_FRAME') {
      if (this.config.debugMode) {
        this.log('Queueing message (MediaPipe not ready): ' + message.type);
      }
      this.messageQueue.push(message);
      return;
    }

    this.iframe.contentWindow.postMessage(message, '*');
  }

  /**
   * Flush queued messages
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.sendMessage(message);
    }
  }

  /**
   * Get video element for MediaPipe processing
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stop();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.videoElement) {
      this.videoElement.remove();
      this.videoElement = null;
    }

    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }

    this.log('Sandbox bridge disposed');
  }

  /**
   * Logging helpers
   */
  private log(message: string): void {
    if (this.config.debugMode) {
      console.log('[SandboxBridge]', message);
    }
  }

  private logError(message: string, error?: any): void {
    console.error('[SandboxBridge]', message, error || '');
  }
}
