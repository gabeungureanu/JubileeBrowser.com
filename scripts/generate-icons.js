/**
 * Icon Generation Script
 * Generates platform-specific icons from the canonical source image
 *
 * Usage: node scripts/generate-icons.js
 *
 * Source: website/images/jubilee-logo.png (CANONICAL SOURCE - edit this file for icon changes)
 *
 * Output locations:
 *   assets/icons/     - Runtime icons for development
 *   build/            - Packaging icons for electron-builder (Windows installer/EXE)
 *
 * Generated files:
 *   - icon.ico (Windows - multi-resolution: 16, 24, 32, 48, 64, 128, 256)
 *   - icon.png (High-res PNG for Linux/general use)
 *   - 512x512.png (Linux)
 *   - icon-256.png (Windows large icon)
 *
 * IMPORTANT: electron-builder requires icons in build/ directory for:
 *   - Windows EXE icon
 *   - Installer icon
 *   - Start Menu shortcuts
 *   - Taskbar icon
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SOURCE_IMAGE = path.join(__dirname, '..', 'website', 'images', 'jubilee-logo.png');
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'icons');
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const BUILD_DIR = path.join(__dirname, '..', 'build'); // electron-builder resources directory

// ICO sizes required for Windows
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * Create a proper Windows ICO file from multiple PNG buffers
 * ICO format: https://en.wikipedia.org/wiki/ICO_(file_format)
 */
function createIcoFromPngs(pngBuffers) {
  // ICO Header (6 bytes)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // Reserved, must be 0
  header.writeUInt16LE(1, 2);      // Image type: 1 = ICO
  header.writeUInt16LE(pngBuffers.length, 4); // Number of images

  // Calculate directory entries and image data offsets
  const dirEntrySize = 16;
  let dataOffset = 6 + (pngBuffers.length * dirEntrySize);

  const dirEntries = [];
  const imageDataArray = [];

  for (const { size, buffer } of pngBuffers) {
    // Directory entry (16 bytes per image)
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);  // Width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1);  // Height (0 = 256)
    entry.writeUInt8(0, 2);                        // Color palette (0 = no palette)
    entry.writeUInt8(0, 3);                        // Reserved
    entry.writeUInt16LE(1, 4);                     // Color planes
    entry.writeUInt16LE(32, 6);                    // Bits per pixel
    entry.writeUInt32LE(buffer.length, 8);         // Size of image data
    entry.writeUInt32LE(dataOffset, 12);           // Offset to image data

    dirEntries.push(entry);
    imageDataArray.push(buffer);
    dataOffset += buffer.length;
  }

  // Combine all parts
  return Buffer.concat([header, ...dirEntries, ...imageDataArray]);
}

async function generateIcons() {
  console.log('Generating icons from:', SOURCE_IMAGE);

  // Verify source exists
  if (!fs.existsSync(SOURCE_IMAGE)) {
    console.error('ERROR: Source image not found at', SOURCE_IMAGE);
    process.exit(1);
  }

  // Ensure output directories exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Copy source as high-res PNG
  const highResPng = path.join(OUTPUT_DIR, 'icon.png');
  fs.copyFileSync(SOURCE_IMAGE, highResPng);
  console.log('Created:', highResPng);

  // Generate 512x512 PNG for Linux
  const linux512 = path.join(OUTPUT_DIR, '512x512.png');
  await sharp(SOURCE_IMAGE)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(linux512);
  console.log('Created:', linux512);

  // Copy to root assets folder for backward compatibility
  const assetsIcon = path.join(ASSETS_DIR, 'icon.png');
  fs.copyFileSync(SOURCE_IMAGE, assetsIcon);
  console.log('Updated:', assetsIcon);

  // Generate individual PNG sizes for ICO
  console.log('Generating PNG sizes for ICO...');
  const pngBuffers = [];
  for (const size of ICO_SIZES) {
    const buffer = await sharp(SOURCE_IMAGE)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer });
    console.log(`  Generated ${size}x${size} PNG`);
  }

  // Generate 256x256 PNG separately
  const ico256Path = path.join(OUTPUT_DIR, 'icon-256.png');
  await sharp(SOURCE_IMAGE)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(ico256Path);
  console.log('Created:', ico256Path);

  // Generate proper ICO file
  console.log('Generating ICO file...');
  const icoBuffer = createIcoFromPngs(pngBuffers);
  const icoPath = path.join(OUTPUT_DIR, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('Created:', icoPath, `(${Math.round(icoBuffer.length / 1024)}KB)`);

  // Also copy to root assets folder for backward compatibility
  const assetsIco = path.join(ASSETS_DIR, 'icon.ico');
  fs.writeFileSync(assetsIco, icoBuffer);
  console.log('Updated:', assetsIco);

  // ========================================
  // Copy to build/ directory for electron-builder
  // This is CRITICAL for Windows packaging
  // ========================================
  console.log('\nCopying to build/ directory for electron-builder...');

  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }

  // Copy ICO to build/ (required by electron-builder for Windows EXE)
  const buildIco = path.join(BUILD_DIR, 'icon.ico');
  fs.writeFileSync(buildIco, icoBuffer);
  console.log('Created:', buildIco);

  // Copy PNG to build/ (used by electron-builder as fallback)
  const buildPng = path.join(BUILD_DIR, 'icon.png');
  fs.copyFileSync(SOURCE_IMAGE, buildPng);
  console.log('Created:', buildPng);

  // Create 256x256 PNG in build/ (Windows large icon)
  const build256 = path.join(BUILD_DIR, 'icon-256.png');
  await sharp(SOURCE_IMAGE)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(build256);
  console.log('Created:', build256);

  console.log('\nIcon generation complete!');
  console.log('\n=== Generated files ===');

  console.log('\nassets/icons/ (runtime icons):');
  fs.readdirSync(OUTPUT_DIR).forEach(file => {
    const stats = fs.statSync(path.join(OUTPUT_DIR, file));
    console.log(`  ${file} (${Math.round(stats.size / 1024)}KB)`);
  });

  console.log('\nbuild/ (electron-builder packaging):');
  const buildFiles = fs.readdirSync(BUILD_DIR).filter(f => f.startsWith('icon'));
  buildFiles.forEach(file => {
    const stats = fs.statSync(path.join(BUILD_DIR, file));
    console.log(`  ${file} (${Math.round(stats.size / 1024)}KB)`);
  });

  console.log('\n=== Icon paths for configuration ===');
  console.log('AppUserModelID: com.jubileebrowser.jubilee');
  console.log('electron-builder icon: build/icon (auto-resolves .ico/.png)');
  console.log('Runtime icon (Windows): assets/icons/icon.ico');
  console.log('Runtime icon (Other): assets/icons/icon.png');
}

generateIcons().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
