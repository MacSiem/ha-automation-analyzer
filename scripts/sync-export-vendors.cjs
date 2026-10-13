'use strict';
// Local source/runtime provenance check. --write is explicit source propagation;
// it never runs the product or tests, downloads dependencies or changes versions.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const provenance = JSON.parse(fs.readFileSync(path.join(root,'shared/diagnostic-export-provenance.json'),'utf8'));
const units = [
 ['HA TOOLS UI V3','shared/ha-tools-ui.js',s=>s.split('// Node tests use the canonical factory;')[0].trimEnd()],
 ['HA TOOLS EXPORT V3','shared/ha-tools-export.js',s=>s.replace('export function createExportDialog','function createExportDialog').trimEnd()],
];
let card = fs.readFileSync(path.join(root,'ha-automation-analyzer.js'),'utf8');
for(const [name,file,transform]of units) {
 const source=fs.readFileSync(path.join(root,file),'utf8'),digest=hash(source),runtime=transform(source);
 if(digest!==provenance.files[file].sourceSha256 || hash(runtime)!==provenance.files[file].runtimeSha256) throw new Error('Reviewed source/provenance drift: '+file);
 const start='// BEGIN '+name, end='// END '+name;
 const first=card.indexOf(start),last=card.indexOf(end,first);
 if(first<0 || last<0 || card.indexOf(start,first+1)>=0)throw new Error('Missing or competing local vendor: '+name);
 const expected=start+' source-sha256='+digest+'\n'+runtime+'\n'+end;
 if(process.argv.includes('--write')) card=card.slice(0,first)+expected+card.slice(last+end.length);
 else if(card.slice(first,last+end.length)!==expected)throw new Error('Runtime/source drift: '+name);
}
if((card.match(/function createUiV3\(/g)||[]).length!==1 || (card.match(/function createExportDialog\(/g)||[]).length!==1)throw new Error('Competing factories');
for(const file of ['ha-automation-analyzer.js','custom_components/ha_automation_analyzer/www/ha-automation-analyzer.js']) {
 const target=path.join(root,file);
 if(process.argv.includes('--write'))fs.writeFileSync(target,card);
 else if(fs.readFileSync(target,'utf8')!==card)throw new Error('Standalone/integration card drift: '+file);
}
process.stdout.write(process.argv.includes('--write')?'Reviewed vendors propagated to both card sources.\n':'Reviewed source/vendor/runtime parity confirmed.\n');
