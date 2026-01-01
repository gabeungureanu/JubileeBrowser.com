/**
 * Copy static assets to dist folder
 */

const fs = require('fs');
const path = require('path');

const srcRenderer = path.join(__dirname, '../src/renderer');
const distRenderer = path.join(__dirname, '../dist/renderer');

// Ensure dist/renderer exists
if (!fs.existsSync(distRenderer)) {
  fs.mkdirSync(distRenderer, { recursive: true });
}

// Copy HTML
fs.copyFileSync(
  path.join(srcRenderer, 'index.html'),
  path.join(distRenderer, 'index.html')
);

// Copy CSS
fs.copyFileSync(
  path.join(srcRenderer, 'styles.css'),
  path.join(distRenderer, 'styles.css')
);

// Copy home page
fs.copyFileSync(
  path.join(srcRenderer, 'home.html'),
  path.join(distRenderer, 'home.html')
);

// Copy profile image
fs.copyFileSync(
  path.join(__dirname, '../src/jubilee.png'),
  path.join(distRenderer, 'jubilee.png')
);

// Copy canonical logo image for favicon and app logo
// Source: website/images/jubilee-logo.png
fs.copyFileSync(
  path.join(__dirname, '../website/images/jubilee-logo.png'),
  path.join(distRenderer, 'jubilee-logo.png')
);

console.log('Assets copied to dist/renderer/');
