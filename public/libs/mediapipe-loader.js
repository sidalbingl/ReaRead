/**
 * MediaPipe Loader - Runs in page context
 * This file is injected as an external script to bypass CSP inline restrictions
 */

(async function() {
  try {
    console.log('[MediaPipe Loader] Loading from CDN...');

    // Dynamic import from CDN
    const { FilesetResolver, FaceLandmarker } = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14'
    );

    // Expose to window
    window.MediaPipeVision = {
      FilesetResolver,
      FaceLandmarker,
      ready: true
    };

    // Notify content script
    window.postMessage({ type: 'MEDIAPIPE_READY' }, '*');
    console.log('[MediaPipe Loader] ✅ Ready');

  } catch (error) {
    console.error('[MediaPipe Loader] Failed to load:', error);
    window.postMessage({ type: 'MEDIAPIPE_ERROR', error: error.message }, '*');
  }
})();
