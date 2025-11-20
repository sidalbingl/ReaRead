import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '..', 'dist');
const publicDir = path.join(__dirname, '..', 'public');
const iconsSourceDir = path.join(__dirname, '..', 'icons');

// Manifest'i kopyala
fs.copyFileSync(
  path.join(publicDir, 'manifest.json'),
  path.join(distDir, 'manifest.json')
);

// Sandbox.html'i kopyala
fs.copyFileSync(
  path.join(publicDir, 'sandbox.html'),
  path.join(distDir, 'sandbox.html')
);

// popup.html'i taşı
const popupSource = path.join(distDir, 'src', 'popup', 'index.html');
const popupDest = path.join(distDir, 'popup.html');

if (fs.existsSync(popupSource)) {
  fs.copyFileSync(popupSource, popupDest);
  fs.rmSync(path.join(distDir, 'src'), { recursive: true, force: true });
}

// Icons'ları kopyala
const distIconsDir = path.join(distDir, 'icons');
if (!fs.existsSync(distIconsDir)) {
  fs.mkdirSync(distIconsDir, { recursive: true });
}

['16', '48', '128'].forEach(size => {
  const iconName = `icon${size}.png`;
  fs.copyFileSync(
    path.join(iconsSourceDir, iconName),
    path.join(distIconsDir, iconName)
  );
});

console.log('✅ Build completed successfully!');