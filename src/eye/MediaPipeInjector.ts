/**
 * MediaPipe Injector for Chrome Extension
 *
 * Injects MediaPipe into page context to bypass CSP restrictions
 */

export class MediaPipeInjector {
  private static isInjected = false;

  /**
   * Inject MediaPipe scripts into page context
   */
  static async inject(): Promise<void> {
    if (this.isInjected) {
      console.log('[MediaPipe Injector] Already injected');
      return;
    }

    console.log('[MediaPipe Injector] Injecting MediaPipe...');

    return new Promise((resolve, reject) => {
      // Listen for ready/error messages
      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'MEDIAPIPE_READY') {
          console.log('[MediaPipe Injector] ✅ Ready in page context');
          window.removeEventListener('message', messageHandler);
          this.isInjected = true;
          resolve();
        } else if (event.data?.type === 'MEDIAPIPE_ERROR') {
          console.error('[MediaPipe Injector] Error:', event.data.error);
          window.removeEventListener('message', messageHandler);
          reject(new Error(event.data.error));
        }
      };

      window.addEventListener('message', messageHandler);

      // Create script element pointing to external file
      const script = document.createElement('script');
      script.type = 'module';
      script.src = chrome.runtime.getURL('libs/mediapipe-loader.js');

      script.onerror = (err) => {
        console.error('[MediaPipe Injector] Failed to load script:', err);
        window.removeEventListener('message', messageHandler);
        reject(new Error('Failed to load MediaPipe loader script'));
      };

      // Inject into page
      (document.head || document.documentElement).appendChild(script);

      // Timeout fallback
      setTimeout(() => {
        if (!this.isInjected) {
          window.removeEventListener('message', messageHandler);
          reject(new Error('MediaPipe injection timeout'));
        }
      }, 15000); // Increased timeout for CDN download
    });
  }

  /**
   * Check if MediaPipe is available in page context
   */
  static isAvailable(): boolean {
    return !!(window as any).MediaPipeVision?.ready;
  }

  /**
   * Get MediaPipe from page context
   */
  static getMediaPipe(): any {
    const mp = (window as any).MediaPipeVision;
    if (!mp || !mp.ready) {
      throw new Error('MediaPipe not available. Call inject() first.');
    }
    return mp;
  }
}
