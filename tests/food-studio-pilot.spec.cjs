const {test,expect}=require('@playwright/test');
test('Food Studio original view proposes, writes, edits and removes a real diary entry',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/?pilot=food-studio');
 const studio=page.locator('fitlab-food-studio');
 await expect(studio.getByRole('heading',{name:'Dein Ernährungstag.'})).toBeVisible();
 await expect(page.locator('#nutrition')).toBeHidden();
 await studio.getByRole('link',{name:/Lebensmittel suchen/}).click();
 await studio.getByRole('searchbox',{name:'Lebensmittel'}).fill('Haferflocken');
 await studio.getByRole('button',{name:'Haferflocken, trocken'}).click();
 const edit=studio.getByRole('dialog');
 await expect(edit.getByLabel('Menge in Gramm')).toHaveCSS('font-size','16px');
 await edit.getByRole('button',{name:'50 g',exact:true}).click();
 await edit.getByRole('button',{name:'Eintragen',exact:true}).click();
 const data=()=>page.evaluate(async()=>({date:dateKey(),record:await xpIDBRead()}));
 await expect.poll(async()=>{const {date,record}=await data();return record.log[date]?.[0]?.g;}).toBe(50);
 await studio.getByRole('button',{name:'Bearbeiten'}).click();
 await edit.getByLabel('Menge in Gramm').fill('70');
 await edit.getByRole('button',{name:'Änderung speichern'}).click();
 await expect.poll(async()=>{const {date,record}=await data();return record.log[date]?.[0]?.g;}).toBe(70);
 const {date,record}=await data();
 expect(record.log[date]).toHaveLength(1);
 await studio.getByRole('link',{name:'+ 250 ml'}).click();
 await expect.poll(async()=>(await data()).record.water[date]).toBe(250);
 await studio.getByRole('button',{name:'Haferflocken, trocken löschen'}).click();
 await edit.getByRole('button',{name:'Bestätigen'}).click();
 await expect.poll(async()=>(await data()).record.log[date]?.length).toBe(0);
 await studio.getByRole('link',{name:'Vortag'}).click();
 await expect(studio.locator('.day small')).not.toHaveText(date);
 await studio.getByRole('link',{name:'Folgetag'}).click();
 await expect(studio.locator('.day strong')).toHaveText('Heute');
 await studio.getByRole('link',{name:/Training/}).click();
 await expect(studio).toHaveCount(0);
 await page.evaluate(()=>tab('nutrition'));
 await expect(studio).toHaveCount(1);
});

test('Food Studio preserves a draft and performs an offline booking with the actual worker',async({page,context})=>{
 await page.goto('/?pilot=food-studio');
 await page.waitForFunction(()=>xpIDBReady&&navigator.serviceWorker.controller);
 const studio=page.locator('fitlab-food-studio'),dialog=studio.getByRole('dialog');
 await studio.getByRole('link',{name:/Lebensmittel suchen/}).click();
 await studio.getByRole('searchbox',{name:'Lebensmittel'}).fill('Haferflocken');
 await studio.getByRole('button',{name:'Haferflocken, trocken'}).click();
 await dialog.getByLabel('Menge in Gramm').fill('225');
 await expect.poll(()=>page.evaluate(()=>xp22ReadPortion()?.fields.grams)).toBe('225');
 await page.reload();
 await expect(dialog.getByLabel('Menge in Gramm')).toHaveValue('225');
 await expect(dialog).toContainText('Ungespeicherte Portion wiederhergestellt.');
 await context.setOffline(true);
 await dialog.getByRole('button',{name:'Eintragen',exact:true}).click();
 await expect.poll(()=>page.evaluate(async()=>(await xpIDBRead()).log[dateKey()]?.length)).toBe(1);
 await expect.poll(()=>page.evaluate(async()=>(await xpIDBRead()).log[dateKey()][0].g)).toBe(225);
 await expect.poll(()=>page.evaluate(()=>xp22ReadPortion())).toBe(null);
 await page.reload();
 await expect(studio.getByText('Haferflocken, trocken',{exact:true})).toBeVisible();
 await expect(studio.locator('.dial-center small')).toHaveText('Kein belegtes Tagesziel');
});

test('Food Studio rejects an edit from a stale tab before touching canonical data',async({page,context})=>{
 await page.goto('/?pilot=food-studio');
 await page.evaluate(async()=>{
  await xpDiaryWrite({date:dateKey(),row:{n:'Tab-Prüfung',g:100,k:130,p:3,c:28,f:0.2,fiber:null,meal:'Mittagessen',source:'Test'}},()=>true);
 });
 const studio=page.locator('fitlab-food-studio');
 await studio.getByRole('button',{name:'Bearbeiten'}).click();
 const dialog=studio.getByRole('dialog');
 const other=await context.newPage();
 try{
  await other.goto('/');
  await other.waitForFunction(()=>xpIDBReady);
  await other.evaluate(async()=>{
   const date=dateKey(),row=(await xpIDBRead()).log[date][0];
   return xpDiaryWrite({date,row:{...row,g:150},edit:{date,id:row._fid,original:row}},()=>true);
  });
  await expect.poll(()=>page.evaluate(()=>state.log[dateKey()][0].g)).toBe(150);
  await dialog.getByLabel('Menge in Gramm').fill('200');
  await dialog.getByRole('button',{name:'Änderung speichern'}).click();
  await expect(dialog).toContainText('Eintrag wurde geändert oder gelöscht.');
  expect(await page.evaluate(async()=>(await xpIDBRead()).log[dateKey()][0].g)).toBe(150);
 }finally{await other.close();}
});

const scanCode='96385074';
const left=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const bars='101'+[...scanCode.slice(0,4)].map(n=>left[n]).join('')+'01010'+[...scanCode.slice(4)].map(n=>left[n].replace(/[01]/g,n=>1-Number(n))).join('')+'101';
const barcodeImage=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="540" height="144"><rect width="540" height="144" fill="white"/>'+[...bars].map((bit,i)=>bit==='1'?'<rect x="'+(60+6*i)+'" y="4" width="6" height="136"/>':'').join('')+'</svg>');
async function scannerFixture(page){
 await page.addInitScript(code=>{
  const fetchActual=window.fetch.bind(window);
  window.fetch=(input,...args)=>{
   if(typeof input!=='string'||!input.startsWith('https://world.openfoodfacts.org/api/v2/product/'))return fetchActual(input,...args);
   if(!new URL(input).pathname.endsWith('/'+code+'.json'))return Promise.resolve(new Response(null,{status:404}));
   return Promise.resolve(Response.json({product:{code,product_name:'Pilot Testprodukt',nutriments:{'energy-kcal_100g':172,proteins_100g:10,carbohydrates_100g:24,fat_100g:4}}}));
  };
 },scanCode);
}
for(const scanner of ['photo','native','local']){
 test('Food Studio scanner '+scanner+' resolves the decoded code into the real entry form',async({page,browserName})=>{
  test.skip(scanner!=='photo'&&browserName!=='chromium','Simuliertes Kamerabild wird als Chromium Canvas-Medienstrom bereitgestellt.');
  await scannerFixture(page);
  if(scanner!=='photo'){
   await page.addInitScript(({bars,code,native})=>{
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
     const canvas=document.createElement('canvas');canvas.width=540;canvas.height=144;
     const ctx=canvas.getContext('2d');
     const draw=()=>{ctx.fillStyle='white';ctx.fillRect(0,0,540,144);ctx.fillStyle='black';[...bars].forEach((bit,i)=>{if(bit==='1')ctx.fillRect(60+6*i,4,6,136);});};
     draw();const interval=setInterval(draw,80);
     const stream=canvas.captureStream(12),track=stream.getVideoTracks()[0],stop=track.stop.bind(track);
     track.stop=()=>{clearInterval(interval);stop();window.cameraStopped=true;};
     return stream;
    }});
    window.BarcodeDetector=native?class{async detect(video){return video.videoWidth?[{rawValue:code}]:[]}}:undefined;
   },{bars,code:scanCode,native:scanner==='native'});
  }
  await page.goto('/?pilot=food-studio');
  const studio=page.locator('fitlab-food-studio');
  await studio.getByRole('link',{name:/Barcode scannen/}).click();
  if(scanner==='photo')await studio.getByLabel('Barcode-Foto').setInputFiles({name:'ean.svg',mimeType:'image/svg+xml',buffer:barcodeImage});
  else await studio.getByRole('button',{name:'Kamera',exact:true}).click();
  await expect(studio.getByRole('dialog',{name:'Lebensmittel erfassen'}).getByLabel('Name')).toHaveValue('Pilot Testprodukt');
  if(scanner!=='photo')await expect.poll(()=>page.evaluate(()=>window.cameraStopped===true)).toBe(true);
 });
}

test('Food Studio online search handles data and network failure without losing the local entry path',async({page})=>{
 await page.addInitScript(code=>{
  const fetchActual=window.fetch.bind(window);
  window.fetch=(input,...args)=>{
   if(typeof input!=='string'||!input.startsWith('https://de.openfoodfacts.org/cgi/search.pl?'))return fetchActual(input,...args);
   const query=new URL(input).searchParams.get('search_terms');
   if(query==='Fehlerfall')return Promise.resolve(new Response(null,{status:503}));
   return Promise.resolve(Response.json({products:[{code,product_name:'Pilot Testprodukt',nutriments:{'energy-kcal_100g':172,proteins_100g:10,carbohydrates_100g:24,fat_100g:4}}]}));
  };
 },scanCode);
 await page.goto('/?pilot=food-studio');
 const studio=page.locator('fitlab-food-studio');
 await studio.getByRole('link',{name:/Lebensmittel suchen/}).click();
 const query=studio.getByRole('searchbox',{name:'Lebensmittel'});
 await query.fill('Pilot');
 await studio.getByRole('button',{name:'Online-Suche'}).click();
 await expect(studio.getByRole('button',{name:'Pilot Testprodukt'})).toBeVisible();
 await page.reload();
 await studio.getByRole('link',{name:/Lebensmittel suchen/}).click();
 await query.fill('Fehlerfall');
 await studio.getByRole('button',{name:'Online-Suche'}).click();
 await expect(studio.getByRole('dialog').getByRole('status')).toContainText('HTTP 503');
 await query.fill('Haferflocken');
 await expect(studio.getByRole('button',{name:'Haferflocken, trocken'})).toBeVisible();
});

test('Food Studio keeps manual EAN and photo controls after denied camera permission',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('Test','NotAllowedError');}}));
 await scannerFixture(page);
 await page.goto('/?pilot=food-studio');
 const studio=page.locator('fitlab-food-studio');
 await studio.getByRole('link',{name:/Barcode scannen/}).click();
 await studio.getByRole('button',{name:'Kamera',exact:true}).click();
 await expect(studio.getByRole('dialog').getByRole('status')).toContainText('Kamera nicht verfügbar');
 await studio.getByLabel('Barcode-Foto').setInputFiles({name:'defekt.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
 await expect(studio.getByRole('dialog').getByRole('status')).toContainText('Bild konnte nicht gelesen werden');
 await studio.getByLabel('EAN / Barcode').fill(scanCode);
 await studio.getByRole('button',{name:'Barcode suchen'}).click();
 await expect(studio.getByRole('dialog',{name:'Lebensmittel erfassen'})).toBeVisible();
});

test('Food Studio manages custom food, saved meals, recipes, prior day, targets and day confirmation',async({page})=>{
 await page.goto('/?pilot=food-studio');
 const studio=page.locator('fitlab-food-studio'),dialog=studio.getByRole('dialog');
 const read=()=>page.evaluate(()=>xpIDBRead());
 const day=await page.evaluate(()=>dateKey());
 await studio.getByText('Weitere Tagebuchfunktionen').click();
 const manual=studio.getByRole('link',{name:/Eigenes Lebensmittel erfassen/});
 await manual.click();
 await dialog.getByLabel('Name').fill('Eigenes Pilotessen');
 for(const [name,value] of [['k','172'],['p','10'],['c','24'],['f','4']])await dialog.locator('[name='+name+']').fill(value);
 await dialog.getByRole('checkbox').check();
 await dialog.getByRole('button',{name:'Eintragen',exact:true}).click();
 await expect.poll(async()=> (await read()).favorites[0]?.n).toBe('Eigenes Pilotessen');
 await studio.getByText('Mahlzeit als Favorit speichern',{exact:true}).click();
 await dialog.getByLabel('Name').fill('Pilotmahlzeit');
 await dialog.getByRole('button',{name:'Speichern',exact:true}).click();
 await expect.poll(async()=> (await read()).mealFavorites14?.[0]?.name).toBe('Pilotmahlzeit');
 await studio.getByRole('link',{name:'Tag prüfen und bestätigen'}).click();
 await dialog.getByRole('button',{name:'Bestätigen'}).click();
 await expect.poll(async()=> (await read()).coach.days[day]?.complete).toBe(true);
 const manage=studio.getByRole('link',{name:'Tagebuch verwalten'});
 await manage.click();
 await dialog.getByLabel('Individuelle Wassermenge (ml)').fill('315');
 await dialog.getByRole('button',{name:'Wasser hinzufügen'}).click();
 await expect.poll(async()=> (await read()).water[day]).toBe(315);
 await dialog.getByLabel('Trinkziel (ml)').fill('2700');
 await dialog.getByRole('button',{name:'Trinkziel speichern'}).click();
 await expect.poll(async()=> (await read()).waterGoal).toBe(2700);
 await dialog.getByRole('button',{name:'Eigenes Rezept erstellen'}).click();
 await dialog.getByRole('searchbox',{name:'Zutat suchen'}).fill('Eigenes Pilotessen');
 await dialog.getByRole('button',{name:'Als Zutat hinzufügen'}).click();
 await dialog.getByLabel('Rezeptname').fill('Pilotrezept');
 await dialog.getByLabel('Fertiges Gesamtgewicht (g)').fill('100');
 await dialog.getByRole('button',{name:'Rezept speichern'}).click();
 await expect.poll(async()=> (await read()).recipes[0]?.n).toBe('Pilotrezept');
 await studio.getByRole('link',{name:'Folgetag'}).click();
 await manage.click();
 await dialog.getByRole('button',{name:'Gesamten Vortag übernehmen'}).click();
 await page.locator('#fitlab-confirmation button[data-accept]').click();
 await expect.poll(async()=>Object.values((await read()).log).flat().length).toBe(2);
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
});
