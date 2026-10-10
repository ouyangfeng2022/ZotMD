// Regenerates the plugin icons (addon/content/icons/favicon*.png) from the
// inline SVG below. The template's stock icon is the zotero-pdf-translate one,
// so this exists to keep ZotMD's icon reproducible.
//
// Usage, from this directory:
//   npm init -y && npm install sharp
//   node make-icon.js
//   cp favicon.png ../addon/content/icons/favicon.png
//   cp "favicon@0.5x.png" "../addon/content/icons/favicon@0.5x.png"
const sharp = require("sharp");

// ZotMD icon: a white Markdown mark (M + down arrow) on a blue rounded
// square — reads clearly down to the 16px menu size.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="22" fill="#2563EB"/>
  <path d="M22 62 V36 L35 53 L48 36 V62"
        fill="none" stroke="#FFFFFF" stroke-width="8.5"
        stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M67 37 V49"
        fill="none" stroke="#FFFFFF" stroke-width="8.5"
        stroke-linecap="round"/>
  <path d="M56 50 L78 50 L67 63 Z" fill="#FFFFFF"/>
</svg>`;

async function render(size, outFile) {
  // Render at 3x then downscale for clean anti-aliasing.
  const big = await sharp(Buffer.from(svg), { density: 216 })
    .resize(288, 288)
    .png()
    .toBuffer();
  await sharp(big).resize(size, size).png().toFile(outFile);
  const meta = await sharp(outFile).metadata();
  console.log(outFile, meta.width + "x" + meta.height, meta.format);
}

(async () => {
  await render(96, "favicon.png");
  await render(48, "favicon@0.5x.png");
})();
