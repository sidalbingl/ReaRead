// Content script for ReaRead extension

let stream: MediaStream | null = null;
let overlayRoot: HTMLDivElement | null = null;
let statusBadge: HTMLDivElement | null = null;
let videoEl: HTMLVideoElement | null = null;
let isActive = false;

function ensureOverlay() {
  if (!overlayRoot) {
    overlayRoot = document.createElement("div");
    overlayRoot.id = "rearead-overlay";
    overlayRoot.style.position = "fixed";
    overlayRoot.style.top = "10px";
    overlayRoot.style.right = "10px";
    overlayRoot.style.zIndex = "999999";
    overlayRoot.style.pointerEvents = "none";
    overlayRoot.style.display = "flex";
    overlayRoot.style.flexDirection = "column";
    overlayRoot.style.gap = "8px";
    document.documentElement.appendChild(overlayRoot);
  }
  
  if (!statusBadge) {
    statusBadge = document.createElement("div");
    statusBadge.style.fontFamily = "system-ui, sans-serif";
    statusBadge.style.fontSize = "12px";
    statusBadge.style.color = "#fff";
    statusBadge.style.padding = "6px 10px";
    statusBadge.style.borderRadius = "999px";
    statusBadge.style.boxShadow = "0 2px 8px rgba(0,0,0,.2)";
    statusBadge.style.fontWeight = "500";
    overlayRoot.appendChild(statusBadge);
  }
  
  if (!videoEl) {
    videoEl = document.createElement("video");
    videoEl.autoplay = true;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.style.width = "160px";
    videoEl.style.height = "120px";
    videoEl.style.objectFit = "cover";
    videoEl.style.borderRadius = "12px";
    videoEl.style.boxShadow = "0 6px 18px rgba(0,0,0,.25)";
    videoEl.style.pointerEvents = "none";
    overlayRoot.appendChild(videoEl);
  }
}

async function startCamera() {
  if (isActive) return;
  try {
    ensureOverlay();
    console.log("[ReaRead] Requesting camera access...");

    const constraints = { video: { facingMode: "user" } };
    const streamTemp = await navigator.mediaDevices.getUserMedia(constraints);
    console.log("[ReaRead] getUserMedia() returned:", streamTemp);

    if (!streamTemp) {
      console.error("[ReaRead] getUserMedia returned null/undefined!");
      return;
    }

    stream = streamTemp;
    isActive = true;

    // DOM’a eklendiğinden emin ol
    requestAnimationFrame(async () => {
      const videoEl = document.querySelector('video');
      if (videoEl) {
        videoEl.srcObject = stream;
        try {
          await videoEl.play();
          console.log("[ReaRead] Video element play triggered, state:", videoEl.readyState);
        } catch (err) {
          console.error("[ReaRead] video.play() error:", err);
        }
      } else {
        console.warn("[ReaRead] Video element not found in DOM.");
      }
    });

    statusBadge!.textContent = "ReaRead • Tracking ON";
    statusBadge!.style.background = "rgba(16,185,129,.95)";
    console.log("[ReaRead] Camera started successfully.");
  } catch (err) {
    console.error("[ReaRead] getUserMedia error:", err);
    ensureOverlay();
    statusBadge!.textContent = "ReaRead • Camera Error";
    statusBadge!.style.background = "rgba(239,68,68,.95)";
  }
}


function stopCamera() {
  if (!isActive) {
    console.log("[ReaRead] Camera already inactive, skipping stop");
    return;
  }
  
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  
  isActive = false;
  ensureOverlay();
  statusBadge!.textContent = "ReaRead • Tracking OFF";
  statusBadge!.style.background = "rgba(107,114,128,.95)";
  
  if (videoEl) {
    videoEl.srcObject = null;
  }
  
  console.log("[ReaRead] ✅ Camera stopped");
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (isActive) {
    stopCamera();
  }
});

// Message listener
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log("[ReaRead] Message received:", msg?.type);
  
  if (msg?.type === "PING") {
    sendResponse?.({ pong: true });
    return true;
  }
  
  if (msg?.type === "START_TRACKING") {
    startCamera().then(() => {
      sendResponse?.({ ok: true });
    }).catch((err) => {
      console.error("[ReaRead] Start tracking error:", err);
      sendResponse?.({ ok: false, error: err.message });
    });
    return true; // Async response
  }
  
  if (msg?.type === "STOP_TRACKING") {
    stopCamera();
    sendResponse?.({ ok: true });
    return true;
  }
  
  if (msg?.type === "UPDATE_GAZE_VISUALIZATION") {
    // Gaze data visualization için hazır
    // TODO: Implement gaze visualization
    sendResponse?.({ ok: true });
    return true;
  }
  
  return false;
});

console.log("[ReaRead] 🚀 Content script loaded and ready");