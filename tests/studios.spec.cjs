const {test,expect}=require('@playwright/test');
test('Data Vault exports real records, validates a preview and writes only on confirmation',async({page})=>{
 await page.goto('/?bereich=vault');
 const vault=page.locator('fitlab-studio');
 await expect(vault.getByRole('heading',{name:/Data Vault/})).toBeVisible();
 const before=await page.evaluate(()=>xpIDBRead());
 const downloading=page.waitForEvent('download');
 await vault.getByRole('button',{name:'JSON exportieren'}).click();
 expect((await downloading).suggestedFilename()).toMatch(/backup\.json$/);
 const file=vault.locator('#file');
 await file.setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});
 await expect(vault.locator('#restore')).toBeDisabled();
 const candidate={...before,waterGoal:2800};
 await file.setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(candidate))});
 await expect(vault.locator('#filestatus')).toContainText('Geprüft: valid.json');
 expect(await page.evaluate(()=>xpIDBRead())).toEqual(before);
 await vault.locator('#confirm').check();
 await vault.locator('#restore').click();
 await expect(vault.locator('#restorestatus')).toContainText('Sicherung gespeichert');
 expect((await page.evaluate(()=>xpIDBRead())).waterGoal).toBe(2800);
});

test('Settings and Personal Identity bind original forms and preserve the White Label configuration',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('flx161:'+encodeURIComponent(location.origin+'/|')+':fitlab-experience-brand-v1',JSON.stringify({name:'Original retained'})));
 await page.goto('/?bereich=settings');
 const view=page.locator('fitlab-studio');
 await view.locator('[data-name]').fill('Kim');
 await view.locator('[data-name]').press('Tab');
 await expect(view.locator('#status')).toHaveText('Name gespeichert.');
 await view.getByRole('radio',{name:'Dunkel'}).check();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await view.locator('[data-route=identity]').click();
 await view.getByLabel('Gewicht (kg)',{exact:true}).fill('81');
 await view.getByLabel('Größe (cm)',{exact:true}).fill('179');
 await view.getByLabel('Alter (Jahre)').fill('40');
 await view.getByLabel('Geschlecht für die Kalorienberechnung').selectOption('m');
 await view.getByRole('radio',{name:'Weiblich',exact:true}).check();
 await view.getByRole('button',{name:'Profil prüfen & speichern'}).click();
 await expect(view.locator('#status')).toHaveText('Profil gespeichert.');
 expect(await page.evaluate(async()=>[(await xpIDBRead()).p.sex,xpPrefs.avatar,brand.name])).toEqual(['m','f','FITNESS LAB']);
 expect(await page.evaluate(()=>fitStore161.getItem('fitlab-experience-brand-v1'))).toContain('Original retained');
 await view.getByRole('button',{name:/Zurück/}).click();
 await expect(view.getByRole('heading',{name:/Settings Studio/})).toBeVisible();
 await page.goto('/?ansicht=klassisch');
 await page.evaluate(()=>tab('profile'));
 await expect(page.locator('.xpEvoBrandGroup')).toBeHidden();
 await expect(page.locator('#brandPanel button')).toHaveCount(0);
});

test('Progress Studio displays real measurements and no synthetic values',async({page})=>{
 await page.goto('/?pilot=architecture&bereich=progress');
 const view=page.locator('fitlab-studio');
 await expect(view.getByRole('heading',{name:/Progress Studio/})).toBeVisible();
 await expect(view.locator('#content')).toContainText('Noch keine Messwerte');
 await page.evaluate(async()=>{
  const d=dateKey(),check=Object.fromEntries(coachFields.map(([key])=>[key,null]));
  coachData().days[d]={...check,weight:83,complete:false};await save();
 });
 await view.getByRole('button',{name:'Gesamt'}).click();
 await expect(view.locator('#content')).toContainText('83,0 kg');
 await view.getByRole('button',{name:'Ernährung',exact:true}).click();
 await expect(view.locator('#content')).toContainText('Keine vollständig erfassten Ernährungstage');
});

test('Data Vault rejects an outdated checked import after another tab commits',async({page,context})=>{
 await page.goto('/?bereich=vault');
 const vault=page.locator('fitlab-studio');
 await expect(vault.locator('#file')).toBeVisible();
 const backup=await page.evaluate(()=>xpIDBRead());
 await vault.locator('#file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...backup,waterGoal:2800}))});
 await vault.locator('#confirm').check();
 const other=await context.newPage();
 try{
  await other.goto('/');
  await other.waitForFunction(()=>xpIDBReady);
  await other.evaluate(async()=>{state.waterGoal=3000;await save();});
  await expect.poll(()=>page.evaluate(()=>state.waterGoal)).toBe(3000);
  await vault.locator('#restore').click();
  await expect(vault.locator('#restorestatus')).toContainText('seit Beginn des Imports geändert');
  expect((await page.evaluate(()=>xpIDBRead())).waterGoal).toBe(3000);
 }finally{await other.close();}
});

test('Recovery reference stores a real check-in and reports the existing training protection',async({page})=>{
 await page.goto('/?pilot=architecture&bereich=recovery');
 const view=page.locator('fitlab-studio');
 await expect(view.locator('#rEnergy')).toHaveText('–');
 await view.locator('#sleep').fill('4.5');
 await view.locator('#energy').getByRole('button',{name:'1',exact:true}).click();
 await view.locator('#sore').getByRole('button',{name:'4',exact:true}).click();
 await view.getByRole('button',{name:'Check-in auswerten'}).click();
 await expect(view.locator('#notice')).toHaveText('Check-in gespeichert.');
 expect(await page.evaluate(async()=>{const data=await xpIDBRead();return [data.coach.days[dateKey()].sleep,data.coach.days[dateKey()].energy,data.coach.days[dateKey()].soreness,xpSafetyDecision().training.locked]})).toEqual([4.5,1,4,true]);
});
