'use strict';
const fs=require('node:fs'), assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
for (const s of ['async function xpIDBInit()',"transaction(xpIDBStore,'readwrite')",'tx.oncomplete','xpIDBBoot','xpAKey']) assert(html.includes(s),`missing ${s}`);
const v=html.match(/id="appVersion"[^>]*>EXP ([^<]+)</);
const c=sw.match(/const CACHE=CACHE_PREFIX\+'([^']+)'/);
assert(v && c,'Version / worker cache marker missing');
const marker=v[1].toLowerCase().replace(/\s+/g,'-').replace(/\./g,'-');
assert.equal(c[1],marker,`HTML/Worker version mismatch: ${marker} / ${c[1]}`);
console.log('PASS quality gate: IndexedDB transaction path + HTML/Worker version match',marker);
for(const marker of ['EVOLUTION UX 2','function xpEvolutionNutrition()','function xpEvolutionTraining()','id=\'xpEvoDaily\'']) {
  assert(html.includes(marker),`missing UX contract: ${marker}`);
}
assert(html.includes('xpEvolutionRenderBase.apply'), 'UX must decorate, not replace render');
console.log('PASS UX quality gate: daily summary, optional week selector, no persistence replacement');

// Compile every inline application script from the *current* HTML rather than a
// previously extracted copy. This catches malformed release bundles before CI
// attempts to launch a browser and avoids false passes from stale test artifacts.
const vm=require('node:vm');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(m=>!/(?:^|\s)src\s*=/.test(m[1]));
assert(scripts.length>0,'No inline application scripts found');
scripts.forEach((match,i)=>{
  try{new vm.Script(match[2],{filename:`index.html:inline-script-${i+1}`})}
  catch(err){throw new Error(`Invalid inline JavaScript #${i+1}: ${err.message}`)}
});
console.log(`PASS inline JavaScript compilation: ${scripts.length} scripts`);
// The migration must read canonical IDB before reaching for the legacy data;
// this check complements (but does not replace) the browser-level upgrade test.
const migration=html.slice(html.indexOf('async function xpIDBInit()'),html.indexOf('function xpIDBSignal()'));
assert(migration.includes('if(get.result!==undefined)'),'Existing IndexedDB must win');
assert(migration.indexOf('if(get.result!==undefined)')<migration.indexOf('fitStore161.getItem(xpAKey)'),'Legacy must not precede canonical IDB');
console.log('PASS migration priority: existing IndexedDB before legacy');

// Check parseability of separately loaded scripts and local PWA assets.
for(const file of ['brand.js','sw.js','exercise-atlas.js'])new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
assert(manifest.icons?.length,'Manifest needs install icons');
for(const {src} of manifest.icons)assert(fs.statSync(src).isFile(),`Missing manifest icon: ${src}`);
console.log('PASS external JavaScript and manifest icon files');

assert(html.includes('src="exercise-atlas.js"'),'Exercise atlas must be loaded by HTML');
assert(sw.includes("'./exercise-atlas.js'"),'Exercise atlas must be cached for offline use');
console.log('PASS Evolution 3 exercise atlas: external script and offline resource');

const css=fs.readFileSync('premium-ux.css','utf8');
assert(html.includes('href="premium-ux.css"'),'Premium UX stylesheet missing from HTML');
assert(sw.includes("'./premium-ux.css'"),'Premium UX stylesheet missing from offline cache');
for(const selector of ['#nutrition','#trainingout','#profile','#xp15Progress','.nav'])assert(css.includes(selector),'Missing Premium UX design coverage for '+selector);
assert(css.includes('prefers-reduced-motion'),'Premium UX must support reduced motion');
console.log('PASS premium UX cross-module design and offline resource');
