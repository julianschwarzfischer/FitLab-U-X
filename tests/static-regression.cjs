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
for(const marker of ['EVOLUTION UX 1','function xpEvolutionNutrition()','function xpEvolutionTraining()','id=\'xpEvoDaily\'']) {
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

