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
  await expect(page.locator('#appVersion')).toContainText('EVOLUTION 2.1');
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
  await expect(quick.getByRole('button', {name:'Barcode scannen'})).toBeHidden();
  await quick.locator('summary').click();
  await expect(quick.getByRole('button', {name:'Barcode scannen'})).toBeVisible();
  await quick.getByRole('button', {name:'Favoriten öffnen'}).click();
  await expect(page.locator('#nutfavorites')).toHaveAttribute('open');
  await quick.getByRole('button', {name:'Rezepte öffnen'}).click();
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

test('Evolution 2.1 discard requires accessible confirmation and preserves earlier history',async({page},testInfo)=>{
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
