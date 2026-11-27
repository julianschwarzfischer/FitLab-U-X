'use strict';
window.fitLabFoodStudio=(()=>{
 const number=new Intl.NumberFormat('de-DE',{maximumFractionDigits:1});
 const dateLabel=new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
 const fmt=value=>number.format(value);
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const buttons=(label,key)=>`<button type="button" data-action="${key}">${label}</button>`;
 let layout;
 function create(port,shell){
  const host=document.createElement('fitlab-food-studio'),root=host.attachShadow({mode:'open'});
  const css=document.createElement('link');css.rel='stylesheet';css.href='premium/food-studio.css';root.append(css);
  let date=shell.date(),model,stopCamera=()=>{},ingredientDraft=[];
  const $=selector=>root.querySelector(selector);
  const status=(message)=>{const area=$('dialog[open] [role=status]')||$('[data-status]');if(area)area.textContent=message;};
  function dial(element,used,goal){
   const arc=goal>0?Math.max(0,Math.min(used/goal,1))*295.3097:0;
   const progress=element.querySelector('.dial-progress');
   progress.style.setProperty('--arc',String(arc));
   progress.setAttribute('stroke-dasharray',arc+' 295.3097');
   progress.style.visibility=arc?'visible':'hidden';
  }
  function update(){
   if(!$('main'))return;
   model=port.read(date);
   const {used,target,day,rows,fiber,fiberTarget,water,waterGoal}=model;
   $('.day strong').textContent=date===model.today?'Heute':dateLabel.format(new Date(date+'T00:00:00Z'));
   $('.day small').textContent=date===model.today?dateLabel.format(new Date(date+'T00:00:00Z')):date;
   const calorie=$('.dial-center strong');
   calorie.firstChild.textContent=day.rows?fmt(used.k)+' ':'– ';
   $('.dial-center small').textContent=target?'von '+fmt(target.k)+' kcal':'Kein belegtes Tagesziel';
   dial($('.large-dial'),used.k,target?.k);
   const remaining=target?target.k-used.k:null;
   $('.remaining b').textContent=remaining===null?'–':fmt(Math.abs(remaining))+' kcal';
   $('.remaining small').textContent=remaining===null?'Tagesziel pausiert oder unbekannt':remaining<0?'über Tagesziel':'verbleibend';
   root.querySelectorAll('.mini-meter').forEach((element,index)=>{
    const [key,goal]=[['p','protein'],['c','carbs'],['f','fat']][index];
    element.querySelector('strong').firstChild.textContent=day.rows?fmt(used[key]):'–';
    element.querySelector('small').textContent=target?'von '+fmt(target[goal])+' g':'Kein belegtes Ziel';
    dial(element,used[key],target?.[goal]);
   });
   const hydration=$('.water h2');
   hydration.firstChild.textContent=fmt(water/1000)+' l ';
   hydration.querySelector('small').textContent='von '+fmt(waterGoal/1000)+' l';
   $('.water .track i').style.width=Math.min(100,water/waterGoal*100)+'%';
   $('[data-quality]').innerHTML=`<p>${escape(day.label)} · ${fiber.known?fmt(fiber.g)+' g Ballaststoffe erfasst':'Ballaststoffe unbekannt'}${fiber.unknown?' · '+fiber.unknown+' ohne Angabe':''} · Ziel ${fmt(fiberTarget)} g</p>${day.target?'<p>Historisches Ziel bei der ersten Buchung gespeichert.</p>':''}`;
   if(!root.activeElement?.closest('[data-meals]')){
    $('[data-meals]').innerHTML=model.meals.map((meal,index)=>{
     const items=rows.filter(item=>item.meal===meal);
     return `<section class="meal"><div class="mealhead"><div><h3>${meal}</h3><small>${items.length?items.length+' Einträge':'Noch nichts erfasst'}</small></div><a href="#search" data-meal="${index}" aria-label="${meal} hinzufügen">+</a></div>
     ${items.map(item=>`<div class="entry"><div><b>${escape(item.n)}</b><small>${fmt(item.g)} g · ${fmt(item.k*item.g/100)} kcal</small><small>${escape(item.source||'Eigene Angabe')}</small></div><button type="button" data-edit="${escape(item._fid)}">Bearbeiten</button><button type="button" data-delete="${escape(item._fid)}" aria-label="${escape(item.n)} löschen">Löschen</button></div>`).join('')}
     <button type="button" data-copy="${index}">Vom Vortag</button>${items.length?`<button type="button" data-meal-save="${index}">Mahlzeit als Favorit speichern</button>`:''}</section>`;
    }).join('');
   }
  }
  function sheet(title,contents){
   const previous=$('dialog[open]')?.returnFocus||root.activeElement;
   const current=$('dialog[open]');
   if(current){current.replaced=true;current.close();current.remove();}
   const dialog=document.createElement('dialog');
   dialog.className='sheet';dialog.setAttribute('aria-labelledby','studio-sheet-title');dialog.returnFocus=previous;
   dialog.innerHTML=`<div class="handle"></div><div class="eyebrow">FITNESS LAB</div><h2 id="studio-sheet-title">${title}</h2>${contents}<p role="status"></p><button type="button" data-close>Schließen</button>`;
   dialog.querySelector('[data-close]').onclick=()=>dialog.close();
   dialog.addEventListener('close',()=>{dialog.remove();if(!dialog.replaced){stopCamera();previous?.focus({preventScroll:true});update();}});
   root.append(dialog);dialog.showModal();
   return dialog;
  }
  async function action(type,payload){
   try{
    const result=await port.command(type,payload);
    status(result.message||(result.status==='ok'?'Gespeichert.':result.status==='cancelled'?'':'Aktion konnte nicht bestätigt werden.'));
    return result;
   }catch{status('Aktion nicht verfügbar. Bitte erneut versuchen.');return {status:'invalid'};}
  }
  function entry(product,meal,edit,resume){
   stopCamera();
   const row=product||{},manual=!product;
   const original=edit?structuredClone(row):null;
   const fields=[['k','kcal'],['p','Protein'],['c','Kohlenhydrate'],['f','Fett'],['fiber','Ballaststoffe (optional)']];
   const choices=row.yieldGrams?[['¼ Rezept',row.yieldGrams/4],['½ Rezept',row.yieldGrams/2],['Ganzes Rezept',row.yieldGrams]]:[...([25,50,100,150].map(g=>[g+' g',g])),...(row.servingGrams?[['Portion',row.servingGrams]]:[]),...(row.packGrams?[['Packung',row.packGrams]]:[])];
   const dialog=sheet(edit?'Eintrag bearbeiten':'Lebensmittel erfassen',`<form><label>Name<input name="n" required maxlength="500" value="${escape(row.n)}"></label>
    <label>Menge in Gramm<input name="g" type="number" inputmode="decimal" min="0.01" max="10000" step="any" required value="${row.g??row.yieldGrams??100}"></label>
    <div class="chips">${choices.map(([label,value])=>`<button type="button" data-grams="${value}">${label}</button>`).join('')}</div>
    <label>Mahlzeit<select name="meal">${model.meals.map(name=>`<option ${name===(row.meal||meal)?'selected':''}>${name}</option>`).join('')}</select></label>
    <details ${manual?'open':''}><summary>Nährwerte je 100 g <span>＋</span></summary>
    ${fields.map(([key,label])=>`<label>${label}<input name="${key}" type="number" min="0" step="any" inputmode="decimal" ${key==='fiber'?'':'required'} value="${row[key]??''}"></label>`).join('')}</details>
    <label><input type="checkbox" name="favorite">Als eigenes Lebensmittel speichern</label>
    <small>${escape(row.source||'Eigene Angabe')}</small><p class="preview"></p>
    <button type="submit" class="primary">${edit?'Änderung speichern':'Eintragen'}</button></form>`);
   const form=dialog.querySelector('form'),submit=form.querySelector('[type=submit]');
   const fieldsByName={n:'foodname',g:'grams',meal:'meal',k:'fk',p:'fp',c:'fc',f:'ff',fiber:'fiber14'};
   if(resume){
    for(const [name,key] of Object.entries(fieldsByName)){if(typeof resume.fields[key]==='string')form.elements[name].value=resume.fields[key];}
    form.elements.favorite.checked=resume.favorite===true;
    status('Ungespeicherte Portion wiederhergestellt.');
   }
   const preview=(remember=false)=>{
    const {k,g}=form.elements;
    form.querySelectorAll('[data-grams]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.grams)===g.valueAsNumber)));
    form.querySelector('.preview').textContent=k.value&&g.value?'Deine Portion · '+fmt(k.valueAsNumber*g.valueAsNumber/100)+' kcal':'';
    if(remember&&!edit)void port.command('draft.store',{date,fields:Object.fromEntries(Object.entries(fieldsByName).map(([name,key])=>[key,form.elements[name].value])),
     source:row.source||'Eigene Angabe',food:product,favorite:form.elements.favorite.checked});

   };
   form.oninput=()=>preview(true);preview();
   if(row.image&&/^https:\/\/images\.openfoodfacts\.org\//.test(row.image)){
    const image=document.createElement('img');image.alt='Produktbild';image.src=row.image;form.prepend(image);
   }
   if(row.brand){const brand=document.createElement('small');brand.textContent=row.brand;form.prepend(brand);}
   form.querySelectorAll('[data-grams]').forEach(button=>button.onclick=()=>{form.elements.g.value=button.dataset.grams;preview(true);});
   form.onsubmit=async event=>{
    event.preventDefault();
    const values={n:form.elements.n.value.trim(),g:form.elements.g.valueAsNumber,meal:form.elements.meal.value,source:row.source||'Eigene Angabe'};
    for(const [key] of fields)values[key]=form.elements[key].value===''?null:form.elements[key].valueAsNumber;
    if(row.image&&/^https:\/\/images\.openfoodfacts\.org\//.test(row.image))values.image=row.image;
    const dateAtOpen=date;
    if(form.dataset.pending)return;form.dataset.pending='true';
    submit.disabled=true;dialog.querySelector('[data-close]').disabled=true;
    const prevent=event=>event.preventDefault();dialog.addEventListener('cancel',prevent);
    try{
     const result=await action('food.save',{date:dateAtOpen,row:values,edit:original?{date:dateAtOpen,id:original._fid,original}:null,favorite:form.elements.favorite.checked,product});
     if(result.status==='ok'){dialog.close();$('[data-status]').textContent='Gespeichert.';update();}
    }finally{delete form.dataset.pending;dialog.removeEventListener('cancel',prevent);submit.disabled=false;dialog.querySelector('[data-close]').disabled=false;}
   };
  }
  function search(meal,kind='search'){
   const isScanner=kind==='scan',favorite=kind==='favorites';
   const dialog=sheet(isScanner?'Barcode erfassen':favorite?'Deine Favoriten':'Was hast du gegessen?',`
    ${favorite?'':`<label>${isScanner?'EAN / Barcode':'Lebensmittel'}<input name="query" type="${isScanner?'text':'search'}" ${isScanner?'inputmode="numeric" pattern="[0-9]*"':'placeholder="z. B. Haferflocken"'}></label>
    ${buttons(isScanner?'Barcode suchen':'Online-Suche','lookup')}`}
    ${isScanner?`${buttons('Kamera','camera')}<video hidden playsinline muted></video>${buttons('Kamera schließen','stop')}<label>Barcode-Foto<input type="file" accept="image/*" capture="environment"></label>`:''}
    <div data-results></div>${buttons('Eigenes Lebensmittel','manual')}<p class="note"><a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener noreferrer">Open Food Facts · ODbL</a></p>`);
   const query=dialog.querySelector('[name=query]'),results=dialog.querySelector('[data-results]');
   const bind=items=>{
    results.replaceChildren(...items.map(item=>{
     const button=document.createElement('button');button.type='button';button.textContent=item.n;
     button.onclick=()=>entry(item,meal);return button;
    }));
   };
   const remote=async(value,online)=>{
    const result=await action('food.online',{query:value,search:online});
    if(!dialog.open)return;
    if(!online&&result.items?.length)entry(result.items[0],meal);else bind(result.items||[]);
    if(result.term){
     const link=document.createElement('a');link.href='https://world.openfoodfacts.org/cgi/search.pl?search_terms='+encodeURIComponent(result.term);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Bei Open Food Facts suchen';results.append(link);
    }
   };
   if(!isScanner&&!favorite){
    let seq=0;
    query.oninput=async()=>{const current=++seq;const result=await port.command('food.search',{query:query.value});if(current===seq)bind(result.items||[]);};
   }
   if(favorite)bind([...model.favorites,...model.recipes]);
   const lookup=dialog.querySelector('[data-action=lookup]');
   if(lookup)lookup.onclick=()=>remote(query.value,!isScanner);
   dialog.querySelector('[data-action=manual]').onclick=()=>entry(null,meal);
   if(!isScanner)return;
   const video=dialog.querySelector('video');
   let stream,timeout,attempt=0;
   stopCamera=()=>{attempt++;clearTimeout(timeout);stream?.getTracks().forEach(track=>track.stop());stream=null;video.hidden=true;};
   const detected=code=>{stopCamera();query.value=code;void remote(code,false);};
   dialog.querySelector('[data-action=stop]').onclick=stopCamera;
   dialog.querySelector('[type=file]').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    const url=URL.createObjectURL(file);
    try{const img=new Image();img.src=url;await img.decode();const code=shell.decodeImage(img);if(code)detected(code);else status('Kein sicherer EAN-Barcode erkannt.');}
    catch{status('Bild konnte nicht gelesen werden.');}finally{URL.revokeObjectURL(url);}
   };
   dialog.querySelector('[data-action=camera]').onclick=async()=>{
    stopCamera();const current=attempt;
    try{
     const camera=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}}});
     if(!dialog.open||current!==attempt){camera.getTracks().forEach(track=>track.stop());return;}
     stream=camera;video.srcObject=stream;video.hidden=false;await video.play();
     const detector=typeof BarcodeDetector==='function'?new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']}):null;
     let seen=null;
     const scan=async()=>{
      if(current!==attempt||!stream)return;
      try{
       const code=detector?(await detector.detect(video))[0]?.rawValue:shell.decodeImage(video);
       if(code&&(detector||seen===code)){detected(code);return;}
       seen=code;
      }catch{}
      if(current===attempt)timeout=setTimeout(scan,350);
     };
     await scan();
    }catch{stopCamera();status('Kamera nicht verfügbar. Barcode-Foto oder manuelle Eingabe verwenden.');}
   };
  }
  function pickDate(){
   const dialog=sheet('Datum wählen',`<label>Datum<input type="date" value="${date}"></label>`);
   dialog.querySelector('input').onchange=event=>{if(event.target.value){date=event.target.value;dialog.close();update();}};
  }
  function confirmation(title,message,handler){
   const dialog=sheet(title,`<p>${escape(message)}</p>${buttons('Bestätigen','confirm')}`);
   const confirm=dialog.querySelector('[data-action=confirm]');
   confirm.onclick=async()=>{confirm.disabled=true;try{if((await handler()).status==='ok'){dialog.close();update();}}finally{confirm.disabled=false;}};
  }
  root.addEventListener('click',event=>{
   const button=event.target.closest('a[href^="#"],button[data-edit],button[data-delete],button[data-copy],button[data-meal-save]');
   if(!button||button.closest('dialog'))return;
   event.preventDefault();
   const meal=model.meals[button.dataset.meal];
   if(button.dataset.edit){const row=model.rows.find(row=>row._fid===button.dataset.edit);if(row)entry(row,row.meal,true);return;}
   if(button.dataset.delete){
    const row=model.rows.find(row=>row._fid===button.dataset.delete);
    if(row)confirmation('Tagebucheintrag löschen',row.n,()=>action('food.delete',{date,row}));
    return;
   }
   if(button.dataset.mealSave!==undefined){
    const meal=model.meals[button.dataset.mealSave];
    const dialog=sheet('Mahlzeit als Favorit speichern',`<form><label>Name<input name="name" maxlength="80" value="${meal}" required></label><button>Speichern</button></form>`);
    dialog.querySelector('form').onsubmit=async event=>{
     event.preventDefault();
     if((await action('meal.save',{date,meal,name:event.target.elements.name.value.trim()})).status==='ok')dialog.close();
    };
    return;
   }
   if(button.dataset.copy!==undefined){void action('food.copy',{date,meal:model.meals[button.dataset.copy]});return;}
   const dest=button.getAttribute('href').slice(1);
   if(['previous','next'].includes(dest)){
    const day=new Date(date+'T00:00:00Z');day.setUTCDate(day.getUTCDate()+(dest==='next'?1:-1));date=day.toISOString().slice(0,10);update();
   }else if(dest==='date')pickDate();
   else if(dest==='manual')entry(null,meal);
   else if(['search','scan','favorites'].includes(dest))search(meal,dest);
   else if(dest==='water')void action('water.change',{date,delta:250});
   else if(dest==='complete')confirmation('Tagesabschluss',model.day.confirmed?'Bestätigung zurücknehmen?':'Bestätige ausschließlich vollständig erfasste Tage.',()=>action('day.confirm',{date,checked:!model.day.confirmed}));
   else if(dest==='manage')manage();
   else if(dest!=='top')shell.navigate(dest==='dashboard'?'today':dest);
  });
  function savedMeals(){
   const groups=[['Lebensmittel','favorites',model.favorites],['Rezepte','recipes',model.recipes],['Mahlzeiten','mealFavorites14',model.savedMeals]];
   const dialog=sheet('Favoriten & Rezepte',groups.map(([title,key,items])=>`<h3>${title}</h3>${items.map((item,index)=>`<div class="entry"><b>${escape(item.n||item.name)}</b><button type="button" data-key="${key}" data-index="${index}" data-use>Übernehmen</button><button type="button" data-key="${key}" data-index="${index}" data-remove>Löschen</button></div>`).join('')||'<p>Noch nichts gespeichert.</p>'}`).join(''));
   dialog.querySelectorAll('[data-index]').forEach(button=>button.onclick=async()=>{
    const key=button.dataset.key,item=groups.find(group=>group[1]===key)[2][button.dataset.index];
    if(button.hasAttribute('data-remove')){if((await action('saved.delete',{key,item})).status==='ok'){update();savedMeals();}return;}
    if(key==='mealFavorites14')void action('meal.book',{date,item});else entry(item);
   });
  }
  function recipeBuilder(){
   const dialog=sheet('Eigenes Rezept erstellen',`<label>Zutat suchen<input type="search"></label><div data-ingredients></div>
    <div data-draft></div><form><label>Rezeptname<input name="name" required maxlength="500"></label>
    <label>Fertiges Gesamtgewicht (g)<input name="weight" type="number" inputmode="decimal" min="0.01" step="any" required></label><button>Rezept speichern</button></form>`);
   const draft=dialog.querySelector('[data-draft]');
   const show=()=>{draft.innerHTML=ingredientDraft.map((item,index)=>`<p>${escape(item.n)} · ${fmt(item.g)} g <button type="button" data-remove="${index}">Entfernen</button></p>`).join('');
    draft.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{ingredientDraft.splice(Number(button.dataset.remove),1);show();});};
   show();
   const results=dialog.querySelector('[data-ingredients]');
   const query=dialog.querySelector('[type=search]');let version=0;
   query.oninput=async()=>{
    const id=++version,result=await port.command('food.search',{query:query.value});
    if(id!==version)return;
    results.replaceChildren(...(result.items||[]).map(item=>{
     const group=document.createElement('div'),label=document.createElement('label'),field=document.createElement('input'),button=document.createElement('button');
     label.textContent=item.n+' · Gramm';field.type='number';field.min='0.01';field.step='any';field.inputMode='decimal';field.value='100';label.append(field);
     button.type='button';button.textContent='Als Zutat hinzufügen';
     button.onclick=()=>{if(field.valueAsNumber>0&&field.valueAsNumber<=10000){ingredientDraft.push({...item,g:field.valueAsNumber,meal:model.meals[0]});show();}};
     group.append(label,button);return group;
    }));
   };
   dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const form=event.target.elements;
    if((await action('recipe.save',{name:form.name.value,weight:form.weight.valueAsNumber,items:ingredientDraft})).status==='ok'){
     ingredientDraft=[];dialog.close();
    }
   };
  }
  function manage(){
   const dialog=sheet('Tagebuch verwalten',`<label>Individuelle Wassermenge (ml)<input name="water" type="number" min="1" max="5000" inputmode="numeric"></label>
    ${buttons('Wasser hinzufügen','plus')}${buttons('Wasser abziehen','minus')}
    <label>Trinkziel (ml)<input name="goal" type="number" min="250" max="10000" inputmode="numeric" value="${model.waterGoal}"></label>
    ${buttons('Trinkziel speichern','goal')}
    <label>Ballaststoffziel (g)<input name="fiber" type="number" min="5" max="100" inputmode="numeric" value="${model.fiberTarget}"></label>
    ${buttons('Ballaststoffziel speichern','fiber')}${buttons('Gesamten Vortag übernehmen','copy')}
    ${buttons('Favoriten & Rezepte','saved')}${buttons('Eigenes Rezept erstellen','recipe')}`);
   const get=name=>dialog.querySelector('[name='+name+']').valueAsNumber;
   dialog.querySelector('[data-action=plus]').onclick=()=>action('water.change',{date,delta:get('water')});
   dialog.querySelector('[data-action=minus]').onclick=()=>action('water.change',{date,delta:-get('water')});
   dialog.querySelector('[data-action=goal]').onclick=()=>action('water.goal',{goal:get('goal')});
   dialog.querySelector('[data-action=fiber]').onclick=()=>action('fiber.goal',{goal:get('fiber')});
   dialog.querySelector('[data-action=saved]').onclick=savedMeals;
   dialog.querySelector('[data-action=recipe]').onclick=recipeBuilder;
   dialog.querySelector('[data-action=copy]').onclick=()=>action('food.copy',{date,meal:null});
  }
  layout??=fetch('premium/food-studio.html').then(res=>{if(!res.ok)throw Error('Food Studio');return res.text();});
  layout.then(html=>{const template=document.createElement('template');template.innerHTML=html;root.append(template.content);update();if(model.draft)entry(model.draft.food||null,undefined,false,model.draft);}).catch(()=>{root.append('Food Studio konnte nicht geladen werden.');});
  const observer=new MutationObserver(()=>{
   if(!host.isConnected){stopCamera();$('dialog[open]')?.close();}
  });
  observer.observe(document.body,{childList:true});
  port.subscribe(update);
  return host;
 }
 return {create};
})();
