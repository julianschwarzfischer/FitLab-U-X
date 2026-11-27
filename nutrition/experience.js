(() => {
 'use strict';
 const engine=window.fitLabNutritionEngine,safety=window.fitLabNutritionSafety;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=(value,d=0)=>value==null?'–':value.toLocaleString('de-DE',{maximumFractionDigits:d});
 const labels=['kcal','Protein','KH','Fett','Ballastst.'];
 const format=(key,value)=>value==null?'–':number(value,key==='kcal'?0:1)+(key==='kcal'?'':' g');
 const meals={frühstück:'Frühstück',mittag:'Mittagessen',abend:'Abendessen',snack:'Snacks'};
 const image=(recipe,cls='')=>`<img class="${cls}" src="nutrition/recipes/${recipe.id}.webp" alt="${escape(recipe.name)}"${cls?' loading="lazy"':''}>`;
 const facts=(recipe,portion,tag='b')=>`<div class="facts">${engine.nutrients.map((key,i)=>`<div><${tag}>${format(key,recipe.values[key]===null?null:recipe.values[key]*portion)}</${tag}><span>${labels[i]}</span></div>`).join('')}</div>`;
 let collectionPromise;
 function load(){
  return collectionPromise??=Promise.all(['recipes','foods','allergen-matrix'].map(name=>fetch('nutrition/'+name+'.json?v=390').then(response=>{
   if(!response.ok)throw Error('Rezeptdaten fehlen');
   return response.json();
  }))).then(([r,f,matrix])=>safety.attachMatrix(engine.enrich(r.recipes,f.foods),matrix)).catch(error=>{collectionPromise=null;throw error});
 }
 function prefsMarkup(profile,recipes,protection){
  const unknown=[...(profile.exclusions||[]).filter(id=>!safety.knownIds.includes(id)),
   ...['allergy','intolerance'].flatMap(key=>(Array.isArray(protection.selection?.[key])?protection.selection[key]:[]).filter(group=>!safety.groups.includes(group)))];
  const options=(values,selected)=>values.map(value=>`<option ${value===selected?'selected':''}>${escape(value)}</option>`).join('');
  const checks=(key,list)=>list.map(value=>`<label><input type="checkbox" name="${key}" value="${escape(value)}" ${profile[key].includes(value)?'checked':''}> ${escape(value)}</label>`).join('');
  const foods=[...new Map(recipes.flatMap(r=>r.rows.map(({food})=>[food.id,food.name]))).entries()].sort((a,b)=>a[1].localeCompare(b[1],'de'));
  return `<form class="profile-food"><h2>Meine Ernährung</h2><label>Ernährungsform <select name="diet">${options(engine.diets,profile.diet)}</select></label>
   <label>Zubereitungszeit <select name="minutes">${[[0,'Keine Einschränkung'],[15,'Maximal 15 Minuten'],[30,'Maximal 30 Minuten'],[60,'Bis zu 60 Minuten']].map(([value,label])=>`<option value="${value}" ${value===profile.minutes?'selected':''}>${label}</option>`).join('')}</select></label>
   <p class="preference-label">Vorlieben · optional</p><fieldset><legend>Bevorzugte Lebensmittel</legend>${checks('foods',Object.keys(engine.foodGroups))}</fieldset>
   <fieldset><legend>Bevorzugte Gerichte</legend>${checks('dishes',engine.dishes)}</fieldset>
   <p class="preference-label">Ausschlüsse · verbindlich</p><fieldset><legend>Allergien</legend>${checks('allergy',engine.allergens)}</fieldset>
   <fieldset><legend>Unverträglichkeiten</legend>${checks('intolerance',engine.allergens)}</fieldset>
   <label>Ausgeschlossene Katalogzutaten <select name="excluded" size="5" multiple>${foods.map(([id,name])=>`<option value="${id}" ${profile.exclusions.includes(id)?'selected':''}>${escape(name)}</option>`).join('')}</select></label>
   <label>Weitere Ausschlüsse oder ungeklärte Angaben, durch Kommas getrennt<textarea name="other">${escape(unknown.join(', '))}</textarea></label>
   <button class="primary">Speichern</button><output aria-live="polite"></output></form>`;
 }
 function show(api){
  const host=document.createElement('fitlab-nutrition'),root=host.attachShadow({mode:'open'});
  root.innerHTML=`<link rel="stylesheet" href="nutrition/reference.css?v=390"><div class="recipe-scene" aria-hidden="true"></div><div class="shell"><header><span class="brand"><b>╫</b> FITNESS LAB</span><a href="#tagebuch" data-action="diary">Tagebuch ↗</a></header>
   <main><div class="wrap intro"><div class="eyebrow">FITNESS LAB · PERSONAL NUTRITION</div><h1>Deine Rezeptwelt.</h1><div class="tabs"><button data-action="personal">Für mich</button><button data-action="all">Alle Rezepte</button><button data-action="profile">Fine-Tuning</button></div><div id="context"></div></div>
   <div id="protection-status" class="wrap" hidden><p></p><button class="primary" data-action="profile">Meine Ernährung prüfen</button></div><div id="hero"></div><div id="recommendation"></div><div id="catalog" class="collection" hidden></div><div class="wrap"><label>Mahlzeit <select class="goal" id="meal">${Object.entries(meals).map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select></label>
   <details id="preferences"><summary>Meine Ernährung</summary><div></div></details></div></main>
   <div id="booking-status" role="status" class="wrap" hidden></div><footer class="foot"><button data-action="back">Zurück zum Dashboard ↑</button></footer></div>`;
  const $=id=>root.getElementById(id);
  let protection=api.preferences(),profile=engine.defaults(protection.selection??{}),saving=false;
  let recipes=[],recommendations=[],active=0,view='personal',busy=false,booked=false;
  const gate=recipe=>safety.recipeGate(recipe,protection);
  function refresh(force=false){
   const latest=api.preferences();
   if(force||JSON.stringify(latest)!==JSON.stringify(protection)){
    protection=latest;profile=engine.defaults(protection.selection??{});active=0;
    if(recipes.length)$('preferences').querySelector('div').innerHTML=prefsMarkup(profile,recipes,protection);
   }
   if(recipes.length)render();
  }
  host.refreshProtection=refresh;
  let meal=api.meal();
  $('meal').value=meal;
  const portions=new Map();
  const key=recipe=>view+recipe.id;
  const portion=recipe=>portions.get(key(recipe))??(view==='personal'?recommendations[active]?.portion:1)??1;
  const warnings=recipe=>{
   const extra=recipe.rows.some(({food})=>['F006','F021','F027','F029','F031','F036','F042','F047','F050'].includes(food.id))?'Rohe tierische Zutaten durchgaren. Im Zweifel mindestens 70 °C für zwei Minuten an allen Stellen. Rohware getrennt verarbeiten.':'';
   const legumes=recipe.rows.some(({food})=>['F024','F037','F038','F049','F052','F053','F064'].includes(food.id))?'Hülsenfrüchte vollständig garen. Bei TK-Ware Packungsanleitung beachten und Konserven im angegebenen Zustand abwiegen.':'';
   const conditional=recipe.diet_condition||'';
   return [...new Set([gate(recipe).reason,conditional,...(recipe.preparation_safety_notes||[]),extra,legumes])].filter(Boolean);
  };
  function detail(recipe,multiplier){
   const blocked=gate(recipe).status!=='checked';
   return `<div class="portion"><strong>Portion wählen</strong><small>Alle Mengen passen sich an.</small></div>
    <div class="portion-options" aria-label="Portionsgröße">${engine.portions.map(value=>`<button data-action="portion" data-id="${recipe.id}" data-value="${value}" aria-pressed="${value===multiplier}">${number(value,1)}</button>`).join('')}</div>${facts(recipe,multiplier,'strong')}<small>Berechnete Richtwerte je gewählte Portion.</small>
    <h3>Zutaten</h3><ul class="ingredients">${recipe.rows.map(({food,grams})=>`<li><span>${escape(food.name)} <small>(${escape(food.state)})</small></span><strong>${number(grams*multiplier/recipe.base_servings,2)} g</strong></li>`).join('')}</ul>
    <h3 class="line">Zubereitung</h3>${recipe.passive_time?`<p>${escape(recipe.passive_time)}</p>`:''}<ol class="steps">${recipe.steps.map(step=>`<li>${escape(step)}</li>`).join('')}</ol>
    <p>Allergene nach Standardzutaten: ${escape(recipe.declared.join(', ')||'keine der 14 Gruppen als enthalten ermittelt')}. Konkrete Etiketten und Kreuzkontakte sind nicht bestätigt.</p>
    <small>${escape(recipe.image_notice||'')}</small>
    ${warnings(recipe).map(warning=>`<p class="warning">${escape(warning)}</p>`).join('')}
    <details class="data-note"><summary>Daten- und Berechnungshinweise</summary><div class="data-copy">
    <p>Max Rubner-Institut (2025), BLS 4.0 · CC BY 4.0. Ergänzend USDA SR28 (2015). Zutatenbasierte Richtwerte ohne gemessenes Fertiggewicht. Ein Gedankenstrich steht für einen nicht quantifizierten Wert.</p>
    <ul>${recipe.rows.map(({food})=>`<li>${escape(food.name)} · ${escape(food.source)} ${escape(food.source_record_id)} ${escape(food.source_note)} ${escape(food.recipe_standard||'')}</li>`).join('')}</ul></div></details>
    <button class="primary" data-action="book" data-id="${recipe.id}" ${blocked||busy?'disabled':''}>Ins Tagebuch übernehmen</button><div class="message" role="status"></div>`;
  }
  function displayPersonal(){
   const model=api.model(meal);
   recommendations=engine.rank(recipes,{...model,profile,meal,protection}).slice(0,8);
   active=Math.min(active,Math.max(0,recommendations.length-1));
   const current=recommendations[active];
   $('context').innerHTML=`<p>Abgestimmt auf deine persönlichen Ziele.</p>${model.goals.map(goal=>`<small class="pill">${escape(goal)}</small>`).join(' ')}`;
   if(!current){
    root.querySelector('.recipe-scene').style.backgroundImage='';
    $('hero').innerHTML='<div class="wrap"><p>Für deine aktuellen Angaben gibt es keine passende persönliche Empfehlung.</p><small>Ein fehlender Vorschlag ist keine Empfehlung, eine Mahlzeit auszulassen.</small></div>';
    $('recommendation').replaceChildren();
    return;
   }
   const track=$('hero').querySelector('.slider');
   const ids=recommendations.map(item=>item.recipe.id).join(',');
   if(track?.dataset.recipes!==ids){
    $('hero').innerHTML=`<div class="slider" tabindex="0" aria-label="Rezeptauswahl" data-recipes="${ids}">${recommendations.map(({recipe},i)=>`<section class="slide"><button tabindex="-1" data-action="slide" data-value="${i}" aria-label="${escape(recipe.name)}">${image(recipe)}</button></section>`).join('')}</div>
     <div class="dots">${recommendations.map(({recipe},i)=>`<button data-action="slide" data-value="${i}" aria-label="${escape(recipe.name)}">○</button>`).join('')}</div><div class="wrap" id="slide-copy"></div>`;
    const slider=$('hero').querySelector('.slider');
    let scrollFrame;
    slider.addEventListener('keydown',event=>{
     if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
     event.preventDefault();
     active=Math.min(recommendations.length-1,Math.max(0,active+(event.key==='ArrowRight'?1:-1)));
     scrollToRecipe();displayCurrent(api.model(meal));
    });
    slider.addEventListener('scroll',()=>{
     cancelAnimationFrame(scrollFrame);
     scrollFrame=requestAnimationFrame(()=>{
      if(!slider.isConnected)return;
      const first=slider.firstElementChild.offsetLeft;
      const closest=[...slider.children].reduce((best,child,i)=>
       Math.abs(child.offsetLeft-first-slider.scrollLeft)<Math.abs(slider.children[best].offsetLeft-first-slider.scrollLeft)?i:best,0);
      if(active!==closest){active=closest;displayCurrent(api.model(meal));}
     });
    },{passive:true});
    scrollToRecipe();
   }
   displayCurrent(model);
  }
  function scrollToRecipe(){
   const track=$('hero').querySelector('.slider'),card=track?.children[active];
   if(card)track.scrollLeft=card.offsetLeft-track.firstElementChild.offsetLeft;
  }
  function displayCurrent(model){
   const current=recommendations[active],{recipe,reason}=current;
   root.querySelector('.recipe-scene').style.backgroundImage=`url("nutrition/recipes/${recipe.id}.webp")`;
   $('hero').querySelectorAll('.dots button').forEach((button,i)=>{
    button.setAttribute('aria-current',String(i===active));button.textContent=i===active?'●':'○';
   });
   $('slide-copy').innerHTML=`<div class="eyebrow">Empfehlung ${active+1} / ${recommendations.length}</div><h2>${escape(recipe.name)}</h2><p>${number(recipe.values.kcal*current.portion)} kcal · ${number(recipe.values.protein_g*current.portion,1)} g Protein · ${recipe.minutes} Min.</p><p><small>Vorschlag: ${number(current.portion,1)} Portion(en). ${escape(reason)}</small></p>${recipe.special_population_notice?`<p class="warning">${escape(recipe.special_population_notice)}</p>`:''}<button class="primary" data-action="detail">Rezept entdecken ↓</button>`;
   $('recommendation').innerHTML=`<section class="budgetbox"><div class="wrap"><div class="eyebrow">Heute noch verfügbar</div><div class="daystats">${escape(model.budget)}</div></div></section>
    <article class="recipe" id="recipe-detail"><div class="wrap"><div class="eyebrow">Rezept im Detail</div><h2>${escape(recipe.name)}</h2><small>${recipe.minutes} Min. · ${escape(recipe.category)}</small>${detail(recipe,portion(recipe))}</div></article>`;
  }
  function bookingDialog(recipe,quantity,bookingMeal){
   return new Promise(resolve=>{
    const dialog=document.createElement('dialog');
    dialog.className='booking-dialog';
    dialog.setAttribute('aria-labelledby','booking-title');
    dialog.innerHTML=`<form method="dialog">${image(recipe)}<div class="dialog-body"><h2 id="booking-title">Rezept eintragen</h2><p>${escape(recipe.name)} · ${number(quantity,1)} Portion(en) · ${escape(bookingMeal)}</p>
     ${facts(recipe,quantity)}${recipe.special_population_notice?`<p class="warning">${escape(recipe.special_population_notice)}</p>`:''}
     <details><summary>Zutaten und Hinweise</summary>${warnings(recipe).map(warning=>`<p>${escape(warning)}</p>`).join('')}</details>
     <div class="tabs"><button value="cancel" autofocus>Abbrechen</button><button class="primary" value="book">Bestätigen</button></div></div></form>`;
    dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='book';dialog.remove();resolve(accepted)},{once:true});
    root.append(dialog);
    dialog.showModal();
   });
  }
  function displayCollection(){
   const query=engine.normalize($('search').value).split(/\s+/).filter(Boolean);
   const sort=$('sort').value;
   const numeric=(a,b,key,dir)=>dir*((a.values[key]??(dir===1?Infinity:-Infinity))-(b.values[key]??(dir===1?Infinity:-Infinity)));
   const rank=sort==='fit'?new Map(engine.rank(recipes,{...api.model(meal),profile,meal,protection}).map((item,i)=>[item.recipe.id,i])):null;
   const results=recipes.filter(recipe=>query.every(word=>recipe.search.includes(word)));
   results.sort((a,b)=>(sort==='fit'?(rank.get(a.id)??Infinity)-(rank.get(b.id)??Infinity):sort==='time'?a.minutes-b.minutes:sort==='original'?0:numeric(a,b,sort,sort==='kcal'?1:-1))||a.index-b.index);
   $('catalog-status').textContent=results.length+' Rezepte · Nährwerte pro Portion sind berechnete Richtwerte.'
    +(rank&&!rank.size?' Keine persönliche Sortierung verfügbar. Katalogreihenfolge wird angezeigt.':'');
   $('catalog-list').innerHTML=results.map(recipe=>`<details data-id="${recipe.id}"><summary><div class="entryhead">${image(recipe,'thumb')}<div class="entrytext"><small>${escape(recipe.category)} · ${recipe.minutes} Min.</small><strong>${escape(recipe.name)}</strong></div><span class="chev" aria-hidden="true">⌄</span></div>${facts(recipe,1)}<div class="basis">Pro Portion · berechnete Richtwerte</div><small class="warning">${escape(gate(recipe).reason)}</small>${recipe.special_population_notice?`<small class="warning">${escape(recipe.special_population_notice)}</small>`:''}</summary><div class="recipe-tools"></div></details>`).join('');
  }
  function render(){
   root.querySelectorAll('.intro .tabs button').forEach(button=>{
    button.classList.toggle('active',button.dataset.action===view);
    button.setAttribute('aria-pressed',button.dataset.action===view);
   });
   for(const id of ['hero','recommendation','context'])$(id).hidden=view==='all';
   $('catalog').hidden=view!=='all';
   if(view==='personal')displayPersonal();else displayCollection();
   const profileNotice=$('protection-status');
   profileNotice.hidden=protection.status==='confirmed';
   profileNotice.querySelector('p').textContent=safety.statusText[protection.status]||'';
  }
  function updateDetails(section){
   const recipe=recipes.find(item=>item.id===section.dataset.id);
   if(recipe)section.querySelector('.recipe-tools').innerHTML=image(recipe)+detail(recipe,portion(recipe));
  }
  root.addEventListener('click',async event=>{
   const control=event.target.closest('[data-action]');
   if(!control||control.closest('dialog'))return;
   event.preventDefault();
   const {action,value,id}=control.dataset;
   if(action==='diary'||action==='back'){api.navigate(action);return;}
   if(!recipes.length)return;
   if(action==='personal'||action==='all'){view=action;render();return;}
   if(action==='profile'){$('preferences').open=true;$('preferences').scrollIntoView({behavior:'instant'});return;}
   if(action==='detail'){$('recipe-detail').scrollIntoView({behavior:'instant'});return;}
   if(action==='slide'){active=Number(value);scrollToRecipe();displayCurrent(api.model(meal));return;}
   const recipe=recipes.find(item=>item.id===id);
   if(!recipe)return;
   if(action==='portion'){
    portions.set(key(recipe),Number(value));
    if(view==='all')updateDetails(control.closest('details[data-id]'));else render();
    return;
   }
   if(action!=='book'||busy||booked||gate(recipe).status!=='checked')return;
   const revision=protection.revision,confirmedDate=api.date(),quantity=portion(recipe),bookingMeal=meals[meal];
   busy=true;
   const message=$('booking-status');
   message.hidden=true;
   try{
    if(!await bookingDialog(recipe,quantity,bookingMeal))return;
    if(!host.isConnected)return;
    booked=await api.book(recipe,quantity,bookingMeal,revision,confirmedDate);
    if(booked){
     render();
     const notice=document.createElement('p');notice.className='wrap message';notice.textContent='Zutaten im Tagebuch gespeichert.';notice.setAttribute('role','status');
     $(view==='all'?'catalog':'recommendation').prepend(notice);
     setTimeout(()=>{booked=false},800);
    }else{message.hidden=false;message.textContent='Buchung konnte nicht bestätigt werden. Prüfe dein Tagebuch.';}
   }catch(error){message.hidden=false;message.textContent=error.message;}
   finally{busy=false;if(control.isConnected)control.disabled=false;}
  });
  $('meal').addEventListener('change',()=>{meal=$('meal').value;active=0;render();});
  $('preferences').addEventListener('submit',async event=>{
   event.preventDefault();
   if(saving)return;
   const form=event.target,data=new FormData(form);
   const selection=engine.defaults({diet:data.get('diet'),minutes:Number(data.get('minutes')),allergy:data.getAll('allergy'),
    intolerance:data.getAll('intolerance'),foods:data.getAll('foods'),dishes:data.getAll('dishes'),
    exclusions:[...data.getAll('excluded'),...String(data.get('other')).split(',').map(x=>x.trim()).filter(Boolean)]});
   saving=true;
   form.querySelector('button').disabled=true;
   try{
    const saved=await api.store(selection,protection.revision);
    refresh(saved);
    $('preferences').querySelector('output').textContent=saved
     ?(protection.status==='confirmed'?'Gespeichert.':'Ungeklärte Angaben gespeichert. Empfehlungen und Buchung bleiben gesperrt.')
     :'Speicherung fehlgeschlagen. Bitte prüfe den aktuellen Stand.';
   }finally{saving=false;if(form.isConnected)form.querySelector('button').disabled=false}
  });
  load().then(data=>{
   recipes=data;
   $('preferences').querySelector('div').innerHTML=prefsMarkup(profile,recipes,protection);
   $('catalog').innerHTML=`<div class="eyebrow">FITNESS LAB · REZEPTKATALOG</div><h1>The Recipe Collection</h1><div class="controls"><label for="search">Rezept suchen</label><input id="search" type="search" placeholder="z. B. Lachs, Rührei"><label for="sort">Sortieren nach</label><select id="sort"><option value="original">Rezeptkatalog</option><option value="fit">Beste persönliche Übereinstimmung</option><option value="protein_g">Höchster Proteingehalt</option><option value="kcal">Wenigste Kalorien</option><option value="fiber_g">Meiste Ballaststoffe</option><option value="time">Kürzeste Zubereitungszeit</option></select><div id="catalog-status" aria-live="polite"></div></div><div id="catalog-list"></div>`;
   $('search').addEventListener('input',displayCollection);$('sort').addEventListener('change',displayCollection);
   $('catalog-list').addEventListener('toggle',event=>{
    if(event.target.matches('details[data-id]')&&event.target.open)updateDetails(event.target);
   },true);
   render();
  }).catch(()=>{$('hero').textContent='Rezeptdaten konnten nicht geladen werden. Bitte erneut öffnen.'});
  return host;
 }
 window.fitLabNutrition={show};
})();
