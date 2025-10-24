import.meta.env = {"BASE_URL": "/", "DEV": true, "MODE": "development", "PROD": false, "SSR": false};class ReaReadContent {
  isActive = false;
  gazeData = { x: 0, y: 0, timestamp: 0, fixations: [] };
  textElements = [];
  settings = {
    showGazeCursor: true,
    showFixations: true,
    highlightDifficultText: true
  };
  gazeCursor = null;
  lastProcessedTime = 0;
  processingInterval = 100;
  // ms
  constructor() {
    this.initialize();
  }
  initialize() {
    this.createGazeCursor();
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    this.setupMutationObserver();
    console.log("ReaRead content script initialized");
  }
  createGazeCursor() {
    if (this.gazeCursor) return;
    this.gazeCursor = document.createElement("div");
    this.gazeCursor.style.position = "fixed";
    this.gazeCursor.style.width = "20px";
    this.gazeCursor.style.height = "20px";
    this.gazeCursor.style.borderRadius = "50%";
    this.gazeCursor.style.background = "rgba(79, 70, 229, 0.5)";
    this.gazeCursor.style.pointerEvents = "none";
    this.gazeCursor.style.transform = "translate(-50%, -50%)";
    this.gazeCursor.style.zIndex = "999999";
    this.gazeCursor.style.transition = "transform 0.1s ease-out";
    this.gazeCursor.style.display = "none";
    document.body.appendChild(this.gazeCursor);
  }
  setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      if (this.isActive) {
        this.analyzePageText();
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  async analyzePageText() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      { acceptNode: () => NodeFilter.FILTER_ACCEPT }
    );
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.nodeValue && node.nodeValue.trim().length > 0) {
        textNodes.push(node);
      }
    }
    const elementMap = /* @__PURE__ */ new Map();
    for (const node2 of textNodes) {
      if (!node2.parentElement) continue;
      const text = node2.nodeValue?.trim() || "";
      if (text.length === 0) continue;
      const parent = this.findSuitableParent(node2.parentElement);
      if (elementMap.has(parent)) {
        elementMap.get(parent)?.push(text);
      } else {
        elementMap.set(parent, [text]);
      }
    }
    this.textElements = [];
    for (const [element, texts] of elementMap.entries()) {
      const combinedText = texts.join(" ");
      const rect = element.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10 || this.isElementHidden(element)) {
        continue;
      }
      const complexity = this.calculateTextComplexity(combinedText);
      this.textElements.push({
        element,
        text: combinedText,
        rect,
        complexity,
        id: `rearead-text-${this.textElements.length}`
      });
    }
    console.log(`Analyzed ${this.textElements.length} text elements`);
  }
  findSuitableParent(element) {
    const blockElements = [
      "P",
      "DIV",
      "ARTICLE",
      "SECTION",
      "MAIN",
      "ASIDE",
      "HEADER",
      "FOOTER",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "LI",
      "BLOCKQUOTE",
      "FIGURE",
      "FIGCAPTION"
    ];
    let current = element;
    while (current && !blockElements.includes(current.tagName)) {
      if (!current.parentElement) break;
      current = current.parentElement;
    }
    return current || element;
  }
  isElementHidden(element) {
    if (element.hidden || !element.offsetParent) return true;
    const style = window.getComputedStyle(element);
    return style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || element.getAttribute("aria-hidden") === "true";
  }
  calculateTextComplexity(text) {
    const words = text.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) return 0;
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    const specialChars = text.replace(/[\w\s]/g, "").length;
    const specialCharRatio = specialChars / Math.max(1, text.length);
    return Math.min(1, avgWordLength / 10 * 0.6 + specialCharRatio * 0.4);
  }
  updateGazeCursor(x, y) {
    if (!this.gazeCursor || !this.settings.showGazeCursor) return;
    this.gazeCursor.style.display = "block";
    this.gazeCursor.style.left = `${x}px`;
    this.gazeCursor.style.top = `${y}px`;
    const now = Date.now();
    const lastFixation = this.gazeData.fixations[this.gazeData.fixations.length - 1];
    if (lastFixation && this.isNearby(x, y, lastFixation.x, lastFixation.y, 20)) {
      lastFixation.duration = now - lastFixation.startTime;
    } else {
      this.gazeData.fixations.push({
        x,
        y,
        startTime: now,
        duration: 0
      });
      if (this.gazeData.fixations.length > 100) {
        this.gazeData.fixations.shift();
      }
    }
    this.gazeData = {
      ...this.gazeData,
      x,
      y,
      timestamp: now
    };
    if (now - this.lastProcessedTime > this.processingInterval) {
      this.processGazeData();
      this.lastProcessedTime = now;
    }
  }
  isNearby(x1, y1, x2, y2, threshold) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy) <= threshold;
  }
  processGazeData() {
    if (!this.isActive) return;
    chrome.runtime.sendMessage({
      type: "GAZE_DATA",
      data: this.gazeData
    });
    const element = document.elementFromPoint(
      this.gazeData.x + window.scrollX,
      this.gazeData.y + window.scrollY
    );
    if (element) {
      const textElement = this.findNearestTextElement(element);
      if (textElement) {
        this.highlightText(textElement);
      }
    }
  }
  findNearestTextElement(element) {
    let current = element;
    while (current) {
      const textEl = this.textElements.find((el) => el.element === current);
      if (textEl) return textEl;
      if (!current.parentElement) break;
      current = current.parentElement;
    }
    return null;
  }
  highlightText(textElement) {
    const highlightClass = "rearead-highlight";
    document.querySelectorAll(`.${highlightClass}`).forEach((el) => {
      el.classList.remove(highlightClass);
    });
    textElement.element.classList.add(highlightClass);
    textElement.element.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case "START_TRACKING":
        this.isActive = true;
        this.gazeCursor?.style.setProperty("display", "block");
        this.analyzePageText();
        console.log("ReaRead: Tracking started");
        break;
      case "STOP_TRACKING":
        this.isActive = false;
        this.gazeCursor?.style.setProperty("display", "none");
        console.log("ReaRead: Tracking stopped");
        break;
      case "UPDATE_GAZE_VISUALIZATION":
        if (message.data) {
          this.updateGazeCursor(message.data.x, message.data.y);
        }
        break;
      case "UPDATE_SETTINGS":
        if (message.settings) {
          this.settings = { ...this.settings, ...message.settings };
        }
        break;
    }
    return true;
  }
  // Simulate gaze data for testing (will be replaced with actual eye tracking)
  simulateGaze() {
    if (!this.isActive) return;
    const x = Math.random() * window.innerWidth;
    const y = Math.random() * window.innerHeight;
    this.updateGazeCursor(x, y);
    setTimeout(() => this.simulateGaze(), 100);
  }
}
const reaRead = new ReaReadContent();
if (import.meta.env.DEV) {
  window.reaRead = reaRead;
}
