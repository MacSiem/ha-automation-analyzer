import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputIndex = process.argv.indexOf('--output-dir');
if (outputIndex < 0 || !process.argv[outputIndex + 1]) {
  throw new Error('Pass an explicit SSD --output-dir; source files are never overwritten.');
}
const output = path.resolve(process.argv[outputIndex + 1]);
if (!output.startsWith('/Volumes/Samsung_SSD/')) throw new Error('Output must be on SSD');
await fs.mkdir(output, { recursive: true });
const realOutput = await fs.realpath(output);
if (!realOutput.startsWith('/Volumes/Samsung_SSD/') || realOutput === await fs.realpath(root)) {
  throw new Error('Output must resolve to an SSD artifact directory outside the source root');
}
const start = '/* BEGIN LOCAL CHART.JS */';
const end = '/* END LOCAL CHART.JS */';
let vendor = (await fs.readFile(path.join(root, 'vendor/chart.umd.min.js'), 'utf8'))
  .replace(/^\/\/# sourceMappingURL=.*$/gm, '').trim();
if (!vendor.includes('Chart.js v4.5.1')) throw new Error('Unexpected vendored Chart.js version');
// Chart.js also exports window.Chart inside its factory, even in CommonJS mode.
// Remove that one legacy global export while keeping the official vendor intact.
const globalExport = '"undefined"!=typeof window&&(window.Chart=Tn),';
if (vendor.split(globalExport).length !== 2) throw new Error('Unexpected Chart.js global export');
vendor = vendor.replace(globalExport, '');
const license = await fs.readFile(path.join(root, 'vendor/Chart.js-LICENSE.md'), 'utf8');
let source = await fs.readFile(path.join(root, 'ha-automation-analyzer.js'), 'utf8');
if (source.includes(start)) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  if (last < 0) throw new Error('Incomplete existing bundle');
  source = source.slice(0, first) + source.slice(last + end.length).replace(/^\n+/, '');
}
// Local CommonJS bindings plus removal of the legacy export isolate Chart.js.
const bundle = `${start}\n/*\n${license}*/\nconst AAChart = (() => {\nconst module = { exports: {} };\nconst exports = module.exports;\n${vendor}\nreturn module.exports;\n})();\n${end}\n`;
const anchor = "'use strict';\n\n";
if (source.split(anchor).length !== 2) throw new Error('Missing component closure anchor');
source = source.replace(anchor, anchor + bundle);
const targets = ['ha-automation-analyzer.js', 'custom_components/ha_automation_analyzer/www/ha-automation-analyzer.js'];
for (const target of targets) {
  await fs.mkdir(path.dirname(path.join(output, target)), { recursive: true });
  await fs.writeFile(path.join(output, target), source);
}
console.log(JSON.stringify({ version: '4.5.1', output, bytes: Buffer.byteLength(source), targets }));
