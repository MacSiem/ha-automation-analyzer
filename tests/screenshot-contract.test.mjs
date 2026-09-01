import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screenshotsDir = resolve(root, "docs/screenshots");
const harnessPath = resolve(screenshotsDir, "_harness.html");
const manifestPath = resolve(screenshotsDir, "manifest.json");
const sourcePath = resolve(root, "ha-automation-analyzer.js");
const rendererPath = resolve(root, "scripts/render-screenshots.mjs");

const variants = [
  { file: "card-overview-light.png", theme: "light", viewport: "desktop", width: 480 },
  { file: "card-overview-dark.png", theme: "dark", viewport: "desktop", width: 480 },
  { file: "card-overview-narrow.png", theme: "light", viewport: "narrow", width: 360 },
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const privacyPatterns = [
  ["Maciej identifier", /\bmaciej\b|person\.maciej|phone_maciej/i],
  ["private IPv4", /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/],
  ["MAC address", /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/i],
  ["email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["local user path", /\/Users\/[^/\s]+|[A-Z]:\\Users\\[^\\\s]+/i],
  ["secret-like assignment", /\b(?:token|secret|password|api[_-]?key)\s*[:=]\s*\S+/i],
  ["household-behavior fixture", /front door|vacation presence|garage auto-close/i],
];

function assertPrivacySafe(label, value) {
  for (const [name, pattern] of privacyPatterns) {
    assert.doesNotMatch(value, pattern, `${label} contains banned ${name}`);
  }
}

function pngDimensions(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  assert.equal(signature, "89504e470d0a1a0a", "asset must be a PNG");
  assert.equal(buffer.subarray(12, 16).toString("ascii"), "IHDR", "PNG must start with IHDR");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function pngChunks(buffer) {
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    assert.ok(offset + 12 <= buffer.length, "PNG chunk header is truncated");
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    assert.ok(end <= buffer.length, "PNG chunk payload is truncated");
    chunks.push({
      type: buffer.subarray(offset + 4, offset + 8).toString("ascii"),
      data: buffer.subarray(offset + 8, offset + 8 + length),
    });
    offset = end;
  }
  assert.equal(offset, buffer.length, "PNG contains trailing bytes");
  return chunks;
}

test("harness is seeded, source-bound, motion-free, and offline", () => {
  const harness = readFileSync(harnessPath, "utf8");
  for (const parameter of ["theme", "viewport", "seed", "clock", "source_sha256", "locale", "timezone"]) {
    assert.match(harness, new RegExp(`params\\.get\\(['\"]${parameter}['\"]\\)`), `missing ${parameter} input`);
  }
  for (const attribute of [
    "data-source-sha256",
    "data-seed",
    "data-theme",
    "data-viewport",
    "data-locale",
    "data-timezone",
    "data-loading",
    "data-ready",
  ]) {
    assert.match(harness, new RegExp(attribute), `missing ${attribute} readback`);
  }
  assert.match(harness, /did not settle before the screenshot deadline/);
  assert.doesNotMatch(harness, /\bDate\.now\s*\(/, "harness clock must be explicit");
  assert.doesNotMatch(harness, /\bsetInterval\s*\(/, "harness must not retain nondeterministic intervals");
  assert.doesNotMatch(harness, /https?:\/\//i, "harness must not use remote resources");
  assertPrivacySafe("harness", harness);
});

test("renderer exposes only the two files required by the local harness", () => {
  const renderer = readFileSync(rendererPath, "utf8");
  assert.match(renderer, /const servedPaths = new Map/);
  assert.match(renderer, /["']\/docs\/screenshots\/_harness\.html["']/);
  assert.match(renderer, /["']\/ha-automation-analyzer\.js["']/);
  assert.match(renderer, /servedPaths\.get\(url\.pathname\)/);
  assert.match(renderer, /Emulation\.setLocaleOverride/);
  assert.match(renderer, /Emulation\.setTimezoneOverride/);
  assert.match(renderer, /readback\.locale !== locale/);
  assert.match(renderer, /readback\.timezone !== timezone/);
  assert.match(renderer, /readback\.loading !== false/);
  assert.match(renderer, /await stopChrome\(chrome\?\.processHandle\)/);
  assert.match(renderer, /maxRetries:\s*[1-9]/);
  assert.doesNotMatch(renderer, /readFileSync\(absolutePath\)/, "server must not expose arbitrary repository files");
});

test("all required screenshot assets exist", () => {
  for (const variant of variants) {
    assert.ok(existsSync(resolve(screenshotsDir, variant.file)), `missing ${variant.file}`);
  }
});

test("manifest binds exact current source and two deterministic renders", () => {
  assert.ok(existsSync(manifestPath), "missing docs/screenshots/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.deepEqual(Object.keys(manifest).sort(), ["captures", "fixture", "renderer", "schema_version", "source"].sort());
  assert.equal(manifest.schema_version, 2);
  assert.equal(manifest.source.path, "ha-automation-analyzer.js");
  assert.equal(manifest.source.sha256, sha256(readFileSync(sourcePath)));
  assert.equal(manifest.fixture.locale, "en-US");
  assert.equal(manifest.fixture.timezone, "UTC");
  assert.match(manifest.fixture.clock, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
  assert.match(manifest.fixture.seed, /^[a-z0-9-]+$/);
  assert.match(manifest.renderer.name, /chrome|chromium/i);
  assert.match(manifest.renderer.version, /^\d+(?:\.\d+){3}$/);
  assert.match(manifest.renderer.executable_sha256, /^[0-9a-f]{64}$/);
  assert.equal(manifest.captures.length, variants.length);

  for (const variant of variants) {
    const capture = manifest.captures.find((item) => item.file === variant.file);
    assert.ok(capture, `missing manifest entry for ${variant.file}`);
    assert.equal(capture.theme, variant.theme);
    assert.equal(capture.viewport, variant.viewport);
    assert.equal(capture.pixel_width, variant.width);
    assert.ok(Number.isInteger(capture.pixel_height) && capture.pixel_height >= 600);
    assert.equal(capture.source_sha256, manifest.source.sha256);
    const image = readFileSync(resolve(screenshotsDir, variant.file));
    const dimensions = pngDimensions(image);
    const chunks = pngChunks(image);
    assert.deepEqual(dimensions, { width: capture.pixel_width, height: capture.pixel_height });
    assert.equal(chunks[0]?.type, "IHDR");
    assert.equal(chunks.at(-1)?.type, "IEND");
    for (const chunk of chunks) {
      if (["tEXt", "zTXt", "iTXt", "eXIf"].includes(chunk.type)) {
        assertPrivacySafe(`${variant.file} ${chunk.type} metadata`, chunk.data.toString("utf8"));
      }
      assert.ok(["IHDR", "IDAT", "IEND"].includes(chunk.type), `${variant.file} contains forbidden ${chunk.type} metadata`);
    }
    assert.equal(capture.image_sha256, sha256(image));
    assert.deepEqual(
      capture.render_sha256_samples,
      [capture.image_sha256, capture.image_sha256],
      `${variant.file} was not reproduced byte-identically twice`,
    );
    assert.deepEqual(capture.layout.horizontal_overflow, false);
    assert.deepEqual(capture.runtime, { locale: "en-US", timezone: "UTC", loading: false });
    assert.ok(capture.layout.chart_state_height >= 44);
    assert.ok(capture.layout.chart_panel_height <= 170, `${variant.file} retains a large blank chart panel`);
  }

  assertPrivacySafe("manifest", JSON.stringify(manifest));
});

test("OCR is synthetic and privacy-safe for every screenshot", () => {
  try {
    execFileSync("tesseract", ["--version"], { stdio: "ignore" });
  } catch {
    assert.fail("tesseract is required for the screenshot privacy gate");
  }

  for (const variant of variants) {
    const imagePath = resolve(screenshotsDir, variant.file);
    assert.ok(existsSync(imagePath), `missing ${variant.file}`);
    const ocr = execFileSync("tesseract", [imagePath, "stdout", "--psm", "6"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    assert.match(ocr, /Automation Analyzer/i, `${variant.file} lost the product title`);
    assert.match(ocr, /Demo (?:rule|automation)/i, `${variant.file} is not visibly bound to the synthetic fixture`);
    assertPrivacySafe(`${variant.file} OCR`, ocr);
  }
});
