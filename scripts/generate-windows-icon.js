import fs from "fs";
import path from "path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = process.cwd();
const inputSvg = path.join(root, "public", "app-icon.svg");
const outputDir = path.join(root, "installer", "assets");
const outputIco = path.join(outputDir, "app.ico");

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const run = async () => {
  if (!fs.existsSync(inputSvg)) {
    console.warn(`Icon source not found: ${inputSvg}`);
    return;
  }

  ensureDir(outputDir);
  const pngBuffer = await sharp(inputSvg)
    .resize(256, 256, { fit: "contain" })
    .png()
    .toBuffer();
  const icoBuffer = await pngToIco(pngBuffer);
  fs.writeFileSync(outputIco, icoBuffer);
  console.log(`Generated Windows icon: ${outputIco}`);
};

run().catch((error) => {
  console.error("Failed to generate Windows icon:", error);
  process.exit(1);
});
