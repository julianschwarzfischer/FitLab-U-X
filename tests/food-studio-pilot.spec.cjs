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
