// Content script for ReaRead extension
// Handles eye tracking, text analysis, and UI updates on web pages

// State
interface GazeData {
  x: number;
  y: number;
  timestamp: number;
  fixations: Array<{
    x: number;
    y: number;
    startTime: number;
    duration: number;
  }>;
}

interface TextElement {
  element: HTMLElement;
  text: string;
  rect: DOMRect;
  complexity: number;
  id: string;
}

class ReaReadContent {
  private isActive: boolean = false;
  private gazeData: GazeData = { x: 0, y: 0, timestamp: 0, fixations: [] };
  private textElements: TextElement[] = [];
  private settings = {
    showGazeCursor: true,
    showFixations: true,
    highlightDifficultText: true,
  };
  private gazeCursor: HTMLElement | null = null;
  private lastProcessedTime: number = 0;
  private processingInterval: number = 100; // ms

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Create UI elements
    this.createGazeCursor();
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    
    // Set up mutation observer to detect DOM changes
    this.setupMutationObserver();
    
    console.log('ReaRead content script initialized');
  }

  private createGazeCursor() {
    if (this.gazeCursor) return;
    
    this.gazeCursor = document.createElement('div');
    this.gazeCursor.style.position = 'fixed';
    this.gazeCursor.style.width = '20px';
    this.gazeCursor.style.height = '20px';
    this.gazeCursor.style.borderRadius = '50%';
    this.gazeCursor.style.background = 'rgba(79, 70, 229, 0.5)';
    this.gazeCursor.style.pointerEvents = 'none';
    this.gazeCursor.style.transform = 'translate(-50%, -50%)';
    this.gazeCursor.style.zIndex = '999999';
    this.gazeCursor.style.transition = 'transform 0.1s ease-out';
    this.gazeCursor.style.display = 'none';
    
    document.body.appendChild(this.gazeCursor);
  }

  private setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      if (this.isActive) {
        this.analyzePageText();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  private async analyzePageText() {
    // Extract all text nodes from the page
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      { acceptNode: () => NodeFilter.FILTER_ACCEPT }
    );

    const textNodes: Node[] = [];
    let node: Node | null;
    
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.trim().length > 0) {
        textNodes.push(node);
      }
    }

    // Group text nodes by their parent elements
    const elementMap = new Map<HTMLElement, string[]>();
    
    for (const node of textNodes) {
      if (!node.parentElement) continue;
      
      const text = node.nodeValue?.trim() || '';
      if (text.length === 0) continue;
      
      const parent = this.findSuitableParent(node.parentElement);
      
      if (elementMap.has(parent)) {
        elementMap.get(parent)?.push(text);
      } else {
        elementMap.set(parent, [text]);
      }
    }

    // Process each text element
    this.textElements = [];
    
    for (const [element, texts] of elementMap.entries()) {
      const combinedText = texts.join(' ');
      const rect = element.getBoundingClientRect();
      
      // Skip elements that are not visible or too small
      if (rect.width < 10 || rect.height < 10 || this.isElementHidden(element)) {
        continue;
      }
      
      // Calculate text complexity (simplified for now)
      const complexity = this.calculateTextComplexity(combinedText);
      
      this.textElements.push({
        element,
        text: combinedText,
        rect,
        complexity,
        id: `rearead-text-${this.textElements.length}`,
      });
    }
    
    console.log(`Analyzed ${this.textElements.length} text elements`);
  }

  private findSuitableParent(element: HTMLElement): HTMLElement {
    // Find the nearest block-level element
    const blockElements = [
      'P', 'DIV', 'ARTICLE', 'SECTION', 'MAIN', 'ASIDE', 'HEADER', 'FOOTER',
      'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'FIGURE', 'FIGCAPTION'
    ];
    
    let current: HTMLElement | null = element;
    
    while (current && !blockElements.includes(current.tagName)) {
      if (!current.parentElement) break;
      current = current.parentElement;
    }
    
    return current || element;
  }

  private isElementHidden(element: HTMLElement): boolean {
    if (element.hidden || !element.offsetParent) return true;
    
    const style = window.getComputedStyle(element);
    return (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      element.getAttribute('aria-hidden') === 'true'
    );
  }

  private calculateTextComplexity(text: string): number {
    // Simple complexity calculation based on word length and special characters
    const words = text.split(/\s+/).filter(word => word.length > 0);
    if (words.length === 0) return 0;
    
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    const specialChars = text.replace(/[\w\s]/g, '').length;
    const specialCharRatio = specialChars / Math.max(1, text.length);
    
    // Normalize to 0-1 range
    return Math.min(1, (avgWordLength / 10) * 0.6 + specialCharRatio * 0.4);
  }

  private updateGazeCursor(x: number, y: number) {
    if (!this.gazeCursor || !this.settings.showGazeCursor) return;
    
    this.gazeCursor.style.display = 'block';
    this.gazeCursor.style.left = `${x}px`;
    this.gazeCursor.style.top = `${y}px`;
    
    // Update fixation data
    const now = Date.now();
    const lastFixation = this.gazeData.fixations[this.gazeData.fixations.length - 1];
    
    if (lastFixation && this.isNearby(x, y, lastFixation.x, lastFixation.y, 20)) {
      // Update existing fixation
      lastFixation.duration = now - lastFixation.startTime;
    } else {
      // Add new fixation
      this.gazeData.fixations.push({
        x,
        y,
        startTime: now,
        duration: 0,
      });
      
      // Keep only recent fixations
      if (this.gazeData.fixations.length > 100) {
        this.gazeData.fixations.shift();
      }
    }
    
    // Update gaze data
    this.gazeData = {
      ...this.gazeData,
      x,
      y,
      timestamp: now,
    };
    
    // Process gaze data at a controlled rate
    if (now - this.lastProcessedTime > this.processingInterval) {
      this.processGazeData();
      this.lastProcessedTime = now;
    }
  }

  private isNearby(x1: number, y1: number, x2: number, y2: number, threshold: number): boolean {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy) <= threshold;
  }

  private processGazeData() {
    if (!this.isActive) return;
    
    // Send gaze data to background script
    chrome.runtime.sendMessage({
      type: 'GAZE_DATA',
      data: this.gazeData,
    });
    
    // Check for text under gaze
    const element = document.elementFromPoint(
      this.gazeData.x + window.scrollX,
      this.gazeData.y + window.scrollY
    ) as HTMLElement;
    
    if (element) {
      // Find the nearest text element
      const textElement = this.findNearestTextElement(element);
      
      if (textElement) {
        // Highlight the text being looked at
        this.highlightText(textElement);
      }
    }
  }

  private findNearestTextElement(element: HTMLElement): TextElement | null {
    let current: HTMLElement | null = element;
    
    while (current) {
      const textEl = this.textElements.find(el => el.element === current);
      if (textEl) return textEl;
      
      if (!current.parentElement) break;
      current = current.parentElement;
    }
    
    return null;
  }

  private highlightText(textElement: TextElement) {
    // Simple highlight effect
    const highlightClass = 'rearead-highlight';
    
    // Remove previous highlights
    document.querySelectorAll(`.${highlightClass}`).forEach(el => {
      el.classList.remove(highlightClass);
    });
    
    // Add highlight to current element
    textElement.element.classList.add(highlightClass);
    
    // Scroll the element into view if needed
    textElement.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  private handleMessage(message: any, sender: any, sendResponse: (response?: any) => void) {
    switch (message.type) {
      case 'START_TRACKING':
        this.isActive = true;
        this.gazeCursor?.style.setProperty('display', 'block');
        this.analyzePageText();
        console.log('ReaRead: Tracking started');
        break;
        
      case 'STOP_TRACKING':
        this.isActive = false;
        this.gazeCursor?.style.setProperty('display', 'none');
        console.log('ReaRead: Tracking stopped');
        break;
        
      case 'UPDATE_GAZE_VISUALIZATION':
        if (message.data) {
          this.updateGazeCursor(message.data.x, message.data.y);
        }
        break;
        
      case 'UPDATE_SETTINGS':
        if (message.settings) {
          this.settings = { ...this.settings, ...message.settings };
        }
        break;
    }
    
    return true; // Required for async sendResponse
  }

  // Simulate gaze data for testing (will be replaced with actual eye tracking)
  private simulateGaze() {
    if (!this.isActive) return;
    
    const x = Math.random() * window.innerWidth;
    const y = Math.random() * window.innerHeight;
    
    this.updateGazeCursor(x, y);
    
    // Schedule next update
    setTimeout(() => this.simulateGaze(), 100);
  }
}

// Initialize the content script
const reaRead = new ReaReadContent();

// For testing
if (import.meta.env.DEV) {
  // @ts-ignore
  window.reaRead = reaRead;
}
