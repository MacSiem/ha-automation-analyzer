import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screenshotsDir = resolve(root, "docs/screenshots");
const sourcePath = resolve(root, "ha-automation-analyzer.js");
const manifestPath = resolve(screenshotsDir, "manifest.json");
const seed = "aa-demo-v1";
const clock = "2026-08-31T10:00:00.000Z";
const locale = "en-US";
const timezone = "UTC";

const variants = [
  { file: "card-overview-light.png", theme: "light", viewport: "desktop", width: 480 },
  { file: "card-overview-dark.png", theme: "dark", viewport: "desktop", width: 480 },
  { file: "card-overview-narrow.png", theme: "light", viewport: "narrow", width: 360 },
];

const servedPaths = new Map([
  ["/docs/screenshots/_harness.html", { file: resolve(screenshotsDir, "_harness.html"), type: "text/html; charset=utf-8" }],
  ["/ha-automation-analyzer.js", { file: sourcePath, type: "text/javascript; charset=utf-8" }],
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function resolveChrome() {
  const candidates = [
    process.env.AA_SCREENSHOT_BROWSER,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error("No approved Chrome/Chromium renderer found; set AA_SCREENSHOT_BROWSER explicitly");
  }
  return executable;
}

function startStaticServer() {
  const server = createServer((request, response) => {
    try {
      if (request.method !== "GET") {
        response.writeHead(405, { allow: "GET" }).end("method not allowed");
        return;
      }
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const servedPath = servedPaths.get(url.pathname);
      if (!servedPath) {
        response.writeHead(404).end("not found");
        return;
      }
      const body = readFileSync(servedPath.file);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'",
        "content-type": servedPath.type,
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((resolveServer, rejectServer) => {
    server.once("error", rejectServer);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveServer({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

function launchChrome(executable, profilePath) {
  const processHandle = spawn(executable, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profilePath}`,
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-domain-reliability",
    "--disable-features=OptimizationHints,MediaRouter,Translate",
    "--disable-font-subpixel-positioning",
    "--disable-gpu",
    "--disable-lcd-text",
    "--disable-skia-runtime-opts",
    "--disable-threaded-animation",
    "--disable-threaded-scrolling",
    "--deterministic-mode",
    "--disable-sync",
    "--font-render-hinting=none",
    "--force-color-profile=srgb",
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    `--lang=${locale}`,
    "--metrics-recording-only",
    "--no-first-run",
    "--no-pings",
    "--password-store=basic",
    "--run-all-compositor-stages-before-draw",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  return new Promise((resolveChromeReady, rejectChromeReady) => {
    let stderr = "";
    const timeout = setTimeout(() => {
      rejectChromeReady(new Error(`Chrome DevTools startup timed out: ${stderr.slice(-500)}`));
    }, 15_000);
    processHandle.stderr.setEncoding("utf8");
    processHandle.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      const port = new URL(match[1]).port;
      resolveChromeReady({ processHandle, port });
    });
    processHandle.once("error", (error) => {
      clearTimeout(timeout);
      rejectChromeReady(error);
    });
    processHandle.once("exit", (code) => {
      if (!stderr.includes("DevTools listening on")) {
        clearTimeout(timeout);
        rejectChromeReady(new Error(`Chrome exited before DevTools was ready (${code}): ${stderr.slice(-500)}`));
      }
    });
  });
}

async function stopChrome(processHandle) {
  if (!processHandle || processHandle.exitCode !== null || processHandle.signalCode !== null) return;
  await new Promise((resolveStop) => {
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      clearTimeout(forceTimer);
      clearTimeout(giveUpTimer);
      resolveStop();
    };
    processHandle.once("exit", finish);
    const forceTimer = setTimeout(() => {
      if (processHandle.exitCode === null && processHandle.signalCode === null) {
        processHandle.kill("SIGKILL");
      }
    }, 2_000);
    const giveUpTimer = setTimeout(finish, 5_000);
    if (!processHandle.kill("SIGTERM")) finish();
  });
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.socket = new WebSocket(url);
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolveOpen, rejectOpen) => {
      this.socket.addEventListener("open", resolveOpen, { once: true });
      this.socket.addEventListener("error", rejectOpen, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result || {});
        return;
      }
      for (const handler of this.handlers.get(message.method) || []) {
        Promise.resolve(handler(message.params || {})).catch(() => {});
      }
    });
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) || [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveCommand, rejectCommand) => {
      this.pending.set(id, { resolve: resolveCommand, reject: rejectCommand, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function createPage(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about%3Ablank`, { method: "PUT" });
  if (!response.ok) throw new Error(`Cannot create Chrome target: HTTP ${response.status}`);
  const target = await response.json();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  return client;
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || "browser evaluation failed");
  }
  return result.result?.value;
}

async function waitForReady(client) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const state = await evaluate(client, `({
      ready: document.documentElement.getAttribute("data-ready"),
      error: document.documentElement.getAttribute("data-error")
    })`);
    if (state?.ready === "true") return;
    if (state?.ready === "error") throw new Error(`Harness failed: ${state.error}`);
    await delay(25);
  }
  throw new Error("Harness readiness timed out");
}

async function captureOnce(client, origin, variant, sourceSha256) {
  const query = new URLSearchParams({
    theme: variant.theme,
    viewport: variant.viewport,
    seed,
    clock,
    source_sha256: sourceSha256,
    locale,
    timezone,
  });
  const targetUrl = `${origin}/docs/screenshots/_harness.html?${query}`;
  const blocked = new Set();

  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Network.enable");
  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  client.on("Fetch.requestPaused", async ({ requestId, request }) => {
    const allowed = request.url.startsWith(`${origin}/`) || request.url === "about:blank";
    if (allowed) await client.send("Fetch.continueRequest", { requestId });
    else {
      blocked.add(request.url);
      await client.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    }
  });
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: variant.width,
    height: 1800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await client.send("Emulation.setLocaleOverride", { locale });
  await client.send("Emulation.setTimezoneOverride", { timezoneId: timezone });
  await client.send("Page.navigate", { url: targetUrl });
  await waitForReady(client);
  await evaluate(client, "document.fonts.ready.then(() => true)", true);

  const readback = await evaluate(client, `(() => {
    const root = document.documentElement;
    const card = document.getElementById("card");
    const rect = card.getBoundingClientRect();
    const captureRect = document.body.getBoundingClientRect();
    const chartState = card.shadowRoot?.querySelector(".chart-unavailable, .chart-empty");
    const chartPanel = chartState?.closest(".card");
    const chartStateRect = chartState?.getBoundingClientRect();
    const chartPanelRect = chartPanel?.getBoundingClientRect();
    return {
      sourceSha256: root.getAttribute("data-source-sha256"),
      seed: root.getAttribute("data-seed"),
      theme: root.getAttribute("data-theme"),
      viewport: root.getAttribute("data-viewport"),
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      loading: Boolean(card._loadingInProgress || card._isLoading),
      loadingAttribute: root.getAttribute("data-loading"),
      ready: root.getAttribute("data-ready"),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      captureRect: {
        x: captureRect.x,
        y: captureRect.y,
        width: captureRect.width,
        height: captureRect.height
      },
      cardScrollWidth: card.scrollWidth,
      cardClientWidth: card.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      chartStateHeight: chartStateRect?.height || 0,
      chartPanelHeight: chartPanelRect?.height || 0,
      text: card.shadowRoot?.textContent || ""
    };
  })()`);

  if (readback.sourceSha256 !== sourceSha256 || readback.seed !== seed) {
    throw new Error("Harness provenance readback does not match capture input");
  }
  if (readback.theme !== variant.theme || readback.viewport !== variant.viewport || readback.ready !== "true") {
    throw new Error("Harness state readback does not match requested target");
  }
  if (readback.locale !== locale || readback.timezone !== timezone) {
    throw new Error(`Runtime locale/timezone mismatch: ${readback.locale}/${readback.timezone}`);
  }
  if (readback.loading !== false || readback.loadingAttribute !== "false") {
    throw new Error("Harness reported ready while the card was still loading");
  }
  if (Math.round(readback.captureRect.width) !== variant.width) {
    throw new Error(`Unexpected capture width ${readback.captureRect.width} for ${variant.file}`);
  }
  if (readback.cardScrollWidth > readback.cardClientWidth || readback.bodyScrollWidth > readback.bodyClientWidth) {
    throw new Error(`Horizontal overflow detected for ${variant.file}`);
  }
  if (!/Automation Analyzer/.test(readback.text) || !/Demo automation/.test(readback.text)) {
    throw new Error(`Synthetic fixture did not render in ${variant.file}`);
  }
  if (readback.chartStateHeight < 44 || readback.chartPanelHeight > 170) {
    throw new Error(
      `Chart state leaves an invalid panel footprint in ${variant.file}: `
      + `state=${readback.chartStateHeight}, panel=${readback.chartPanelHeight}`,
    );
  }
  if (blocked.size > 0) {
    throw new Error(`Renderer attempted non-local requests: ${[...blocked].join(", ")}`);
  }

  const clip = {
    x: Math.max(0, readback.captureRect.x),
    y: Math.max(0, readback.captureRect.y),
    width: Math.ceil(readback.captureRect.width),
    height: Math.ceil(readback.captureRect.height),
    scale: 1,
  };
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip,
  });
  return { bytes: Buffer.from(screenshot.data, "base64"), clip, readback };
}

async function main() {
  const executable = resolveChrome();
  const sourceSha256 = sha256(readFileSync(sourcePath));
  const executableSha256 = sha256(readFileSync(executable));
  const profilePath = mkdtempSync(resolve(tmpdir(), "aa-screenshot-chrome-"));
  const { server, origin } = await startStaticServer();
  let chrome;
  try {
    chrome = await launchChrome(executable, profilePath);
    const versionResponse = await fetch(`http://127.0.0.1:${chrome.port}/json/version`);
    const versionInfo = await versionResponse.json();
    const version = String(versionInfo.Browser || "").match(/(?:Chrome|Chromium)\/(\d+(?:\.\d+){3})/)?.[1];
    if (!version) throw new Error(`Unsupported renderer identity: ${versionInfo.Browser}`);

    const captures = [];
    for (const variant of variants) {
      const samples = [];
      let selected;
      for (let iteration = 0; iteration < 2; iteration += 1) {
        const client = await createPage(chrome.port);
        try {
          const capture = await captureOnce(client, origin, variant, sourceSha256);
          samples.push(sha256(capture.bytes));
          selected = capture;
        } finally {
          client.close();
        }
      }
      if (samples[0] !== samples[1]) {
        throw new Error(`${variant.file} is not byte-deterministic: ${samples.join(" != ")}`);
      }
      const destination = resolve(screenshotsDir, variant.file);
      writeFileSync(destination, selected.bytes);
      captures.push({
        file: variant.file,
        theme: variant.theme,
        viewport: variant.viewport,
        pixel_width: selected.clip.width,
        pixel_height: selected.clip.height,
        source_sha256: sourceSha256,
        image_sha256: samples[0],
        render_sha256_samples: samples,
        layout: {
          horizontal_overflow: false,
          chart_state_height: Math.round(selected.readback.chartStateHeight),
          chart_panel_height: Math.round(selected.readback.chartPanelHeight),
        },
        runtime: { locale: selected.readback.locale, timezone: selected.readback.timezone, loading: false },
      });
    }

    const manifest = {
      schema_version: 2,
      source: { path: "ha-automation-analyzer.js", sha256: sourceSha256 },
      fixture: { seed, clock, locale, timezone },
      renderer: { name: "Google Chrome", version, executable_sha256: executableSha256 },
      captures,
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    await stopChrome(chrome?.processHandle);
    rmSync(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
