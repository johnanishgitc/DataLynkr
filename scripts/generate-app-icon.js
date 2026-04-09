/**
 * Generate Android and iOS app icons from appicon.svg
 * Run: node scripts/generate-app-icon.js
 */
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_ICON_PATH = path.join(ROOT, "assets", "logo.png");

const ANDROID_SIZES = [
  { dir: "mipmap-mdpi", size: 48 },
  { dir: "mipmap-hdpi", size: 72 },
  { dir: "mipmap-xhdpi", size: 96 },
  { dir: "mipmap-xxhdpi", size: 144 },
  { dir: "mipmap-xxxhdpi", size: 192 },
];

const IOS_SIZES = [
  { filename: "icon-20@2x.png", size: 40 },
  { filename: "icon-20@3x.png", size: 60 },
  { filename: "icon-29@2x.png", size: 58 },
  { filename: "icon-29@3x.png", size: 87 },
  { filename: "icon-40@2x.png", size: 80 },
  { filename: "icon-40@3x.png", size: 120 },
  { filename: "icon-60@2x.png", size: 120 },
  { filename: "icon-60@3x.png", size: 180 },
  { filename: "icon-1024.png", size: 1024 },
];

async function ensureDir(dirPath) {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
}

async function generateIcons() {
  if (!fs.existsSync(SOURCE_ICON_PATH)) {
    console.error("Source icon not found at", SOURCE_ICON_PATH);
    process.exit(1);
  }

  const buffer = await sharp(SOURCE_ICON_PATH)
    .resize(1024, 1024)
    .png()
    .toBuffer();

  // Android: each mipmap density
  const androidRes = path.join(ROOT, "android", "app", "src", "main", "res");
  for (const { dir, size } of ANDROID_SIZES) {
    const outDir = path.join(androidRes, dir);
    await ensureDir(outDir);
    const outPath = path.join(outDir, "ic_launcher.png");
    await sharp(buffer).resize(size, size).png().toFile(outPath);
    console.log("Wrote", outPath);
    const roundPath = path.join(outDir, "ic_launcher_round.png");
    await sharp(buffer).resize(size, size).png().toFile(roundPath);
    console.log("Wrote", roundPath);
  }

  // iOS: AppIcon.appiconset
  const iosIconSet = path.join(
    ROOT,
    "ios",
    "DataLynkr",
    "Images.xcassets",
    "AppIcon.appiconset"
  );
  await ensureDir(iosIconSet);
  for (const { filename, size } of IOS_SIZES) {
    const outPath = path.join(iosIconSet, filename);
    await sharp(buffer).resize(size, size).png().toFile(outPath);
    console.log("Wrote", outPath);
  }

  console.log("Done. Android and iOS app icons generated from appicon.svg.");
}

generateIcons().catch((err) => {
  console.error(err);
  process.exit(1);
});
