/**
 * Download MediaPipe WASM files and model
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIBS_DIR = path.join(__dirname, '..', 'public', 'libs', 'mediapipe');
const WASM_DIR = path.join(LIBS_DIR, 'wasm');

// Files to download
const FILES = {
  // WASM files
  'wasm/vision_wasm_internal.js': 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_internal.js',
  'wasm/vision_wasm_internal.wasm': 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_internal.wasm',
  'wasm/vision_wasm_nosimd_internal.js': 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_nosimd_internal.js',
  'wasm/vision_wasm_nosimd_internal.wasm': 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_nosimd_internal.wasm',

  // Model file
  'face_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
};

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`📥 Downloading: ${url}`);

    const file = fs.createWriteStream(destPath);

    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect
        return downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`✅ Downloaded: ${path.basename(destPath)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('🚀 Downloading MediaPipe files...\n');

  // Create directories
  if (!fs.existsSync(LIBS_DIR)) {
    fs.mkdirSync(LIBS_DIR, { recursive: true });
  }
  if (!fs.existsSync(WASM_DIR)) {
    fs.mkdirSync(WASM_DIR, { recursive: true });
  }

  // Download files
  for (const [relativePath, url] of Object.entries(FILES)) {
    const destPath = path.join(LIBS_DIR, relativePath);

    try {
      await downloadFile(url, destPath);
    } catch (error) {
      console.error(`❌ Failed to download ${relativePath}:`, error.message);
      process.exit(1);
    }
  }

  console.log('\n✅ All MediaPipe files downloaded successfully!');
  console.log(`📁 Location: ${LIBS_DIR}`);
}

main();
