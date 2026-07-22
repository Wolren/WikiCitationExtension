import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import JSZip from "jszip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "src");
const PUBLIC = join(__dirname, "public");
const DIST = join(__dirname, "dist");

function copy(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

function copyDir(src, dest, filter) {
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) {
      copyDir(s, d, filter);
    } else if (!filter || filter(entry)) {
      copy(s, d);
    }
  }
}

async function build() {
  mkdirSync(DIST, { recursive: true });

  // Bundle TypeScript entry points
  const result = await esbuild.build({
    entryPoints: [
      join(SRC, "content.ts"),
      join(SRC, "popup.ts"),
      join(SRC, "background.ts"),
    ],
    bundle: true,
    outdir: DIST,
    format: "iife",
    target: "es2018",
    sourcemap: false,
    minify: true,
    treeShaking: true,
    legalComments: "none",
  });

  if (result.errors.length > 0) {
    console.error("Build failed:", result.errors);
    process.exit(1);
  }

  // Copy static assets from public/
  if (existsSync(PUBLIC)) {
    copyDir(PUBLIC, DIST);
  }

  // Copy popup HTML and CSS
  copy(join(SRC, "popup.html"), join(DIST, "popup.html"));
  copy(join(SRC, "popup.css"), join(DIST, "popup.css"));

  // Package as .zip (Chrome) and .xpi (Firefox/Waterfox)
  const zipPath = join(__dirname, "wikifix-extension.zip");
  const xpiPath = join(__dirname, "wikifix-extension.xpi");
  const manifestPath = join(DIST, "manifest.json");

  try {
    // Read and parse the original manifest
    const origManifestRaw = readFileSync(manifestPath, "utf-8");
    const origManifest = JSON.parse(origManifestRaw);

    // Build .zip with Chrome manifest (service_worker)
    const chromeZip = new JSZip();
    (function addDir(dir, base) {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const entry = join(base, name).replace(/\\/g, "/");
        if (statSync(full).isDirectory()) addDir(full, entry);
        else chromeZip.file(entry, readFileSync(full));
      }
    })(DIST, "");
    const chromeBuf = await chromeZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    writeFileSync(zipPath, chromeBuf);

    // Build .xpi with Firefox manifest (background.scripts instead of service_worker)
    const ffManifest = { ...origManifest };
    if (ffManifest.background && ffManifest.background.service_worker) {
      ffManifest.background = { scripts: [ffManifest.background.service_worker] };
    }
    writeFileSync(manifestPath, JSON.stringify(ffManifest, null, 2), "utf-8");

    const firefoxZip = new JSZip();
    (function addDir(dir, base) {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const entry = join(base, name).replace(/\\/g, "/");
        if (statSync(full).isDirectory()) addDir(full, entry);
        else firefoxZip.file(entry, readFileSync(full));
      }
    })(DIST, "");
    const xpiBuf = await firefoxZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    writeFileSync(xpiPath, xpiBuf);

    // Restore Chrome manifest in dist/
    writeFileSync(manifestPath, origManifestRaw, "utf-8");

    console.log(`Packaged: ${zipPath} + ${xpiPath}`);
  } catch (e) {
    console.log("Skipped packaging:", e.message);
  }

  console.log("Build complete. Output in dist/");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
