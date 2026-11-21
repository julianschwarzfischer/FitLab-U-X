const { test, expect } = require('@playwright/test');

// All tests use a fresh browser context and entirely synthetic fitness records.
// Give returning-user scenarios an isolated, valid synthetic profile. Keep the
// genuinely empty browser scenario independent so a boot regression stays visible.
async function ready(page) {
  await page.route('**/__test_setup__', route => route.fulfill({contentType:'text/html', body:'<!doctype html>'}));
  await page.goto('/__test_setup__');
  await page.evaluate(() => {
    const key='flx161:'+encodeURIComponent(location.origin+'/|')+':fitnesslab-experience-v1';
    if (localStorage.getItem(key) !== null) return;
    const p={goals:[0],priority:'auto',weight:80,height:180,age:40,sex:'m',bodyfat:'',waist:'',
      activity:'1.25',sleep:'7.5',experience:'beginner',place:'home',kind:'mix',days:4,minutes:60,
      intensity:'5',equipment:[],extra:'',limits:'',restricted:false,adjust:0};
    localStorage.setItem(key,JSON.stringify({p,log:{},favorites:[],water:{},recipes:[],waterGoal:2500}));
  });
  await page.goto('/');
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0, {timeout: 20000});
  await expect(page.locator('#appVersion')).not.toBeEmpty();
}
async function canonical(page) {
  return page.evaluate(async () => await xpIDBRead());
}
async function addMeal(page, label, grams) {
  await page.evaluate(()=>tab('nutrition'));
  await page.getByRole('button',{name:/Selbst eintragen/}).click();
  await page.locator('#foodname').fill(label);
  await page.locator('#fk').fill('172');
  await page.locator('#fp').fill('10');
  await page.locator('#fc').fill('24');
  await page.locator('#ff').fill('4');
  await page.locator('#grams').fill(String(grams));
  // Do not accept a stale success banner left by the preceding action.
  // One confirmed operation must appear exactly once in authoritative IndexedDB.
  await page.locator('#add').click();
  await expect.poll(async()=>page.evaluate(async({label,grams})=>{
    const record=await xpIDBRead();
    const rows=Object.values(record?.log||{}).flat().filter(x=>x.n===label);
    return rows.length===1&&Number(rows[0].g)===grams&&!!rows[0]._fid;
  },{label,grams}),{timeout:20000,message:`Committed meal ${label} must be durable`}).toBe(true);
  await expect(page.locator('#xpNextSaveStatus')).toContainText('Gespeichert', {timeout:20000});
}
async function seedLegacy(page, record) {
  // Deliberately reset ONLY an isolated synthetic test database, never user data.
  await page.evaluate(async (record) => {
    const dbName=xpIDBName;
    const key=xp161Namespace+xpAKey;
    xpIDBDatabase?.close();
    await new Promise((resolve,reject)=>{
      const req=indexedDB.deleteDatabase(dbName);
      req.onsuccess=resolve;
      req.onerror=()=>reject(req.error);
      req.onblocked=()=>reject(Error('Isolated test database blocked'));
    });
    localStorage.setItem(key, typeof record==='string'?record:JSON.stringify(record));
  }, record);
}

test('new installation opens with empty storage', async ({page})=>{
  await page.goto('/');
  const overlay=page.locator('#xpIDBBootOverlay');
  await expect(overlay).toHaveCount(0);
  const first=await canonical(page);
  expect(first.p).toMatchObject({age:'',height:'',weight:'',goals:[]});
  await expect(page.getByRole('heading',{name:'Willkommen'})).toBeVisible();
  await page.reload();
  await expect(overlay).toHaveCount(0);
  expect(await canonical(page)).toEqual(first);
});

test('atomic parallel meal writes remain durable', async ({browser}) => {
  const context=await browser.newContext();
  const a=await context.newPage();
  await ready(a);
  const b=await context.newPage();
  await ready(b);
  const confirmed=[];
  for(let i=0;i<12;i++) {
    const labelA=`E2E-${i}-A`, labelB=`E2E-${i}-B`;
    await Promise.all([addMeal(a,labelA,101+i),addMeal(b,labelB,201+i)]);
    await Promise.all([a.reload(),b.reload()]);
    await Promise.all([expect(a.locator('#xpIDBBootOverlay')).toHaveCount(0),expect(b.locator('#xpIDBBootOverlay')).toHaveCount(0)]);
    const data=await canonical(a);
    const remote=await canonical(b);
    expect(remote,`Both tabs must read the same committed record after round ${i}`).toEqual(data);
    const entries=Object.values(data.log).flat();
    confirmed.push([labelA,101+i],[labelB,201+i]);
    for(const [name,g] of confirmed) {
      const matches=entries.filter(x=>x.n===name);
      expect(matches,`${name} missing or duplicated after confirmed save`).toHaveLength(1);
      expect(Number(matches[0].g)).toBe(g);
      expect(matches[0]._fid).toBeTruthy();
    }
  }
  await context.close();
});

test('previously committed IndexedDB opens despite invalid legacy object', async ({page})=>{
  await ready(page);
  await addMeal(page,'IDB-CONFIRMED',135);
  const initial=await canonical(page);
  await page.evaluate(()=>localStorage.setItem(xp161Namespace+xpAKey,'{}'));
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0,{timeout:20000});
  const restored=await canonical(page);
  expect(restored).toEqual(initial);
});

test('confirmed database still boots when legacy object is empty and avatar preference is unset', async ({page})=>{
  await ready(page);
  await addMeal(page,'BOOT-KEEP',113);
  const before=await canonical(page);
  await page.evaluate(()=>{
    localStorage.setItem(xp161Namespace+xpAKey,'{}');
    fitStore161.removeItem(xpKey);
  });
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0,{timeout:20000});
  expect(await canonical(page)).toEqual(before);
});

test('first start migrates a complete legacy export including active training', async ({page})=>{
  await ready(page);
  await addMeal(page,'LEGACY-MEAL',125);
  const fixture=await page.evaluate(async()=>{
    const data=await xpIDBRead();
    const day=dateKey();
    data.water[day]=250;
    data.trainingDraft={key:'legacy-test',date:day,day:0,type:'mobility',started:Date.now(),items:[{id:exs[0][0],sets:[{reps:17,weight:0,done:true}]}]};
    return data;
  });
  await seedLegacy(page,fixture);
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0,{timeout:20000});
  const migrated=await canonical(page);
  expect(migrated.log).toEqual(fixture.log);
  expect(migrated.water).toEqual(fixture.water);
  expect(migrated.trainingDraft).toEqual(fixture.trainingDraft);
  expect(migrated.p).toEqual(fixture.p);
});

// Real code-to-code migration: QA 5 writes using its own actual localStorage
// persistence; the same origin/path then reloads the new IndexedDB implementation.
// Blocking service workers isolates application migration from worker update caching.
test('real QA5 application automatically migrates into current IndexedDB', async ({browser})=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const oldHtml=fs.readFileSync(path.join(__dirname,'fixtures','qa5.html'),'utf8');
  const sha=require('node:crypto').createHash('sha256').update(oldHtml).digest('hex');
  expect(sha,'QA5 source fixture must be immutable').toBe('18f1bec5802b82b44b531cd182d70c993006b26640639202d357ae6067e79c70');
  const context=await browser.newContext({serviceWorkers:'block'});
  const page=await context.newPage();
  const root=new URL('/',test.info().project.use.baseURL).href;
  const oldRoute=async route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:oldHtml});
  await page.route(root,oldRoute);
  await page.goto(root);
  await expect(page.locator('#appVersion')).toContainText('QA 5');
  const saved=await page.evaluate(async()=>{
    state.p.age=41;state.p.weight=80;state.p.height=180;state.p.days=5;state.p.minutes=60;state.p.sex='m';
    const day=dateKey();
    state.log[day]=[{_fid:'fl2-qa5-real-migration-001',n:'QA5 Original Mahlzeit',g:125,k:172,p:10,c:24,f:4,meal:'Frühstück',source:'Eigene Angabe',fiber:null}];
    state.water[day]=250;
    // An actual QA5 app writes all of these modules through its legacy save().
    // Exercise and draft objects conform to the original QA5 schema.
    const example={id:exs[0][0],sets:[{reps:17,weight:0,done:true}]};
    state.trainingDraft={key:'qa5-migration-open',date:day,day:0,type:'mobility',started:Date.now(),items:[example]};
    state.trainingHistory=[{date:day,type:'mobility',minutes:19,items:[example]}];
    state.coach={days:{[day]:{weight:80,waist:null,fat:null,sleep:8,energy:4,soreness:0,complete:true}}};
    if(!validBackup(state))throw Error('QA5 synthetic fixture must pass the ORIGINAL app backup validator');
    const ok=await save();
    if(!ok)throw Error('QA5 localStorage commit failed');
    const original=JSON.parse(fitStore161.getItem(xpAKey));
    if(!original.log[day]?.some(x=>x.n==='QA5 Original Mahlzeit'))throw Error('QA5 source data missing');
    return original;
  });
  // Verify the old file actually wrote the source rather than using the new implementation.
  const legacy=await page.evaluate(()=>JSON.parse(fitStore161.getItem(xpAKey)));
  expect(legacy).toEqual(saved);
  await page.unroute(root,oldRoute);
  await page.reload();
  await expect(page.locator('#appVersion')).toContainText('QA 8');
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0,{timeout:20000});
  const migrated=await canonical(page);
  expect(migrated.p.age).toBe(41);
  expect(migrated.p.days).toBe(5);
  expect(migrated.log).toEqual(saved.log);
  expect(migrated.water).toEqual(saved.water);
  expect(migrated.trainingDraft).toEqual(saved.trainingDraft);
  expect(migrated.trainingHistory).toEqual(saved.trainingHistory);
  expect(migrated.coach).toEqual(saved.coach);
  const after=await page.evaluate(()=>JSON.parse(fitStore161.getItem(xpAKey)));
  expect(after).toEqual(saved); // Migration must not alter the old backup in localStorage.
  await context.close();
});

test('malformed legacy does not silently create or replace a database', async ({page})=>{
  await ready(page);
  await seedLegacy(page,'{not-json');
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveAttribute('role','alert',{timeout:20000});
  await expect(page.locator('#xpIDBBootOverlay')).toContainText('keine Daten', {ignoreCase:true});
  expect(await canonical(page)).toBeNull();
  expect(await page.evaluate(()=>fitStore161.getItem(xpAKey))).toBe('{not-json');
});

for(const width of [320,375,390,430]){
  test(`mobile layout ${width}px does not horizontally overflow`,async({browser})=>{
    const context=await browser.newContext({viewport:{width,height:800},isMobile:true,deviceScaleFactor:2,hasTouch:true});
    const page=await context.newPage();await ready(page);
    for(const [name, label] of [
      ['today','Heute'],['nutrition','Ernährung'],['training','Training'],
      ['progress','Fortschritt'],['profile','Profil']
    ]){
      await page.getByRole('navigation').getByRole('button',{name:label,exact:true}).click();
      const metrics=await page.evaluate(()=>{
        const {scrollWidth,clientWidth}=document.documentElement;
        const overflowing=[...document.querySelectorAll('body *')].flatMap(element=>{
          const {left,right,width}=element.getBoundingClientRect();
          if(!width||(left>=-1&&right<=clientWidth+1&&element.scrollWidth<=element.clientWidth+1))return [];
          return [{
            element:element.tagName,
            id:element.id,
            className:element.getAttribute('class'),
            left:Math.round(left),right:Math.round(right),
            scrollWidth:element.scrollWidth,clientWidth:element.clientWidth,
            text:element.textContent.trim().slice(0,70)
          }];
        }).slice(0,25);
        return {scrollWidth,clientWidth,overflowing};
      });
      expect(metrics.scrollWidth,`${name} overflow at ${width}px: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.clientWidth);
    }
    await context.close();
  });
}

// UX contract: primary nutrition summary and progressive-disclosure training
// must preserve underlying entries and week navigation.
test('mobile nutrition has a single quick area and a live daily summary',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();await ready(page);
  await addMeal(page,'UX-Beispiel',125);
  const panel=page.locator('#xpEvoDaily');
  await expect(panel).toContainText('UX-Beispiel');
  await expect(page.locator('#nutrition #xpCQuick')).toHaveCount(1);
  await expect(page.locator('#nutrition #xpNutrition')).toBeHidden();
  await page.evaluate(()=>{state.water[dateKey()]=250;render()});
  await expect(panel).toContainText('0,25 l');
  const dimensions=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
  expect(dimensions.sw).toBeLessThanOrEqual(dimensions.cw+1);
  await context.close();
});

test('active training keeps week selector accessible behind disclosure',async({page})=>{
  await ready(page);
  await page.evaluate(()=>{tab('training');startTraining()});
  await expect.poll(async()=> (await canonical(page))?.trainingDraft?.items?.length).toBeGreaterThan(0);
  const week=page.locator('#trainingout .xpEvoWeekDetails');
  await expect(week).toHaveCount(1);
  await expect(week.locator('.week')).toHaveCount(1);
  await expect(week).not.toHaveAttribute('open');
  await week.locator('summary').click();
  await expect(week).toHaveAttribute('open');
});

// Real app export/import contract: never mistake a completed download or an
// import notification for preservation of the persisted record.
test('unchanged own backup round-trips after normal profile edit',async({page})=>{
  await ready(page);
  await addMeal(page,'ROUNDTRIP-OWN',145);
  await page.evaluate(()=>tab('profile'));
  await page.locator('details:has(#age) > summary').click();
  await page.locator('#age').fill('41');
  await expect.poll(async()=> (await canonical(page))?.p?.age,{timeout:15000}).toBe(41);
  const durable=await canonical(page);
  await page.locator('details:has(#export) > summary').click();
  const pendingDownload=page.waitForEvent('download');
  await page.locator('#export').click();
  const download=await pendingDownload;
  const content=require('node:fs').readFileSync(await download.path(),'utf8');
  const fromApp=JSON.parse(content);
  expect(fromApp.p.age).toBe(41);
  expect(fromApp.log).toEqual(durable.log);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#import').setInputFiles({name:'own-backup.json',mimeType:'application/json',buffer:Buffer.from(content)});
  await expect(page.locator('#importstatus')).toContainText('Sicherung erfolgreich',{timeout:20000});
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0,{timeout:20000});
  expect(await canonical(page)).toEqual(durable);
});

test('invalid nested backup cannot replace the confirmed IndexedDB record',async({page})=>{
  await ready(page);
  await addMeal(page,'BACKUP-MUST-SURVIVE',146);
  const before=await canonical(page);
  const damaged=structuredClone(before);
  damaged.coach={...(damaged.coach||{}),days:null};
  let alertText='';
  page.once('dialog',async dialog=>{alertText=dialog.message();await dialog.accept()});
  await page.locator('#import').setInputFiles({name:'damaged-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(damaged))});
  await expect.poll(()=>alertText,{timeout:10000}).toContain('nicht übernommen');
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0,{timeout:20000});
  expect(await canonical(page)).toEqual(before);
});
