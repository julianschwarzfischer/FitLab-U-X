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
  await expect(page.locator('#appVersion')).toHaveText('EXP 1.6.2 EVOLUTION 3.4 NATURAL FLOW');
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
  await week.locator(':scope > summary').click();
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

const mobileNav = (page, name) => page.getByRole('navigation').getByRole('button', { name, exact: true });

async function enterCheckIn(page) {
  await mobileNav(page, 'Heute').click();
  const focus = page.locator('#xpHome .xp12Focus');
  await expect(focus.getByRole('button')).toHaveCount(1);
  await expect(focus.getByRole('button')).toHaveText('Check-in starten ›');
  await focus.getByRole('button').click();
  await page.locator('#xpSleep').fill('8');
  await page.locator('[data-xp-choice="energy"][data-v="4"]').click();
  await page.locator('[data-xp-choice="soreness"][data-v="0"]').click();
  await page.getByRole('button', { name: 'Check-in speichern', exact: true }).click();
  await expect.poll(async () => (await canonical(page)).coach.days[await page.evaluate(() => dateKey())]?.sleep).toBe(8);
}

async function startPlannedWorkout(page) {
  await mobileNav(page, 'Training').click();
  await page.locator('#trainingout button[data-plan-start]').first().click();
  await expect(page.locator('#trainingout .xpEvoWorkoutHead')).toBeVisible();
  await expect.poll(async () => (await canonical(page))?.trainingDraft?.items?.length).toBeGreaterThan(0);
}

test('daily focus has one check-in action and nutrition reaches saved food, search and tools', async ({page}) => {
  await ready(page);
  await expect(page.locator('#xpHome .xp12Quick')).toHaveCount(0);
  const coach = page.locator('#xpHome .xpEvoCoach');
  await expect(coach).not.toHaveAttribute('open');
  await coach.locator('summary').click();
  await expect(coach).toContainText('Schlaf, Tagesform und Muskelkater');
  await enterCheckIn(page);

  await mobileNav(page, 'Ernährung').click();
  const quick = page.locator('#xpCQuick');
  await quick.getByRole('button', {name:'Lebensmittel suchen'}).click();
  await expect(page.locator('#query')).toBeFocused();
  await expect(quick.getByRole('button', {name:'Barcode',exact:true})).toBeVisible();
  await quick.getByRole('button', {name:'Favoriten',exact:true}).click();
  await expect(page.locator('#nutfavorites')).toHaveAttribute('open');
  await quick.getByRole('button', {name:'Rezepte',exact:true}).click();
  await expect(page.locator('#nutrecipes')).toHaveAttribute('open');
  await addMeal(page, 'Synthetisches Frühstück', 125);

  await page.locator('#xpEvoDaily').getByRole('button', {name:'Zum Tagebuch'}).click();
  await expect(page.locator('#entries')).toBeFocused();
  await expect(page.locator('#entries')).toContainText('Synthetisches Frühstück');
  expect(await page.evaluate(() => totals(dateKey()).k)).toBe(215);
  await page.getByRole('button', {name:'Vortag',exact:true}).click();
  await expect(page.locator('#xpEvoDaily')).toContainText('ausgewählter Tag');
  await expect(page.locator('#entries')).not.toContainText('Synthetisches Frühstück');
  await page.getByRole('button', {name:'Folgetag',exact:true}).click();
  await expect(page.locator('#entries')).toContainText('Synthetisches Frühstück');
});

test('training prioritizes one set, retains timer and technique, and persists a completed workout', async ({page}) => {
  await ready(page);
  await enterCheckIn(page);
  await startPlannedWorkout(page);
  const card = page.locator('#trainingout .workFocus:visible');
  let current = card.locator(':scope > .setline');
  await expect(current).toHaveCount(1);
  await expect(current.getByRole('button')).toHaveText('Satz 1 abschließen');
  const technique = card.locator('summary').filter({hasText:'Technik & Übungsanimation'});
  await technique.click();
  await expect(card.locator('.guide')).toBeVisible();
  await expect(card.getByRole('button',{name:'Animation starten'})).toBeVisible();
  await technique.click();

  await current.locator('input').first().fill('12');
  const weight = current.locator('input').nth(1);
  if(await weight.count())await weight.fill('10');
  await current.getByRole('button').click();
  await expect.poll(async () => (await canonical(page))?.trainingDraft?.items[0].sets[0]?.done).toBe(true);
  await expect(page.locator('#pauseDisplay')).toBeVisible();
  await page.locator('#pauseDisplay').getByRole('button',{name:'Weiter'}).click();
  await expect(page.locator('#pauseDisplay')).toBeHidden();
  await expect(card.locator(':scope > .setline').getByRole('button')).toHaveText('Satz 2 abschließen');

  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  await mobileNav(page, 'Training').click();
  await expect(card.locator(':scope > .setline').getByRole('button')).toHaveText('Satz 2 abschließen');
  await card.locator('summary').filter({hasText:'Weitere Sätze'}).click();
  await expect(card.getByRole('button',{name:'✓ Abgeschlossen · ändern'})).toBeVisible();
  await page.locator('#trainingout .xpEvoFinish > summary').click();
  const duration=page.getByLabel('Tatsächliche Trainingsdauer (Minuten)');
  await expect(duration).toHaveAttribute('inputmode','decimal');
  const finish=page.locator('#trainingout .traincontrols').getByRole('button',{name:'Training speichern'});
  await duration.fill('0');
  await finish.click();
  expect((await canonical(page)).trainingDraft).toBeTruthy();
  await duration.fill('19');
  await finish.click();
  const confirmation=page.getByRole('dialog',{name:'Teilabschluss speichern'});
  await expect(confirmation).toContainText('1 von 8 Sätzen');
  await confirmation.getByRole('button',{name:'Teilabschluss speichern'}).click();
  await expect(page.getByRole('dialog',{name:'Teilweise absolviert'})).toContainText('1/8 Sätze');
  await expect.poll(async () => (await canonical(page))?.trainingHistory?.[0]?.items[0]?.sets[0]?.reps).toBe(12);
  expect((await canonical(page)).trainingHistory[0].minutes).toBe(19);
  expect((await canonical(page)).trainingDraft).toBeFalsy();
});

test('avatar appearance stays separate from profile calculations and brand controls', async ({page}) => {
  await ready(page);
  await mobileNav(page, 'Profil').click();
  const profile = page.locator('#profile');
  const before = await page.evaluate(async () => ({canonical:await xpIDBRead(),targets:calc(state.p)}));
  const button = profile.getByRole('button',{name:'Weibliche Figur'});
  const selectedImage = profile.locator('#xpProfile .xpBody image');
  const original = await selectedImage.getAttribute('href');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed','true');
  await expect(button).toBeFocused();
  expect(await selectedImage.getAttribute('href')).not.toEqual(original);
  expect(await page.evaluate(async () => ({canonical:await xpIDBRead(),targets:calc(state.p)}))).toEqual(before);
  await profile.locator('summary').filter({hasText:'Körperdaten'}).click();
  await expect(profile.getByLabel('Geschlecht für die Kalorienberechnung')).toHaveValue('m');
  await expect(profile.locator('.xpEvoBrandGroup')).not.toHaveAttribute('open');
  await profile.locator('.xpEvoBrandGroup summary').first().click();
  await expect(profile.locator('#brandPanel')).toBeVisible();
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  await mobileNav(page, 'Profil').click();
  await expect(button).toHaveAttribute('aria-pressed','true');
});

for(const width of [320,375,390,430]){
  test(`evolution mobile walkthrough and screenshots at ${width}px`,async({browser},testInfo)=>{
    const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const page=await context.newPage();
    await ready(page);
    const screenshot=async(name)=>{
      await page.evaluate(()=>window.scrollTo(0,0));
      const viewport=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
      expect(viewport.scrollWidth,`${name} at ${width}px`).toBe(viewport.width);
      const path=testInfo.outputPath(`${width}-${name}.png`);
      await page.screenshot({path,animations:'disabled'});
      await testInfo.attach(`${width} px · ${name}`,{path,contentType:'image/png'});
    };

    await screenshot('heute');
    await enterCheckIn(page);
    await addMeal(page,'Synthetische Haferflocken',125);
    await page.locator('#nutform').evaluate(el=>{el.open=false});
    await screenshot('ernaehrung');
    await mobileNav(page,'Profil').click();
    await screenshot('profil');
    await mobileNav(page,'Fortschritt').click();
    await screenshot('fortschritt');
    await startPlannedWorkout(page);
    await screenshot('training');
    if(width===390){
      const technique=page.locator('#trainingout .workFocus:visible summary').filter({hasText:'Technik & Übungsanimation'});
      await technique.click();
      const visual=page.locator('#trainingout .workFocus:visible .visual64').first();
      await expect(visual).toBeVisible();
      const path=testInfo.outputPath('390-uebungstechnik.png');
      await visual.screenshot({path,animations:'disabled'});
      await testInfo.attach('390 px · Übungstechnik',{path,contentType:'image/png'});
    }
    await context.close();
  });
}

test('muscle map supports keyboard selection and the recovery gate protects an open session',async({page})=>{
  await ready(page);
  await enterCheckIn(page);
  await mobileNav(page,'Training').click();
  await page.getByRole('button',{name:'Individuelles Training · Avatar',exact:true}).click();
  const muscles=page.locator('#xpMusclePanel');
  const hotspot=muscles.locator('[data-xp-hotspot]').first();
  await hotspot.focus();
  const key=await hotspot.getAttribute('data-xp-hotspot');
  await hotspot.press('Enter');
  await expect(muscles.locator(`[data-xp-list="${key}"]`)).toHaveAttribute('aria-pressed','true');
  await muscles.getByRole('button',{name:'Rückseite'}).click();
  await expect(muscles.getByRole('button',{name:'Rückseite'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Muskelwahl schließen'}).click();
  await startPlannedWorkout(page);
  const draft=(await canonical(page)).trainingDraft;
  await mobileNav(page,'Heute').click();
  await page.locator('#xpHome .xpEvoCheck').click();
  await page.locator('#xpSleep').fill('4');
  await page.locator('[data-xp-choice="energy"][data-v="1"]').click();
  await page.locator('[data-xp-choice="soreness"][data-v="4"]').click();
  await page.getByRole('button',{name:'Check-in speichern',exact:true}).click();
  await expect(page.locator('#xpHome .xpEvoFocus')).toContainText('Erholung hat Vorrang');
  await mobileNav(page,'Training').click();
  await expect(page.locator('#trainingout .xpBReviewNotice')).toBeVisible();
  await expect(page.locator('#trainingout .workFocus:visible .setline input').first()).toBeDisabled();
  expect((await canonical(page)).trainingDraft).toEqual(draft);
});

const k1Saturday = new Date('2026-11-21T12:00:00Z');

async function openK1Plan(page, date=k1Saturday) {
  await page.clock.setFixedTime(date);
  await ready(page);
  await enterCheckIn(page);
  await mobileNav(page,'Training').click();
}

async function checkK1Draft(page,day,type) {
  await expect.poll(async()=>{
    const {trainingDraft:draft}=await canonical(page);
    return draft&&[draft.day,draft.type];
  }).toEqual([day,type]);
}

test('K1 Saturday starts Saturday from both default entry points and explicit Monday starts Monday', async ({browser},testInfo) => {
  const contexts=[];
  try {
    for(const entry of ['today','default','monday','today-after-monday']){
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'de-DE'});
      contexts.push(context);
      const page=await context.newPage();
      await openK1Plan(page);
      const quick=page.locator('#xpTrainingChoice [data-today-start]');
      const weekly=page.locator('#trainingout [data-plan-start]');
      await expect(quick).toHaveText('Heute: Samstag · Unterkörper starten');
      await expect(weekly).toHaveText('Samstag · Unterkörper starten');
      if(entry==='monday'||entry==='today-after-monday'){
        await page.getByRole('button',{name:'Montag: Oberkörper, Nicht absolviert',exact:true}).click();
        await expect(weekly).toHaveText('Montag · Oberkörper starten');
        await expect(quick).toHaveText('Heute: Samstag · Unterkörper starten');
        if(entry==='monday'){
          const path=testInfo.outputPath('k1-samstag-und-montag.png');
          await page.screenshot({path,animations:'disabled'});
          await testInfo.attach('Samstag und bewusst ausgewählter Montag',{path,contentType:'image/png'});
        }
      }
      await (entry.startsWith('today')?quick:weekly).click();
      await checkK1Draft(page,entry==='monday'?0:5,entry==='monday'?'upper':'lower');
      await expect(page.locator('#trainingout .workHero')).toHaveAttribute('aria-label',entry==='monday'?'Oberkörper':'Unterkörper');
    }
  } finally {
    await Promise.all(contexts.map(context=>context.close()));
  }
});

test('K1 on Sunday the next Monday remains distinct from training today',async({page})=>{
  await openK1Plan(page,new Date('2026-11-22T12:00:00Z'));
  const choice=page.locator('#xpTrainingChoice');
  await expect(choice.getByRole('heading')).toHaveText('Nächste geplante Einheit');
  await expect(choice.getByRole('button',{name:'Vorzeitig: Montag · Oberkörper starten'})).toBeVisible();
  await choice.getByRole('button',{name:'Vorzeitig: Montag · Oberkörper starten'}).click();
  await checkK1Draft(page,0,'upper');
  let data=await canonical(page);
  expect(data.trainingDraft.date).toBe('2026-11-22');
});

async function recordK1Set(page) {
  const card=page.locator('#trainingout .workFocus:visible');
  const row=card.locator(':scope > .setline.next63');
  await row.locator('input').first().fill('10');
  if(await row.locator('input').count()>1)await row.locator('input').nth(1).fill('12.5');
  await row.getByRole('button',{name:/Satz \d abschließen/}).click();
  const timer=page.locator('#pauseDisplay');
  if(await timer.isVisible())await timer.getByRole('button',{name:'Weiter'}).click();
}

for(const sets of [2,8]){
  test(`K1 ${sets}/8 is consistent in saved result, week and cockpit after reload`,async({page},testInfo)=>{
    await page.setViewportSize({width:390,height:844});
    await openK1Plan(page);
    await page.locator('#trainingout [data-plan-start]').click();
    await checkK1Draft(page,5,'lower');
    const header=page.locator('#trainingout .xpEvoWorkoutHead');
    await expect(header).toContainText('0/8 Sätze');
    for(let i=0;i<sets;i++){
      const active=page.locator('#trainingout .workFocus:visible');
      if(await active.locator(':scope > .setline.next63').count()===0)
        await active.getByRole('button',{name:'Weiter →',exact:true}).click();
      await recordK1Set(page);
      await expect(header).toContainText(`${i+1}/8 Sätze`);
    }

    await page.reload();
    await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
    await mobileNav(page,'Training').click();
    await expect(header).toContainText(`${sets}/8 Sätze`);
    await page.locator('#trainingout .xpEvoFinish > summary').click();
    await page.getByLabel('Tatsächliche Trainingsdauer (Minuten)').fill('19.5');
    const dialogs=[];
    const accept=async dialog=>{dialogs.push(dialog.message());await dialog.accept();};
    page.on('dialog',accept);
    await page.getByRole('button',{name:'Training speichern',exact:true}).click();
    if(sets===2){
      const confirmation=page.getByRole('dialog',{name:'Teilabschluss speichern'});
      await expect(confirmation).toContainText('2 von 8 Sätzen');
      expect((await canonical(page)).trainingHistory||[]).toHaveLength(0);
      await confirmation.getByRole('button',{name:'Teilabschluss speichern'}).click();
    }
    const summary=page.getByRole('dialog',{name:sets===2?'Teilweise absolviert':'Vollständig abgeschlossen'});
    await expect(summary).toContainText(`${sets}/8 Sätze`);
    await expect.poll(async()=>(await canonical(page)).trainingHistory?.length).toBe(1);
    const summaryPath=testInfo.outputPath(`evo21-summary-${sets}-of-8.png`);
    await page.screenshot({path:summaryPath,animations:'disabled'});
    await testInfo.attach(`Gespeicherte Zusammenfassung ${sets}/8`,{path:summaryPath,contentType:'image/png'});
    await summary.getByRole('button',{name:'Ergebnis ansehen'}).click();
    await expect(page.locator('#xpTrainingHistory [data-training-index="0"]')).toBeFocused();
    page.off('dialog',accept);
    expect(dialogs).toEqual([]);

    await page.reload();
    await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
    await mobileNav(page,'Training').click();
    expect((await canonical(page)).trainingDraft).toBeFalsy();
    const saved=(await canonical(page)).trainingHistory[0];
    expect(saved.items.flatMap(item=>item.sets).filter(set=>set.done)).toHaveLength(sets);
    expect(saved.items.filter(item=>item.sets.every(set=>!set.done))).toHaveLength(sets===2?3:0);
    expect(saved.minutes).toBe(19.5);
    const label=sets===2?'Teilweise absolviert':'Vollständig abgeschlossen';
    const choice=page.locator('#xpTrainingChoice');
    await expect(choice.getByRole('heading')).toHaveText(label);
    await expect(choice).toContainText(`${sets}/8 Sätze`);
    await expect(page.getByRole('button',{name:`Samstag: Unterkörper, ${label}`,exact:true})).toBeVisible();
    await mobileNav(page,'Heute').click();
    const tile=page.locator('#xpHome .xpTile').filter({hasText:'Training'});
    await expect(tile).toContainText(label);
    await expect(tile).toContainText(`${sets}/8 Sätze`);
    await tile.click();
    const result=page.locator('#xpTrainingHistory [data-training-index="0"]');
    await expect(result).toBeFocused();
    await expect(result).toContainText(`${label} · ${sets}/8 Sätze`);
    const path=testInfo.outputPath(`k1-${sets}-von-8.png`);
    await page.screenshot({path,animations:'disabled'});
    await testInfo.attach(`Historie ${sets}/8`,{path,contentType:'image/png'});
  });
}

for(const width of [320,375,390,430]){
  test(`K1 food search first hit is tappable without scrolling at ${width}px`,async({browser},testInfo)=>{
    const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,locale:'de-DE'});
    try {
      const page=await context.newPage();
      await ready(page);
      await mobileNav(page,'Ernährung').click();
      const nutrition=page.locator('#nutrition');
      const quick=nutrition.locator('#xpCQuick');
      await expect(nutrition.locator(':scope > .nutquick:visible')).toHaveCount(0);
      await expect(nutrition.getByRole('button',{name:'Lebensmittel suchen',exact:true})).toHaveCount(1);
      await expect(nutrition.getByRole('button',{name:'Selbst eintragen',exact:true})).toHaveCount(1);
      await quick.getByRole('button',{name:'Lebensmittel suchen'}).tap();
      const query=page.getByRole('searchbox',{name:'Name des Lebensmittels'});
      await expect(query).toBeFocused();
      const afterTap=await page.evaluate(()=>scrollY);
      await query.pressSequentially('Haferflocken');
      const result=page.locator('#results').getByRole('button',{name:/Haferflocken/}).first();
      await expect(result).toBeVisible();
      const bounds=await result.evaluate(button=>{
        const rect=button.getBoundingClientRect();
        return {top:rect.top,bottom:rect.bottom,nav:document.querySelector('nav').getBoundingClientRect().top,scroll:scrollY};
      });
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThan(bounds.nav);
      expect(Math.abs(bounds.scroll-afterTap)).toBeLessThanOrEqual(1);
      const path=testInfo.outputPath(`k1-suche-${width}.png`);
      await page.screenshot({path,animations:'disabled'});
      await testInfo.attach(`Erster Treffer bei ${width}px`,{path,contentType:'image/png'});
      await result.tap();
      await expect(page.locator('#foodname')).toHaveValue('Haferflocken, trocken');
      await page.locator('#grams').fill('60');
      await page.locator('#add').tap();
      await expect.poll(async()=>(await canonical(page)).log[await page.evaluate(()=>dateKey())]?.[0]?.g).toBe(60);
      expect(await page.evaluate(()=>Math.round(totals(dateKey()).k))).toBe(222);
    } finally {
      await context.close();
    }
  });
}

test('Evolution 2.1 discard requires accessible confirmation and leaves no history entry',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await openK1Plan(page);
  await page.locator('#trainingout [data-plan-start]').click();
  await checkK1Draft(page,5,'lower');
  await recordK1Set(page);
  await expect.poll(async()=>(await canonical(page)).trainingDraft?.items[0].sets[0].done).toBe(true);
  const draft=(await canonical(page)).trainingDraft;
  await page.getByRole('button',{name:'Zum Abschluss',exact:true}).first().click();
  const discard=page.locator('.traincontrols').getByRole('button',{name:'Abbrechen',exact:true});
  await discard.click();
  const prompt=page.getByRole('dialog',{name:'Training verwerfen'});
  await expect(prompt).toContainText('1 erfasste');
  await expect(prompt.getByRole('button',{name:'Zur Einheit zurück'})).toBeFocused();
  const path=testInfo.outputPath('evo21-verwerfen.png');
  await page.screenshot({path,animations:'disabled'});
  await testInfo.attach('Abbruch mit Schutzabfrage',{path,contentType:'image/png'});
  await page.keyboard.press('Escape');
  await expect(prompt).toBeHidden();
  await expect(discard).toBeFocused();
  expect((await canonical(page)).trainingDraft).toEqual(draft);

  await discard.click();
  await prompt.getByRole('button',{name:'Einheit verwerfen'}).click();
  await expect(page.getByRole('dialog',{name:'Training verworfen'})).toContainText('kein Historieneintrag');
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  const saved=await canonical(page);
  expect(saved.trainingDraft).toBeFalsy();
  expect(saved.trainingHistory||[]).toHaveLength(0);
});

for(const width of [320,375,390,430]){
  test(`Evolution 2.1 diary at ${width}px with reduced height, direct edit and water`,async({browser},testInfo)=>{
    const context=await browser.newContext({viewport:{width,height:510},isMobile:true,hasTouch:true,locale:'de-DE',reducedMotion:'reduce'});
    try {
      const page=await context.newPage();
      await ready(page);
      await mobileNav(page,'Ernährung').click();
      await page.getByRole('button',{name:'Lebensmittel suchen',exact:true}).tap();
      const query=page.getByRole('searchbox');
      await query.pressSequentially('Haferflocken');
      const result=page.locator('#results').getByRole('button',{name:/Haferflocken/}).first();
      expect(await result.evaluate(el=>el.getBoundingClientRect().bottom<document.querySelector('nav').getBoundingClientRect().top)).toBe(true);
      await result.tap();
      await expect(page.locator('#grams')).toBeFocused();
      await expect(page.locator('#xp21Nutrients')).not.toHaveAttribute('open');
      await expect(page.locator('#xp21FoodTitle')).toHaveText('Haferflocken, trocken');
      expect(await page.locator('#add').evaluate(el=>el.getBoundingClientRect().bottom<document.querySelector('nav').getBoundingClientRect().top)).toBe(true);
      const path=testInfo.outputPath(`evo21-menge-${width}.png`);
      await page.screenshot({path,animations:'disabled'});
      await testInfo.attach(`Portion · ${width}px bei 510px Höhe`,{path,contentType:'image/png'});
      await page.locator('#grams').fill('75');
      await page.locator('#add').tap();
      const day=await page.evaluate(()=>dateKey());
      await expect(page.locator('#xp21DiaryStatus')).toContainText('75 g · Gespeichert');
      const panel=page.locator('#xpEvoDaily');
      await panel.getByRole('button',{name:'Letzten Eintrag ändern'}).tap();
      await expect(page.locator('#grams')).toHaveValue('75');
      await page.locator('#grams').fill('60');
      await page.getByRole('button',{name:'Änderung speichern'}).tap();
      await expect(page.locator('#xp21DiaryStatus')).toContainText('60 g · Korrektur gespeichert');
      await panel.getByRole('button',{name:'+250 ml',exact:true}).tap();
      await expect(panel).toContainText('0,25 l');
      await expect.poll(async()=>(await canonical(page)).water[day]).toBe(250);
      await page.reload();
      await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
      const data=await canonical(page);
      expect(data.log[day].map(entry=>[entry.n,entry.g])).toEqual([['Haferflocken, trocken',60]]);
      expect(data.water[day]).toBe(250);
      expect(await page.evaluate(()=>Math.round(totals(dateKey()).k))).toBe(222);
      if(width===390){
        await mobileNav(page,'Ernährung').click();
        await panel.scrollIntoViewIfNeeded();
        const daily=testInfo.outputPath('evo21-tagesbilanz.png');
        await page.screenshot({path:daily,animations:'disabled'});
        await testInfo.attach('Korrigierter Eintrag und Wasser',{path:daily,contentType:'image/png'});
      }
    }finally{await context.close();}
  });
}

test('Evolution 2.1 personal display is immediate, retained and separate from the brand and fitness data',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await ready(page);
  const before=await canonical(page);
  const brandBefore=await page.evaluate(()=>JSON.stringify(brand));
  await mobileNav(page,'Profil').click();
  const display=page.getByLabel('Darstellung',{exact:true});
  await expect(display).toHaveValue('');
  await display.selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  expect(await canonical(page)).toEqual(before);
  expect(await page.evaluate(()=>JSON.stringify(brand))).toBe(brandBefore);
  const path=testInfo.outputPath('evo21-profil-dunkel.png');
  await page.screenshot({path,animations:'disabled'});
  await testInfo.attach('Darstellung im Profil',{path,contentType:'image/png'});
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await mobileNav(page,'Profil').click();
  await display.selectOption('');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});

test('Evolution 2.1 a scheduled draft remains resumable across midnight without changing its recording date',async({page})=>{
  await openK1Plan(page);
  await page.locator('#xpTrainingChoice [data-today-start]').click();
  await checkK1Draft(page,5,'lower');
  await recordK1Set(page);
  await expect.poll(async()=>(await canonical(page)).trainingDraft?.items[0].sets[0].done).toBe(true);
  await page.clock.setFixedTime(new Date('2026-11-22T12:00:00Z'));
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  await mobileNav(page,'Training').click();
  await expect(mobileNav(page,'Training')).toHaveAttribute('aria-current','page');
  await expect(page.locator('#trainingout .xpEvoWorkoutHead')).toContainText('1/8 Sätze');
  await expect(page.locator('#trainingout .workFocus:visible .setline.next63')).toContainText('Satz 2');
  expect((await canonical(page)).trainingDraft.date).toBe('2026-11-21');
  await mobileNav(page,'Fortschritt').click();
  await expect(mobileNav(page,'Fortschritt')).toHaveAttribute('aria-current','page');
  await expect(mobileNav(page,'Training')).not.toHaveAttribute('aria-current','page');
});

test('Evolution 2.1 does not show a success result when durable workout save fails',async({page})=>{
  await openK1Plan(page);
  await page.locator('#xpTrainingChoice [data-today-start]').click();
  await recordK1Set(page);
  await expect.poll(async()=>(await canonical(page)).trainingDraft?.items[0].sets[0].done).toBe(true);
  await page.evaluate(()=>{xpACommit=async()=>{throw Error('Synthetischer Speicherfehler');};});
  await page.getByRole('button',{name:'Zum Abschluss',exact:true}).first().click();
  await page.getByRole('button',{name:'Training speichern',exact:true}).click();
  await page.getByRole('dialog',{name:'Teilabschluss speichern'}).getByRole('button',{name:'Teilabschluss speichern'}).click();
  await expect(page.getByRole('dialog',{name:'Training konnte nicht gespeichert werden'})).toContainText('Entwurf bleibt');
  expect((await canonical(page)).trainingHistory||[]).toHaveLength(0);
  expect((await canonical(page)).trainingDraft.items[0].sets[0].done).toBe(true);
});

test('Evolution 2.1 integrated day from check-in and breakfast to workout history and progress',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'de-DE'});
  try{
    const page=await context.newPage();
    await openK1Plan(page);
    await mobileNav(page,'Ernährung').tap();
    await page.getByRole('button',{name:'Lebensmittel suchen',exact:true}).tap();
    await page.getByRole('searchbox').pressSequentially('Haferflocken');
    await page.locator('#results').getByRole('button',{name:/Haferflocken/}).first().tap();
    await page.getByLabel('Menge (g)').fill('60');
    await page.locator('#add').tap();
    await expect(page.locator('#xp21DiaryStatus')).toContainText('60 g · Gespeichert');
    await page.locator('#xpEvoDaily').getByRole('button',{name:'+250 ml',exact:true}).tap();
    await expect.poll(async()=>(await canonical(page)).water['2026-11-21']).toBe(250);

    await mobileNav(page,'Training').tap();
    await page.locator('#xpTrainingChoice [data-today-start]').tap();
    await checkK1Draft(page,5,'lower');
    await recordK1Set(page);
    await recordK1Set(page);
    await page.getByRole('button',{name:'Zum Abschluss',exact:true}).first().tap();
    await page.getByLabel('Tatsächliche Trainingsdauer (Minuten)').fill('19.5');
    await page.getByRole('button',{name:'Training speichern',exact:true}).tap();
    await page.getByRole('dialog',{name:'Teilabschluss speichern'}).getByRole('button',{name:'Teilabschluss speichern'}).tap();
    const outcome=page.getByRole('dialog',{name:'Teilweise absolviert'});
    await expect(outcome).toContainText('2/8 Sätze · 19,5 Min.');
    await outcome.getByRole('button',{name:'Fertig',exact:true}).tap();
    await expect(page.locator('#xp21HistoryLink')).toBeFocused();
    await page.locator('#xp21HistoryLink').tap();
    await expect(page.locator('[data-training-history-title]')).toBeFocused();
    await mobileNav(page,'Fortschritt').tap();
    await expect(mobileNav(page,'Fortschritt')).toHaveAttribute('aria-current','page');
    await expect(page.getByRole('heading',{name:'Deine Fortschritte',exact:true})).toBeVisible();
    await page.reload();
    await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
    const data=await canonical(page),day='2026-11-21';
    expect(data.coach.days[day].sleep).toBe(8);
    expect(data.log[day].map(entry=>entry.g)).toEqual([60]);
    expect(data.water[day]).toBe(250);
    expect(data.trainingHistory).toHaveLength(1);
    expect(data.trainingHistory[0].minutes).toBe(19.5);
    expect(data.trainingHistory[0].items.flatMap(item=>item.sets).filter(set=>set.done)).toHaveLength(2);
  } finally {await context.close();}
});

async function captureEvolution22(page,testInfo,name){
  const path=testInfo.outputPath(name+'.png');
  await page.screenshot({path,animations:'disabled'});
  await testInfo.attach(name,{path,contentType:'image/png'});
}

test('Evolution 2.2 freezes historic goals through profile changes, midnight, backup and reload',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await page.clock.setFixedTime(k1Saturday);
  await ready(page);
  const date='2026-11-21',next='2026-11-22';
  const initial=await page.evaluate(()=>calc(state.p));
  await addMeal(page,'Historical breakfast',100);
  const original=(await canonical(page)).dayTargets[date];
  expect(original).toMatchObject(initial);
  await mobileNav(page,'Profil').click();
  await page.locator('details:has(#weight) > summary').click();
  await page.locator('#weight').fill('95');
  await expect.poll(async()=> (await canonical(page)).p.weight).toBe(95);
  const changed=await page.evaluate(()=>calc(state.p));
  expect(changed.k).not.toBe(initial.k);
  await addMeal(page,'Same day after profile change',100);
  expect((await canonical(page)).dayTargets[date]).toEqual(original);
  await page.clock.setFixedTime(new Date(next+'T12:00:00Z'));
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  await addMeal(page,'Tomorrow uses changed target',100);
  expect((await canonical(page)).dayTargets[next]).toMatchObject(changed);
  await page.locator('#date').fill(date);
  await expect(page.locator('.xp22Day')).toContainText('bei der ersten Buchung gespeichert');
  await expect(page.locator('.xp22Day')).toContainText(await page.evaluate(k=>fmt(k,0),original.k));
  await page.locator('#date').blur();
  await page.locator('.xp22Day').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  await captureEvolution22(page,testInfo,'evo22-historische-tagesbilanz');
  await mobileNav(page,'Profil').click();
  await page.locator('details:has(#export) > summary').click();
  const pending=page.waitForEvent('download');
  await page.locator('#export').click();
  const json=require('node:fs').readFileSync(await (await pending).path());
  expect(JSON.parse(json).dayTargets[date]).toEqual(original);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#import').setInputFiles({name:'evolution22.json',mimeType:'application/json',buffer:json});
  await expect(page.locator('#importstatus')).toContainText('Sicherung erfolgreich');
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  expect((await canonical(page)).dayTargets).toEqual(JSON.parse(json).dayTargets);
});

test('Evolution 2.2 distinguishes missing, zero, partial and confirmed and reopens changed days',async({page})=>{
  await page.clock.setFixedTime(k1Saturday);
  await ready(page);
  await mobileNav(page,'Ernährung').click();
  const day='2026-11-21',quality=page.locator('.xp22Day');
  await expect(quality).toContainText('Nicht erfasst');
  await expect(quality).toContainText('Zufuhr ist unbekannt');
  await expect(quality.getByRole('button')).toHaveCount(0);
  await page.getByRole('button',{name:/Selbst eintragen/}).click();
  await page.locator('#foodname').fill('Synthetischer Nullwert');
  for(const id of ['fk','fp','fc','ff'])await page.locator('#'+id).fill('0');
  await page.locator('#add').click();
  await expect(page.locator('#xp21DiaryStatus')).toContainText('Gespeichert');
  await expect(quality).toContainText('Teilweise erfasst');
  await expect(quality).toContainText('0 kcal erfasst');
  await quality.getByRole('button',{name:'Tag als vollständig bestätigen'}).click();
  await expect(quality).toContainText('Vollständig bestätigt');
  await expect.poll(async()=>(await canonical(page)).coach.days[day].complete).toBe(true);
  await addMeal(page,'Spätere gültige Ergänzung',100);
  await expect(quality).toContainText('Teilweise erfasst');
  expect((await canonical(page)).coach.days[day].complete).toBe(false);
  await quality.getByRole('button',{name:'Tag als vollständig bestätigen'}).click();
  await expect(quality).toContainText('Vollständig bestätigt');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-nutdelete]').last().click();
  await expect(quality).toContainText('Teilweise erfasst');
  expect((await canonical(page)).coach.days[day].complete).toBe(false);
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  await mobileNav(page,'Ernährung').click();
  await expect(quality).toContainText('Teilweise erfasst');
});

async function seedEvolutionWeeks(page){
  return page.evaluate(async()=>{
    coachData();
    state.trainingHistory ||= [];
    const reference=calc(state.p);
    const different=calc({...state.p,goals:[4],priority:'maintain',kind:'cardio',days:5,minutes:55});
    for(let offset=-14;offset<0;offset++){
      const date=coachDate(offset),previous=offset<=-8,goal=previous?different:reference;
      const recorded=offset>=-12&&offset!==-8;
      state.coach.days[date]={weight:previous?80.5:80,sleep:previous?7:8,energy:4,soreness:0,waist:null,fat:null,
        complete:recorded&&offset!==-2};
      if(!recorded)continue;
      state.water[date]=previous?1500:2000;
      if(offset!==-3) (state.dayTargets||={})[date]={...goal,recordedAt:date+'T12:00:00Z'};
      const k=offset===-4?0:400;
      state.log[date]=[{n:'Synthetischer Tagesmix '+date,_fid:'evo22-week-'+date,k,p:previous?16:24,
        c:35,f:8,g:400,fiber:8,meal:'Frühstück'}];
    }
    const id=exs.find(ex=>ex[1]==='Kniebeuge')?.[0]||exs.find(ex=>!timed(ex)&&ex[0]!=='br')[0];
    for(const [offset,weight,partial] of [[-10,40,false],[-6,45,false],[-1,42,true]]){
      state.trainingHistory.push({date:coachDate(offset),type:'lower',minutes:30,items:[{id,sets:[
        {done:true,reps:8,weight},{done:!partial,reps:8,weight}
      ]}]});
    }
    state.coach.days[dateKey()]={weight:null,waist:null,fat:null,sleep:8,energy:4,soreness:0,complete:false};
    if(!await save('replace'))throw Error('Could not persist synthetic weekly fixture');
    render();
    return {reference,different};
  });
}

for(const width of [320,375,390,430]){
  test(`Evolution 2.2 weekly comparison, missing data and layout at ${width}px`,async({browser},testInfo)=>{
    const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,locale:'de-DE'});
    try{
      const page=await context.newPage();
      page.setDefaultTimeout(10000);
      await page.clock.setFixedTime(new Date('2026-11-22T12:00:00Z'));
      await ready(page);
      const fixture=await seedEvolutionWeeks(page);
      expect(fixture.reference.protein).not.toBe(fixture.different.protein);
      await mobileNav(page,'Fortschritt').tap();
      const week=page.locator('#xp15Progress [data-evo22-week]');
      await expect(week).toContainText('7/7 Tage mit Mahlzeiten · 5/7 vollständig bestätigt und plausibel · 4/7 mit belegtem Ziel');
      await expect(week).toContainText('1 vollständig, 1 teilweise');
      await expect(week).toContainText('+5,0 kg zur Vorwoche');
      const format=await page.evaluate(({reference,different})=>{
        const p=96/reference.protein*100,prev=64/different.protein*100;
        return {k:fmt(1600/reference.k*100,0),p:fmt(p,0),delta:fmt(p-prev,0)};
      },fixture);
      await expect(week.getByRole('listitem').filter({hasText:'Protein'})).toContainText(`${format.p} % vom jeweiligen Tagesziel · +${format.delta} Pp.`);
      await expect(week.getByRole('listitem').filter({hasText:'Kalorien'})).toContainText(`${format.k} %`);
      const viewport=await page.evaluate(()=>({actual:document.documentElement.scrollWidth,expected:document.documentElement.clientWidth}));
      expect(viewport).toEqual({actual:width,expected:width});
      if(width===390)await captureEvolution22(page,testInfo,'evo22-wochenrueckblick');
      await week.getByText('Gewicht, Wasser & Erholung').tap();
      await expect(week).toContainText('2.000,0 ml');
      await expect(week).toContainText('-0,5 kg zur Vorwoche');
      await expect(week).toContainText('+1,0 h zur Vorwoche');
      await page.locator('#xp15Progress').getByText('Details & Diagramme',{exact:true}).tap();
      const range=page.getByLabel('Zeitraum der Übersicht');
      await range.selectOption('14');
      await expect(range).toBeVisible();
      await expect(range).toHaveValue('14');
      const advice=await page.evaluate(()=>({advice:xp15Advice(),analysis:coachAnalysis()}));
      expect(advice.advice.title).toBe('Ernährungsdaten prüfen');
      expect(advice.analysis.step).toBe(0);
      await mobileNav(page,'Ernährung').tap();
      await page.locator('#date').fill('2026-11-19');
      await expect(page.locator('.xp22Day')).toContainText('Historisches Ziel nicht belegt');
      await expect(page.locator('.xp22Day')).toContainText('96,0 g Protein');
      await page.locator('#date').fill('2026-11-18');
      await expect(page.locator('.xp22Day')).toContainText('Von Auswertungen ausgeschlossen');
      await page.evaluate(async()=>{
        const rejected=coachDate(-4);
        state.log[rejected]=[];
        state.coach.days[rejected].complete=false;
        if(!await save('replace'))throw Error('Could not remove synthetic contradictory entry');
        render();
      });
      expect((await page.evaluate(()=>xp15Advice())).title).toBe('Deine Woche entwickelt sich');
      await mobileNav(page,'Heute').tap();
      await expect(page.locator('#xpHome .xp12Focus')).toContainText('Deine Woche entwickelt sich');
      if(width===390)await captureEvolution22(page,testInfo,'evo22-coach-tagesfokus');
      await page.evaluate(async()=>{
        state.coach.days[dateKey()].sleep=4;
        if(!await save())throw Error('Unable to persist synthetic poor recovery');
        render();
      });
      expect((await page.evaluate(()=>xp15Advice())).title).toBe('Erholung hat Vorrang');
    }finally{await context.close();}
  });
}

test('Evolution 2.2 restores an unbooked portion without creating or duplicating a meal',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:680});
  await ready(page);
  await mobileNav(page,'Ernährung').click();
  await page.getByRole('button',{name:'Lebensmittel suchen',exact:true}).click();
  await page.getByRole('searchbox').fill('Haferflocken');
  await page.locator('#results').getByRole('button',{name:/Haferflocken/}).first().click();
  await page.locator('#grams').fill('73');
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  await mobileNav(page,'Ernährung').click();
  await expect(page.locator('#grams')).toHaveValue('73');
  await expect(page.locator('#fooderror')).toHaveText(/Ungespeicherte Portion wiederhergestellt/);
  expect(Object.values((await canonical(page)).log).flat()).toHaveLength(0);
  await page.locator('#fooderror').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  await captureEvolution22(page,testInfo,'evo22-portion-wiederhergestellt');
  await page.locator('#add').click();
  await expect(page.locator('#xp21DiaryStatus')).toContainText('73 g · Gespeichert');
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  expect(Object.values((await canonical(page)).log).flat().map(row=>row.g)).toEqual([73]);
  expect(await page.evaluate(()=>xp22ReadPortion())).toBeNull();
});

test('Evolution 2.2 pause uses an absolute deadline through reload, background jump and expiration',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await openK1Plan(page);
  await page.locator('#xpTrainingChoice [data-today-start]').click();
  const row=page.locator('#trainingout .workFocus:visible > .setline.next63');
  await row.locator('input').first().fill('10');
  await row.locator('input').nth(1).fill('12.5');
  await row.getByRole('button',{name:/Satz \d abschließen/}).click();
  await expect(page.locator('#pauseDisplay')).toBeVisible();
  await expect.poll(async()=>(await canonical(page)).trainingDraft.items[0].sets[0].done).toBe(true);
  const timer=await page.evaluate(()=>JSON.parse(fitStore161.getItem('fitnesslab-pause')));
  expect(timer.end).toBeGreaterThan(k1Saturday.getTime()+15000);
  await page.clock.setFixedTime(new Date(timer.end-17000));
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  await mobileNav(page,'Training').click();
  await expect(page.locator('#pauseDisplay')).toContainText('0:17');
  await captureEvolution22(page,testInfo,'evo22-pausentimer');
  await page.clock.setFixedTime(new Date(timer.end+1000));
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#pauseDisplay')).toBeHidden();
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  await mobileNav(page,'Training').click();
  await expect(page.locator('#pauseDisplay')).toBeHidden();
  expect((await canonical(page)).trainingDraft.items[0].sets[0].done).toBe(true);
});

test('Evolution 2.2 normal text and selected controls contrast across all main screens and themes',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await ready(page);
  await addMeal(page,'Kontrast-Testmahlzeit',100);
  const modes=[['light','light','#ffffff'],['dark','dark','#000000'],['dark','dark','#176f58'],['auto','dark','#ff7700'],['auto','light','#ffff00']];
  const screens=[
    ['Heute','#xpHome .xp12Focus h2,#xpHome .xpMainAction,nav [aria-current="page"]'],
    ['Ernährung','#xpCQuick button,.xp22Day strong,.xp22Day p,.xp22Day small,.xp22Day button,#xpEvoDaily button,.nutquick button'],
    ['Training','#xpTrainingChoice h3,#xpTrainingChoice button'],
    ['Fortschritt','#xp15Progress .xp22Week h3,#xp15Progress .xp22Period,#xp15Progress .xp22Focus strong,#xp15Progress .xp22Week summary'],
    ['Profil','#xpDisplayTheme,label[for="xpDisplayTheme"]']
  ];
  for(const [setting,scheme,primary] of modes){
    await page.emulateMedia({colorScheme:scheme});
    await mobileNav(page,'Profil').click();
    await page.evaluate(color=>{brand=normalizeBrand({...brand,primary:color});applyBrand();},primary);
    await page.locator('#xpDisplayTheme').selectOption(setting);
    await expect(page.locator('html')).toHaveAttribute('data-theme',scheme);
    for(const [screen,selector] of screens){
      await mobileNav(page,screen).click();
      const values=await page.locator(selector).evaluateAll(elements=>{
        const channels=(color)=>color.match(/[\d.]+/g)?.map(Number);
        const overlay=(top,below)=>below.map((base,i)=>base*(1-(top[3]??1))+top[i]*(top[3]??1));
        const lum=(rgb)=>[0.2126,0.7152,0.0722].reduce((total,factor,i)=>{
          const s=rgb[i]/255;
          return total+factor*(s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4);
        },0);
        return elements.flatMap(el=>{
          if(!el.getClientRects().length||!el.textContent.trim()&&el.tagName!=='SELECT')return [];
          const chain=[];
          for(let node=el;node;node=node.parentElement)chain.unshift(node);
          const omitted=chain.some(node=>getComputedStyle(node).backgroundImage!=='none');
          if(omitted)return [];
          const bg=chain.reduce((below,node)=>overlay(channels(getComputedStyle(node).backgroundColor),below),[255,255,255]);
          const text=overlay(channels(getComputedStyle(el).color),bg);
          const ratios=[lum(bg),lum(text)].sort((a,b)=>b-a);
          return [{control:el.textContent.trim().slice(0,70),ratio:(ratios[0]+0.05)/(ratios[1]+0.05)}];
        });
      });
      expect(values.length,`${screen} provides measurable controls in ${scheme}`).toBeGreaterThan(0);
      for(const value of values)expect(value.ratio,`${screen}, ${scheme} ${primary}, ${value.control}`).toBeGreaterThanOrEqual(4.5);
      if(screen==='Ernährung'&&setting==='dark'&&primary==='#176f58'){
        for(const height of await page.locator('.nutquick button:visible').evaluateAll(list=>list.map(el=>el.getBoundingClientRect().height)))
          expect(height).toBeGreaterThanOrEqual(44);
        await page.locator('.xp22Day').scrollIntoViewIfNeeded();
        await captureEvolution22(page,testInfo,'evo22-kontrast-dunkel');
      }
    }
  }
});

for(const [previousVersion,old] of [['3.3 STORY ACCESS','0e30e98b34092b5d7018ce78f98393288456fcc6'],['2.1','b4604bb056feee3c074e123186baba88bc2cfe25'],['2.2','20a78aaba9fcf9713292fa4b45d43e5fc534da30']])
test(`Atlas V2 real service worker update from ${previousVersion} keeps data and an offline write survives reload`,async({browser})=>{
  const {createServer}=require('node:http');
  const {execFileSync}=require('node:child_process');
  const fs=require('node:fs');
  const versions=Object.fromEntries(['/','/index.html','/sw.js'].map(path=>{
    const file=path==='/'?'index.html':path.slice(1);
    return [path,[execFileSync('git',['show',old+':'+file],{maxBuffer:4*1024*1024}),fs.readFileSync(file)]];
  }));
  const assets={'/media/scenes/nutrition.webp':'image/webp','/media/scenes/recovery.webp':'image/webp','/premium-ux.css':'text/css','/first-impression.css':'text/css','/cinematic.css':'text/css','/cinematic.js':'text/javascript','/exercise-atlas.js':'text/javascript','/brand.js':'text/javascript','/manifest.json':'application/json','/icon-180.png':'image/png','/icon-192.png':'image/png','/icon-512.png':'image/png'};
  for(const id of ['sq','bp','row','oh','lu'])assets['/media/poses/'+id+'.webp']='image/webp';
  for(const name of ['path','strength'])assets['/media/scenes/'+name+'.webp']='image/webp';
  let version=0;
  const server=createServer((req,res)=>{
    const route=new URL(req.url,'http://localhost').pathname;
    const hasVersion=Object.hasOwn(versions,route);
    if(!hasVersion&&!Object.hasOwn(assets,route)){res.writeHead(404).end();return;}
    res.writeHead(200,{'Cache-Control':'no-store','Content-Type':hasVersion?(route.endsWith('.js')?'text/javascript':'text/html; charset=utf-8'):assets[route]});
    res.end(hasVersion?versions[route][version]:fs.readFileSync(route.slice(1)));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  let context;
  try{
    context=await browser.newContext({baseURL:`http://127.0.0.1:${server.address().port}`,serviceWorkers:'allow'});
    const page=await context.newPage();
    await ready(page);
    await expect(page.locator('#appVersion')).toContainText('EVOLUTION '+previousVersion);
    await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
    if(previousVersion==='2.2'){
      await page.clock.setFixedTime(new Date('2026-11-23T12:00:00Z'));
      const original=await page.evaluate(()=>{
        const copy=structuredClone(state);
        try{
          const small=calc({...state.p,weight:48,height:160,age:55,sex:'f',days:0,kind:'mobility',goals:[0]});
          Object.assign(state.p,{age:38,goals:[2],priority:'gain',kind:'strength'});
          const target=calc(state.p);coachData();
          for(let i=1;i<=5;i++){
            const d=coachDate(-i);
            state.log[d]=[{n:'Synthetischer Rückvergleich',g:100,k:325,p:10,c:60,f:5,meal:'Mittagessen'}];
            state.coach.days[d]={complete:true};(state.dayTargets||={})[d]=target;
          }
          state.coach.days[dateKey()]={sleep:8,energy:4,soreness:0};
          return {k:small.k,action:xp15Advice().action,canStart:xpBTrainingState().canStart};
        }finally{state=copy;}
      });
      expect(original).toEqual({k:1100,action:'xpTrainingGo()',canStart:true});
    }
    await addMeal(page,'Pre-update synthetic 2.1',115);
    const prior=await canonical(page),previousController=await page.evaluate(()=>navigator.serviceWorker.controller.scriptURL);
    expect(previousController).toMatch(/\/sw\.js$/);
    version=1;
    await page.evaluate(async()=>{
      window.testControllerChanged=false;
      navigator.serviceWorker.addEventListener('controllerchange',()=>window.testControllerChanged=true,{once:true});
      await (await navigator.serviceWorker.ready).update();
    });
    await page.waitForFunction(()=>window.testControllerChanged);
    await page.waitForFunction(async previous=>{
      const keys=await caches.keys();
      return keys.some(key=>key.endsWith('evolution-3-4-natural-flow'))&&!keys.some(key=>key.endsWith('evolution-'+previous.toLowerCase().replace(/[. ]/g,'-')));
    },previousVersion);
    await page.reload();
    await expect(page.locator('#appVersion')).toHaveText('EXP 1.6.2 EVOLUTION 3.4 NATURAL FLOW');
    await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
    expect(await canonical(page)).toEqual(prior);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#appVersion')).toHaveText('EXP 1.6.2 EVOLUTION 3.4 NATURAL FLOW');
    await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
    await addMeal(page,'Post-update offline 2.2',116);
    await page.reload();
    await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
    expect(Object.values((await canonical(page)).log).flat().map(x=>[x.n,x.g])).toEqual([
      ['Pre-update synthetic 2.1',115],['Post-update offline 2.2',116]
    ]);
  }finally{
    await context?.close();
    await new Promise(resolve=>server.close(resolve));
  }
});

test('Evolution 2.3 profile boundaries, manual changes and unmodified reference macros',async({page})=>{
  await ready(page);
  const result=await page.evaluate(()=>{
    const p={...state.p,weight:48,height:160,age:55,sex:'f',days:0,kind:'mobility',goals:[0],priority:'auto'};
    const normal={...state.p,weight:80,height:180,age:38,sex:'m',kind:'strength',goals:[2],priority:'gain'};
    return {unsafe:[p,{...p,weight:47},{...p,weight:50},{...p,goals:[6],priority:'maintain',adjust:-200},
      {...normal,age:17},{...normal,age:19},{...normal,restricted:true},{...normal,height:''}].map(x=>calc(x)),
      maintain:calc({...p,goals:[6],priority:'maintain'}),normal:calc(normal)};
  });
  expect(result.unsafe).toEqual(Array(8).fill(null));
  expect(result.maintain.k).toBeGreaterThan(1200);
  expect(result.normal).toMatchObject({k:2550,protein:144,carbs:309,fat:82});
  await page.evaluate(()=>{Object.assign(state.p,{weight:48,height:160,age:55,sex:'f',days:0,kind:'mobility'});render();tab('today');});
  await expect(page.locator('#xpHome .xp12Focus')).toContainText('Profil und Ziel prüfen');
  await page.locator('#xpHome .xpMainAction').click();
  await expect(page.locator('#profile')).toBeVisible();
});

test('Evolution 2.3 five confirmed low days preempt every start and link to the actual diary',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await ready(page);
  await page.clock.setFixedTime(new Date('2026-11-23T12:00:00Z'));
  const d=await page.evaluate(async()=>{
    coachData();const goal=calc(state.p);
    for(let i=1;i<=5;i++){
      const date=coachDate(-i);
      state.log[date]=[{_fid:'low-'+i,n:'Synthetischer Tagesmix',g:100,k:325,p:10,c:60,f:5,meal:'Mittagessen'}];
      (state.dayTargets||={})[date]={...goal,recordedAt:date+'T08:00:00Z'};state.coach.days[date]={weight:null,waist:null,fat:null,sleep:null,energy:null,soreness:null,complete:false};
    }
    if(safetyAdvice()?.hold)throw Error('Partial entries must not establish low intake');
    for(let i=1;i<=5;i++)state.coach.days[coachDate(-i)].complete=true;
    state.coach.days[dateKey()]={weight:null,waist:null,fat:null,sleep:8,energy:5,soreness:0,complete:false};
    if(!await save('replace'))throw Error('Failed to save fixture');
    render();return coachDate(-1);
  });
  await page.reload();await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  await expect(page.locator('#xpHome .xp12Focus')).toContainText('Ernährung vor dem Training prüfen');
  await captureEvolution22(page,testInfo,'evo23-ernaehrung-pruefen');
  await page.locator('#xpHome .xpMainAction').click();await expect(page.locator('#date')).toHaveValue(d);
  await expect(page.locator('.xp22Day')).toContainText('325 kcal');
  await mobileNav(page,'Heute').click();
  await page.locator('#xpHome .xpTile').filter({hasText:'Coach'}).click();
  await expect(page.locator('#date')).toBeVisible();await expect(page.locator('#date')).toHaveValue(d);
  page.on('dialog',dialog=>dialog.accept());
  const gates=await page.evaluate(()=>{startTraining();beginAt(0,0);xpStartToday();xp13Start();
    return {draft:!!state.trainingDraft,open:xpBTrainingState().canStart,goal:calc(state.p),days:nutritionReview(state).count};});
  expect(gates).toEqual({draft:false,open:false,goal:null,days:5});
  await mobileNav(page,'Fortschritt').click();await expect(page.locator('#xp15Progress .xp22Focus')).toContainText('Portionen');
});

test('Evolution 2.3 median and dated correction preserve the original measurement until saved',async({page},testInfo)=>{
  await page.setViewportSize({width:375,height:812});await ready(page);
  const d=await page.evaluate(async()=>{coachData();
    for(let i=1;i<=14;i++)state.coach.days[coachDate(-i)]={weight:i===3?95:80,waist:null,fat:null,sleep:null,energy:null,soreness:null,complete:false};
    if(!await save('replace'))throw Error('Failed to save weights');render();return coachDate(-3);
  });
  await mobileNav(page,'Fortschritt').click();
  await expect(page.locator('#xp15Progress .xp22Focus')).toContainText('95,0 kg');
  await captureEvolution22(page,testInfo,'evo23-gewicht-pruefen');
  expect((await canonical(page)).coach.days[d].weight).toBe(95);
  await page.locator('#xp15Progress .xp22Focus button').click();await expect(page.locator('#coachdate')).toHaveValue(d);
  await expect(page.locator('#coach-weight')).toBeFocused();await page.locator('#coach-weight').fill('80');
  await page.evaluate(()=>coachSave());
  await expect.poll(async()=>(await canonical(page)).coach.days[d].weight).toBe(80);
  expect(await page.evaluate(()=>({issue:trendAdvice(),trend:coachAnalysis().trend}))).toEqual({issue:null,trend:0});
});

test('Evolution 2.3 historical inconsistency opens the exact entry and missing data do not imply zero',async({page})=>{
  await ready(page);await page.clock.setFixedTime(new Date('2026-11-22T12:00:00Z'));await seedEvolutionWeeks(page);
  await mobileNav(page,'Heute').click();await page.locator('#xpHome .xpMainAction').click();
  await expect(page.locator('#date')).toHaveValue('2026-11-18');
  await expect(page.locator('.xp22Day')).toContainText('Von Auswertungen ausgeschlossen');
  await expect(page.locator('[data-nutedit]').first()).toBeFocused();
  expect(await page.evaluate(()=>{const d=xp22Day(coachDate(-20));return [d.confirmed,d.label,nutritionReview(state).low]})).toEqual([false,'Nicht erfasst',null]);
});

test('Evolution 2.3 six long training days prioritize recovery without changing goals',async({page})=>{
  await ready(page);
  const signals=await page.evaluate(()=>{
    const p={...state.p};const baseline=calc(p);
    const session={type:'full',minutes:100,items:[{id:'sq',sets:[{done:true,reps:8,weight:10}]}]};
    state.trainingHistory=Array.from({length:5},(_,i)=>({...session,date:coachDate(-i)}));
    const short=loadReview(state);state.trainingHistory.push({...session,date:coachDate(-5)});
    return {short,locked:xpBTrainingState().locked,title:xp15Advice().title,target:calc(p).k,baseline:baseline.k};
  });
  expect(signals.short).toBe(false);expect(signals.locked).toBe(true);expect(signals.title).toBe('Belastung prüfen');expect(signals.target).toBe(signals.baseline);
});

test('Evolution 2.3 comparable macro estimates for strength, recomp, maintenance and cardio',async({page})=>{
  await ready(page);
  const x=await page.evaluate(()=>{
    const baseline={...state.p,weight:80,height:180,age:38,sex:'m',kind:'strength'};
    return [[0],[0,2],[6],[4]].map((goals,i)=>{
      const r=calc({...baseline,goals,kind:i===3?'cardio':'strength'});
      return [r.k,r.protein,r.carbs,r.fat];
    });
  });
  expect(x.slice(0,3)).toEqual([[2100,162,212,67],[2100,170,204,67],[2350,128,291,75]]);
  expect(x[3][0]).toBe(2350);expect(x[3][3]).toBeLessThan(x[2][3]);
});

test('Evolution 2.3 relative intake boundary, missing targets and short weight series',async({page})=>{
  await ready(page);
  const results=await page.evaluate(()=>{
    coachData();const ref=calc(state.p);
    const snapshot=()=>({low:!!nutritionReview(state).low,trend:coachAnalysis().trend,weight:trendAdvice()});
    const results=[];
    for(let i=1;i<=3;i++){
      const date=coachDate(-i);
      state.coach.days[date]={weight:i===1?95:80,complete:true};
      state.log[date]=[{n:'Synthetische Portion',g:300,k:300,p:15,c:42,f:8,meal:'Mittagessen'}];
      (state.dayTargets||={})[date]={...ref,k:2000};results.push(snapshot());
    }
    delete state.dayTargets[coachDate(-1)];results.push(snapshot());
    return results;
  });
  expect(results.map(x=>x.low)).toEqual([false,false,true,false]);
  expect(results.every(x=>x.trend===null&&x.weight===null)).toBe(true);
});

test('Evolution 2.3 existing deficit snapshot is retained for history but cannot bypass a changed profile',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await ready(page);
  await addMeal(page,'Synthetischer Frühstückseintrag',100);
  const key=await page.evaluate(()=>dateKey()),snapshot=(await canonical(page)).dayTargets[key];
  expect(snapshot.delta).toBeLessThan(0);
  await mobileNav(page,'Profil').click();
  for(const [id,value] of [['weight','48'],['height','160'],['age','55']]){
    await page.locator('#'+id).evaluate(el=>{for(let p=el;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true});
    await page.locator('#'+id).fill(value);
  }
  await expect.poll(async()=>(await canonical(page)).p.weight).toBe(48);
  await page.reload();await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  await expect(page.locator('#xpHome .xp12Focus')).toContainText('Profil und Ziel prüfen');
  await page.locator('#xpHome .xpEvoCoach summary').click();
  await captureEvolution22(page,testInfo,'evo23-profilschutz');
  expect((await canonical(page)).dayTargets[key]).toEqual(snapshot);
  expect(await page.evaluate(()=>xp22Target(dateKey()))).toBeNull();
  expect(await page.evaluate(()=>{const s=structuredClone(state);s.p.goals=[6];s.p.priority='maintain';
    return {current:calc(s.p,s)?.k,saved:xp22Target(dateKey(),s)};})).toMatchObject({saved:null});
});

test('Evolution 2.3 food protection preserves a logged set in an open workout after reload',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await openK1Plan(page);
  await page.locator('#trainingout [data-plan-start]').click();await checkK1Draft(page,5,'lower');await recordK1Set(page);
  const draft=(await canonical(page)).trainingDraft;
  await page.evaluate(async()=>{
    const date=coachDate(-1);coachData();
    state.log[date]=[{n:'Synthetischer Tag',_fid:'review-draft-food',g:100,k:325,p:10,c:60,f:5,meal:'Abendessen'}];
    state.coach.days[date]={weight:null,waist:null,fat:null,sleep:null,energy:null,soreness:null,complete:true};
    if(!await save('replace'))throw Error('Failed to persist review fixture');
  });
  await page.reload();await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0);
  await mobileNav(page,'Training').click();await expect(page.locator('#trainingout .xpBReviewNotice')).toBeVisible();
  await expect(page.locator('#trainingout .workFocus:visible .setline input').first()).toBeDisabled();
  expect((await canonical(page)).trainingDraft).toEqual(draft);
  await captureEvolution22(page,testInfo,'evo23-trainingspruefung');
  await page.locator('#trainingout .xpEvoFinish > summary').click();await page.getByLabel('Tatsächliche Trainingsdauer (Minuten)').fill('12');
  await page.getByRole('button',{name:'Training speichern',exact:true}).click();
  await page.getByRole('dialog',{name:'Teilabschluss speichern'}).getByRole('button',{name:'Teilabschluss speichern'}).click();
  await expect.poll(async()=>(await canonical(page)).trainingHistory?.at(-1)?.items).toEqual(draft.items);
});

test('Evolution 2.3 persistent protein gaps lead to a dated meal review without celebrating low energy',async({page})=>{
  await ready(page);await page.clock.setFixedTime(new Date('2026-11-22T12:00:00Z'));await seedEvolutionWeeks(page);
  const day=await page.evaluate(()=>{
    const clean=coachDate(-4);delete state.log[clean];state.coach.days[clean].complete=false;
    for(const d of xp22Week(0).days.filter(x=>x.rows)){
      state.log[d.date][0]={...state.log[d.date][0],k:300,p:10,c:46,f:8};
    }
    render();return coachDate(-1);
  });
  await mobileNav(page,'Heute').click();const focus=page.locator('#xpHome .xp12Focus');
  await expect(focus).toContainText('Proteinversorgung prüfen');
  await focus.locator('.xpMainAction').click();await expect(page.locator('#date')).toHaveValue(day);
  await mobileNav(page,'Fortschritt').click();await expect(page.locator('#xp15Progress .xp22Focus')).toContainText('Proteinziels');
});

test('Evolution 2.3 performance action focuses the same comparable lift named by the coach',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await ready(page);await page.clock.setFixedTime(new Date('2026-11-22T12:00:00Z'));
  await seedEvolutionWeeks(page);
  await page.evaluate(()=>{
    state.log={};state.dayTargets={};
    for(const d of Object.values(state.coach.days))d.complete=false;
    render();tab('today');
  });
  await expect(page.locator('#xpHome .xpEvoFocus')).toContainText('Vergleichbaren Satz ansehen');
  await page.locator('#xpHome .xpMainAction').click();
  const detail=page.locator('#xp15Progress [data-performance]');
  await expect(detail.locator('summary')).toBeFocused();
  await expect(detail).toContainText('Kniebeuge: 45,0 kg bei 8 Wdh. · +5,0 kg');
  await captureEvolution22(page,testInfo,'evo23-leistungsvergleich');
});


test('Evolution 3 exercise atlas searches equipment and opens a technique preview without changing stored fitness data',async({page})=>{
  await ready(page);
  const before=await canonical(page);
  await page.evaluate(()=>tab('training'));
  const atlas=page.locator('#xp3Atlas');
  await expect(atlas).toBeVisible();
  await atlas.locator('summary').click();
  const count=await page.evaluate(()=>window.fitlabAtlas3.getCount());
  expect(count).toBeGreaterThan(15);
  await atlas.locator('#xp3AtlasSearch').fill('Kniebeuge');
  await expect(atlas.locator('#xp3AtlasList button')).toHaveCount(1);
  await atlas.locator('#xp3AtlasList button').first().click();
  await expect(atlas.locator('#xp3AtlasDetail h3')).toContainText('Kniebeuge');
  await expect(atlas.locator('.visual64 svg')).toHaveCount(1);
  await expect(atlas.locator('.xp3AtlasHistory')).toContainText('Noch keine abgeschlossenen Sätze');
  await atlas.locator('#xp3AtlasSearch').fill('');
  await atlas.locator('#xp3AtlasEquipment').selectOption('owned');
  await expect(atlas.locator('#xp3AtlasCount')).toContainText('mit deinem Equipment');
  const owned=await atlas.locator('#xp3AtlasList button').count();
  expect(owned).toBeGreaterThan(0);
  expect(owned).toBeLessThanOrEqual(count);
  await expect.poll(async()=>JSON.stringify(await canonical(page))).toBe(JSON.stringify(before));
});

test('Evolution 3 exercise atlas supports no-animation exercises and 320px reduced-motion view',async({page})=>{
  await page.setViewportSize({width:320,height:640});
  await page.emulateMedia({reducedMotion:'reduce'});
  await ready(page);
  await page.evaluate(()=>tab('training'));
  const atlas=page.locator('#xp3Atlas');
  await atlas.locator('summary').click();
  await page.evaluate(()=>{ delete motion64.sq; });
  await atlas.locator('#xp3AtlasList button[data-ex="sq"]').click();
  await expect(atlas.locator('#xp3AtlasDetail')).toContainText('keine geprüfte Bewegungssequenz');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('Five atlas motion plates support playback and static poses without training writes',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await ready(page);
  const before=await canonical(page);
  await page.evaluate(()=>tab('training'));
  const atlas=page.locator('#xp3Atlas');
  await atlas.locator('summary').click();
  for(const id of ['sq','bp','row','oh','lu']){
    await atlas.locator('[data-ex="'+id+'"]').click();
    const plate=atlas.locator('.visual64');
    const image=plate.locator('[data-pose-image]');
    await expect(image).toHaveAttribute('href','media/poses/'+id+'.webp');
    await expect(image).toHaveAttribute('x','0');
    await plate.locator('.play64').click();
    await expect(plate.locator('.play64')).toHaveText('Animation pausieren');
    await expect(image).toHaveAttribute('x','-480');
    await plate.locator('.play64').click();
    await expect(plate.locator('.play64')).toHaveText('Animation starten');
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:320,height:680});
  const box=atlas.locator('.visual64');
  await expect(box.locator('.play64')).toBeHidden();
  const caption=await box.locator('.stage64').innerText();
  await box.locator('.step64').click();
  await expect(box.locator('.stage64')).not.toHaveText(caption);
  await atlas.getByRole('button',{name:'Muskelkarte ansehen'}).click();
  await expect(atlas.locator('.xpBody .selected')).not.toHaveCount(0);
  await atlas.getByRole('button',{name:'Rückansicht zeigen'}).click();
  await expect(atlas.locator('.xpBody')).toHaveAttribute('aria-label',/Rückansicht/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await canonical(page)).toEqual(before);
});


test('Evolution 3 premium UX stylesheet loads across five sections at small viewport',async({page})=>{
  await page.setViewportSize({width:320,height:700});
  await ready(page);
  const css=await page.evaluate(()=>[...document.styleSheets].some(x=>x.href?.includes('premium-ux.css')));
  expect(css).toBe(true);
  const steps=[()=>page.evaluate(()=>tab('today')),()=>page.evaluate(()=>tab('nutrition')),()=>page.evaluate(()=>tab('training')),()=>page.evaluate(()=>{xpOpen('progress');tab('today');xpOpen('progress')}),()=>page.evaluate(()=>tab('profile'))];
  for(const visit of steps){
    await visit();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  const nav=page.locator('.nav button').first();
  await expect(nav).toHaveCSS('min-height','54px');
});

test('Evolution 3 premium UX respects reduced motion without altering fitness data',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await ready(page);
  const before=await canonical(page);
  const reduced=await page.evaluate(()=>getComputedStyle(document.querySelector('button')).transitionDuration);
  expect(parseFloat(reduced)).toBeLessThan(0.01);
  await page.evaluate(()=>tab('nutrition'));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await canonical(page)).toEqual(before);
});

test('iPhone onboarding: numeric keystrokes do not permanently block saving', async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0,{timeout:20000});
  await page.evaluate(()=>{tab('profile');xp12Step=1;xp12WizardUI()});
  await expect(page.locator('#bodyfields')).toBeVisible();
  for(const [id,partial,complete] of [['height','1','178'],['age','3','39'],['weight','9','90']]){
    await page.locator('#'+id).fill(partial);
    await expect(page.locator('#'+id)).toHaveAttribute('aria-invalid','true');
    expect(await page.evaluate(()=>xpABlocked)).toBe(false);
    await page.locator('#'+id).fill(complete);
    await expect(page.locator('#'+id)).not.toHaveAttribute('aria-invalid','true');
    await expect.poll(async()=>Number((await canonical(page)).p[id])).toBe(Number(complete));
  }
  await expect(page.locator('#xpAStorageAlert')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0,{timeout:20000});
  const saved=await canonical(page);
  expect(saved.p.height).toBe(178);
  expect(saved.p.age).toBe(39);
  expect(saved.p.weight).toBe(90);
  expect(await page.evaluate(()=>xpABlocked)).toBe(false);
});


test('Evolution 3 mobile wizard points to incomplete body fields instead of silently continuing',async({page})=>{
 await page.setViewportSize({width:390,height:650});
 await ready(page);
 await page.evaluate(()=>{tab('profile');xp12Step=1;xp12WizardUI()});
 await expect(page.locator('#bodyfields')).toBeVisible();
 await page.locator('#weight').fill('90');
 await page.locator('#height').fill('1');
 await page.evaluate(()=>xp12Advance());
 await expect(page.locator('#xp12Message')).toBeVisible();
 await expect(page.locator('#height')).toBeFocused();
 expect(await page.evaluate(()=>xp12Step)).toBe(1);
 expect(await page.evaluate(()=>xpABlocked)).toBe(false);
 await page.locator('#height').fill('178');
 await page.locator('#age').fill('39');
 await page.locator('#sex').selectOption('m');
 await page.evaluate(()=>xp12Advance());
 expect(await page.evaluate(()=>xp12Step)).toBe(2);
 await expect(page.locator('#xpAStorageAlert')).toHaveCount(0);
});

test('Evolution 3 mobile numeric keyboard follows body field order',async({page})=>{
 await ready(page);
 await page.evaluate(()=>{tab('profile');xp12Step=1;xp12WizardUI()});
 await page.locator('#weight').fill('90');
 await page.locator('#weight').press('Enter');
 await expect(page.locator('#height')).toBeFocused();
 await page.locator('#height').fill('178');
 await page.locator('#height').press('Enter');
 await expect(page.locator('#age')).toBeFocused();
 await expect(page.locator('#xpAStorageAlert')).toHaveCount(0);
});

test('Evolution 3 flow makes barcode, favorites and recipes directly accessible',async({page})=>{
 await ready(page);await page.evaluate(()=>tab('nutrition'));
 const quick=page.locator('#xpCQuick');
 await expect(quick.getByRole('button',{name:'Barcode',exact:true})).toBeVisible();
 await expect(quick.getByRole('button',{name:'Favoriten',exact:true})).toBeVisible();
 await expect(quick.getByRole('button',{name:'Rezepte',exact:true})).toBeVisible();
 await quick.getByRole('button',{name:'Favoriten',exact:true}).click();
 await expect(page.locator('#nutfavorites')).toHaveAttribute('open','');
});

test('Evolution 3 quick portion shortcuts change preview but never write diary',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await ready(page);await page.evaluate(()=>tab('nutrition'));
 await page.getByRole('button',{name:/Selbst eintragen/}).click();
 await page.locator('#foodname').fill('Künstliches Testgericht');
 await page.locator('#fk').fill('200');
 await page.locator('#fp').fill('10');
 await page.locator('#fc').fill('30');
 await page.locator('#ff').fill('4');
 const before=await canonical(page);
 await page.locator('.xpEvoPortionPresets').getByRole('button',{name:'150 g'}).click();
 await expect(page.locator('#grams')).toHaveValue('150');
 await expect(page.locator('#xp21PortionKcal')).toContainText('300');
 const after=await canonical(page);
 expect(after.log).toEqual(before.log);
 expect(await page.evaluate(()=>xpABlocked)).toBe(false);
});

test('Evolution 3 active exercise opens technique without altering training draft',async({page})=>{
 await ready(page);await startPlannedWorkout(page);
 const card=page.locator('#trainingout .workFocus:visible').first();
 const action=card.getByRole('button',{name:'Bewegung & Technik ansehen'});
 await expect(action).toBeVisible();
 const guide=card.locator('details').filter({has:page.locator('.guide')}).first();
 const before=(await canonical(page)).trainingDraft;
 await action.click();
 await expect(guide).toHaveAttribute('open','');
 await expect(action).toHaveAttribute('aria-expanded','true');
 expect((await canonical(page)).trainingDraft).toEqual(before);
});

test('Evolution 3.1 cinematic stage reveals cockpit without changing saved fitness data',async({page})=>{
 await page.setViewportSize({width:390,height:844});await ready(page);
 await expect(page.locator('#xpHome .xpHero')).toHaveClass(/xpCine/);
 await expect(page.locator('#xpHome .xpHero')).toHaveAttribute('data-cine-visible','yes');
 await expect(page.locator('#xpHome .xpTiles .xpTile').first()).toHaveClass(/xpCine/);
 const saved=await canonical(page);
 await page.locator('#xpHome .xpEvoCoach').scrollIntoViewIfNeeded();
 await expect(page.locator('#xpHome .xpEvoCoach')).toHaveAttribute('data-cine-visible','yes');
 expect(await canonical(page)).toEqual(saved);
 await expect(page.locator('#xpAStorageAlert')).toHaveCount(0);
});

test('Evolution 3.1 respects reduced motion and keeps cockpit controls functional',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await ready(page);
 const hero=page.locator('#xpHome .xpHero');
 await expect(hero).toHaveAttribute('data-cine-visible','yes');
 expect(await hero.evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
 const before=await canonical(page);
 await page.locator('#xpHome .xp12Focus').getByRole('button').first().click();
 await expect(page.locator('#xpCheck')).toBeVisible();
 expect(await canonical(page)).toEqual(before);
});

test('Evolution 3.1 motion stylesheets are delivered and offline-cached',async({page})=>{
 await ready(page);
 expect(await page.locator('link[href="cinematic.css"]').count()).toBe(1);
 expect(await page.locator('script[src="cinematic.js"]').count()).toBe(1);
 const assets=await page.evaluate(async()=>Promise.all(['cinematic.css','cinematic.js'].map(async url=>{
  const response=await fetch(url);return {url,status:response.status};
 })));
 expect(assets).toEqual([{url:'cinematic.css',status:200},{url:'cinematic.js',status:200}]);
});
test('Evolution 3.1 avatar chapter reuses real body artwork and opens real progress',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 await ready(page);
 const chapter=page.locator('#xpHome .xpCineAvatarChapter');
 await expect(chapter).toHaveCount(1);
 await expect(chapter.locator('.xpBody')).toHaveCount(1);
 await expect(chapter).toContainText('Trainingstage / Woche im Profil');
 const original=await canonical(page);
 await chapter.getByRole('button',{name:'Entwicklung ansehen'}).click();
 await expect(page.locator('#xpDeep')).toBeVisible();
 expect(await canonical(page)).toEqual(original);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('Evolution 3.1 onboarding does not show progress avatar without valid profile',async({page})=>{
 await page.goto('/');
 await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0,{timeout:20000});
 await expect(page.locator('#xpHome .xpCineAvatarChapter')).toHaveCount(0);
});

test('Evolution 3.2 fresh install previews cockpit before personal data is entered',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 await page.goto('/');await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0,{timeout:20000});
 const first=page.locator('#xpHome .xpFirstWelcome');
 await expect(first).toHaveCount(1);
 await expect(first.getByRole('heading',{name:/Willkommen/})).toBeVisible();
 await expect(first.locator('.xpFirstHeroArt .xpBody')).toHaveCount(1);
 await expect(first.locator('.xpFirstMini')).toHaveCount(3);
 await expect(first).toContainText('Noch keine persönlichen Messwerte');
 const empty=await canonical(page);
 expect(empty.p).toMatchObject({weight:'',height:'',age:'',goals:[]});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await first.getByRole('button',{name:/Meinen Weg starten/}).click();
 await expect(page.locator('#xp12Intro .xpFirstSetupHero')).toBeVisible();
 await expect(page.locator('#xp12Intro .xpFirstSetupHero .xpBody')).toHaveCount(1);
 expect(await canonical(page)).toEqual(empty);
});

test('Evolution 3.2 profile uses same cinematic language without changing wizard safeguards',async({page})=>{
 await ready(page);
 await page.evaluate(()=>{tab('profile');xp12Step=1;xp12WizardUI()});
 await expect(page.locator('#xp12Intro .xpFirstSetupHero')).toContainText('Deine Körperdaten');
 await expect(page.locator('#bodyfields')).toBeVisible();
 await page.locator('#weight').fill('90');
 await page.locator('#height').fill('280');
 await page.evaluate(()=>xp12Advance());
 await expect(page.locator('#xp12Message')).toBeVisible();
 await page.locator('#height').fill('180');
 await expect(page.locator('#xp12Message')).toBeHidden();
 await page.locator('#age').fill('39');
 await page.locator('#sex').selectOption('m');
 await page.evaluate(()=>xp12Advance());
 expect(await page.evaluate(()=>xp12Step)).toBe(2);
 expect(await page.evaluate(()=>xpABlocked)).toBe(false);
});

test('Evolution 3.2 entrance visuals respect reduced motion and stay offline cached',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');await expect(page.locator('#xpIDBBootOverlay')).toHaveCount(0,{timeout:20000});
 await expect(page.locator('#xpHome .xpFirstWelcome')).toBeVisible();
 expect(await page.locator('#xpHome .xpFirstHeroArt .xpAvatarStage').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 expect(await page.locator('link[href="first-impression.css"]').count()).toBe(1);
 const css=await page.evaluate(async()=>{let r=await fetch('first-impression.css');return r.status});
 expect(css).toBe(200);
});

test('Natural-flow chapters scroll with the viewport and lead into setup at mobile widths',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.cineRun')).toHaveCount(5);
 const training=page.locator('[data-scene="train"]');
 for(const width of [320,390]){
  await page.setViewportSize({width,height:820});
  await training.scrollIntoViewIfNeeded();
  await expect(training).toHaveClass(/flowEntered/);
  const displacement=await training.locator('.cineScreen').evaluate(el=>{
   const top=el.getBoundingClientRect().top;scrollBy({top:120,behavior:'instant'});return top-el.getBoundingClientRect().top;
  });
  expect(displacement).toBeCloseTo(120,0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(training.locator('.cineVisual')).toHaveCSS('transform','none');
 await page.locator('[data-scene="cockpit"] button').click();
 await expect(page.locator('#xp12Intro')).toContainText('SCHRITT 1 VON 4');
});

test('Evolution 3.3 returning PWA user can see the full cinematic story and return without touching data',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await ready(page);
 await expect(page.locator('#xpHome .xpStoryDiscovery')).toBeVisible();
 const before=await canonical(page);
 await page.locator('#xpHome .xpStoryDiscovery button').click();
 await expect(page.locator('#xpHome .cineRun')).toHaveCount(5);
 await expect(page.locator('#xpHome .xpStoryReturn button')).toBeVisible();
 expect(await canonical(page)).toEqual(before);
 await page.locator('#xpHome .xpStoryReturn button').click();
 await expect(page.locator('#xpHome .xpTiles')).toBeVisible();
 await expect(page.locator('#xpHome .cineRun')).toHaveCount(0);
 expect(await canonical(page)).toEqual(before);
 expect(await page.evaluate(()=>xpABlocked)).toBe(false);
});

test('Natural flow keeps studio media local, bounded and readable offline with reduced motion',async({page,context})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await context.setOffline(true);
 await page.reload();
 const scenes=page.locator('.flowStory .cineRun');
 expect(await scenes.evaluateAll(els=>els.map(el=>el.dataset.scene))).toEqual(['body','food','train','rest','cockpit']);
 let bytes=0;
 for(const img of await scenes.locator('img').all()){
  await img.scrollIntoViewIfNeeded();
  bytes+=await img.evaluate(async el=>{
   await el.decode();return (await (await fetch(el.currentSrc)).blob()).size;
  });
  await expect(img).toHaveCSS('animation-name','none');
 }
 expect(bytes).toBeLessThan(300*1024);
});
