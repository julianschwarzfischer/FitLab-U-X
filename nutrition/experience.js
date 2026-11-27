(() => {
 'use strict';
 const engine=window.fitLabNutritionEngine;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=(value,d=0)=>value==null?'–':value.toLocaleString('de-DE',{maximumFractionDigits:d});
 const labels=['kcal','Protein','KH','Fett','Ballastst.'];
 const format=(key,value)=>value==null?'–':number(value,key==='kcal'?0:1)+(key==='kcal'?'':' g');
 const meals={frühstück:'Frühstück',mittag:'Mittagessen',abend:'Abendessen',snack:'Snacks'};
 const image=(recipe,cls='')=>`<img class="${cls}" src="nutrition/recipes/${recipe.id}.webp" alt="${escape(recipe.name)}"${cls?' loading="lazy"':''}>`;
 const facts=(recipe,portion,tag='b')=>`<div class="facts">${engine.nutrients.map((key,i)=>`<div><${tag}>${format(key,recipe.values[key]===null?null:recipe.values[key]*portion)}</${tag}><span>${labels[i]}</span></div>`).join('')}</div>`;
 let collectionPromise;
 function load(){
  return collectionPromise??=Promise.all(['recipes','foods'].map(name=>fetch('nutrition/'+name+'.json').then(response=>{
   if(!response.ok)throw Error('Rezeptdaten fehlen');
   return response.json();
  }))).then(([r,f])=>engine.enrich(r.recipes,f.foods)).catch(error=>{collectionPromise=null;throw error});
 }
 function prefsMarkup(profile,recipes){
  const options=(values,selected)=>values.map(value=>`<option ${value===selected?'selected':''}>${escape(value)}</option>`).join('');
  const checks=(key,list)=>list.map(value=>`<label><input type="checkbox" name="${key}" value="${escape(value)}" ${profile[key].includes(value)?'checked':''}> ${escape(value)}</label>`).join('');
  const foods=[...new Map(recipes.flatMap(r=>r.rows.map(({food})=>[food.id,food.name]))).entries()].sort((a,b)=>a[1].localeCompare(b[1],'de'));
  return `<form class="profile-food"><h2>Meine Ernährung</h2><label>Ernährungsform <select name="diet">${options(engine.diets,profile.diet)}</select></label>
   <label>Zubereitungszeit <select name="minutes">${[[0,'Keine Einschränkung'],[15,'Maximal 15 Minuten'],[30,'Maximal 30 Minuten'],[60,'Bis zu 60 Minuten']].map(([value,label])=>`<option value="${value}" ${value===profile.minutes?'selected':''}>${label}</option>`).join('')}</select></label>
   <fieldset><legend>Bevorzugte Lebensmittel</legend>${checks('foods',Object.keys(engine.foodGroups))}</fieldset>
   <fieldset><legend>Bevorzugte Gerichte</legend>${checks('dishes',engine.dishes)}</fieldset>
   <fieldset><legend>Allergien</legend>${checks('allergy',engine.allergens)}</fieldset>
   <fieldset><legend>Unverträglichkeiten</legend>${checks('intolerance',engine.allergens)}</fieldset>
   <label>Ausgeschlossene Katalogzutaten <select name="excluded" size="5" multiple>${foods.map(([id,name])=>`<option value="${id}" ${profile.exclusions.includes(id)?'selected':''}>${escape(name)}</option>`).join('')}</select></label>
   <label>Weitere Ausschlüsse, durch Kommas getrennt (keine Empfehlung bis zur eindeutigen Zuordnung)<textarea name="other">${escape(profile.exclusions.filter(x=>!foods.some(([id])=>id===x)).join(', '))}</textarea></label>
   <button class="primary">Speichern</button><output aria-live="polite"></output></form>`;
 }
 function show(api){
  const host=document.createElement('fitlab-nutrition'),root=host.attachShadow({mode:'open'});
  root.innerHTML=`<link rel="stylesheet" href="nutrition/reference.css"><div class="shell"><header><span class="brand"><b>╫</b> FITNESS LAB</span><a href="#tagebuch" data-action="diary">Tagebuch ↗</a></header>
   <main><div class="wrap intro"><div class="eyebrow">FITNESS LAB · PERSONAL NUTRITION</div><h1>Deine Rezeptwelt.</h1><div class="tabs"><button data-action="personal">Für mich</button><button data-action="all">Alle Rezepte</button></div><div id="context"></div></div>
   <div id="hero"></div><div id="recommendation"></div><div id="catalog" class="collection" hidden></div><div class="wrap"><label>Mahlzeit <select class="goal" id="meal">${Object.entries(meals).map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select></label>
   <details id="preferences"><summary>Meine Ernährung</summary><div></div></details></div></main>
   <footer class="foot"><button data-action="back">Zurück zum Dashboard ↑</button></footer></div>`;
  const $=id=>root.getElementById(id);
  let recipes=[],recommendations=[],profile=engine.defaults(api.preferences()),active=0,view='personal',busy=false,booked=false;
  let meal=api.meal();
  $('meal').value=meal;
  const portions=new Map();
  const key=recipe=>view+recipe.id;
  const portion=recipe=>portions.get(key(recipe))??(view==='personal'?recommendations[active]?.portion:1)??1;
  const warnings=recipe=>{
   const extra=recipe.rows.some(({food})=>['F006','F021','F027','F029','F031','F036','F042','F047','F050'].includes(food.id))?'Rohe tierische Zutaten durchgaren. Im Zweifel mindestens 70 °C für zwei Minuten an allen Stellen. Rohware getrennt verarbeiten.':'';
   const legumes=recipe.rows.some(({food})=>['F024','F037','F038','F049','F052','F053','F064'].includes(food.id))?'Hülsenfrüchte vollständig garen. Bei TK-Ware Packungsanleitung beachten und Konserven im angegebenen Zustand abwiegen.':'';
   const conditional=recipe.diet_condition||'';
   return [...engine.restrictions(recipe,profile),conditional,extra,legumes].filter(Boolean);
  };
  function detail(recipe,multiplier){
   const blocked=engine.restrictions(recipe,profile);
   return `<div class="portion"><strong>Portion wählen</strong><small>Alle Mengen passen sich an.</small></div>
    <div class="portion-options" aria-label="Portionsgröße">${engine.portions.map(value=>`<button data-action="portion" data-id="${recipe.id}" data-value="${value}" aria-pressed="${value===multiplier}">${number(value,1)}</button>`).join('')}</div>${facts(recipe,multiplier,'strong')}<small>Berechnete Richtwerte je gewählte Portion.</small>
    <h3>Zutaten</h3><ul class="ingredients">${recipe.rows.map(({food,grams})=>`<li><span>${escape(food.name)} <small>(${escape(food.state)})</small></span><strong>${number(grams*multiplier/recipe.base_servings,2)} g</strong></li>`).join('')}</ul>
    <h3 class="line">Zubereitung</h3>${recipe.passive_time?`<p>${escape(recipe.passive_time)}</p>`:''}<ol class="steps">${recipe.steps.map(step=>`<li>${escape(step)}</li>`).join('')}</ol>
    <p>Allergene laut Zutatenliste: ${escape(recipe.declared.join(', ')||'keine deklariert')}. Etiketten und Kreuzkontakte prüfen.</p>
    ${warnings(recipe).map(warning=>`<p class="warning">${escape(warning)}</p>`).join('')}
    <details class="data-note"><summary>Daten- und Berechnungshinweise</summary><div class="data-copy">
    <p>Max Rubner-Institut (2025), BLS 4.0 · CC BY 4.0. Ergänzend USDA SR28 (2015). Zutatenbasierte Richtwerte ohne gemessenes Fertiggewicht. Ein Gedankenstrich steht für einen nicht quantifizierten Wert.</p>
    <ul>${recipe.rows.map(({food})=>`<li>${escape(food.name)} · ${escape(food.source)} ${escape(food.source_record_id)} ${escape(food.source_note)}</li>`).join('')}</ul></div></details>
    <button class="primary" data-action="book" data-id="${recipe.id}" ${blocked.length||busy?'disabled':''}>Ins Tagebuch übernehmen</button><div class="message" role="status"></div>`;
  }
  function displayPersonal(){
   const model=api.model(meal);
   recommendations=engine.rank(recipes,{...model,profile,meal}).slice(0,8);
   active=Math.min(active,Math.max(0,recommendations.length-1));
   const current=recommendations[active];
   $('context').innerHTML=`<p>Abgestimmt auf deine persönlichen Ziele.</p>${model.goals.map(goal=>`<small class="pill">${escape(goal)}</small>`).join(' ')}`;
   if(!current){
    $('hero').innerHTML='<div class="wrap"><p>Für deine aktuellen Angaben gibt es keine passende persönliche Empfehlung.</p><small>Ein fehlender Vorschlag ist keine Empfehlung, eine Mahlzeit auszulassen.</small></div>';
    $('recommendation').replaceChildren();
    return;
   }
   const {recipe,reason}=current;
   $('hero').innerHTML=`<div class="slider" aria-label="Rezeptauswahl"><section class="slide">${image(recipe)}<div class="wrap"><div class="eyebrow">Empfehlung ${active+1} / ${recommendations.length}</div><h2>${escape(recipe.name)}</h2><p>${number(recipe.values.kcal*current.portion)} kcal · ${number(recipe.values.protein_g*current.portion,1)} g Protein · ${recipe.minutes} Min.</p><p><small>Vorschlag: ${number(current.portion,1)} Portion(en). ${escape(reason)}</small></p><button class="primary" data-action="detail">Rezept entdecken ↓</button></div></section></div>
    <div class="dots">${recommendations.map(({recipe},i)=>`<button data-action="slide" data-value="${i}" aria-label="${escape(recipe.name)}" aria-current="${i===active}">${i===active?'●':'○'}</button>`).join('')}<br><small>Weitere Gerichte durch Wischen entdecken</small></div>`;
   $('recommendation').innerHTML=`<section class="budgetbox"><div class="wrap"><div class="eyebrow">Heute noch verfügbar</div><div class="daystats">${escape(model.budget)}</div></div></section>
    <div class="wrap selector" id="recipe-detail"><div class="eyebrow">Dein Rezept</div><div class="tabs">${recommendations.map(({recipe},i)=>`<button class="${active===i?'active':''}" data-action="slide" data-value="${i}">${escape(recipe.name)}</button>`).join('')}</div></div>
    <article class="recipe"><div class="wrap"><div class="eyebrow">Rezept im Detail</div><h2>${escape(recipe.name)}</h2><small>${recipe.minutes} Min. · ${escape(recipe.category)}</small>${detail(recipe,portion(recipe))}</div></article>`;
  }
  function displayCollection(){
   const query=engine.normalize($('search').value).split(/\s+/).filter(Boolean);
   const sort=$('sort').value;
   const numeric=(a,b,key,dir)=>dir*((a.values[key]??(dir===1?Infinity:-Infinity))-(b.values[key]??(dir===1?Infinity:-Infinity)));
   const rank=sort==='fit'?new Map(engine.rank(recipes,{...api.model(meal),profile,meal}).map((item,i)=>[item.recipe.id,i])):null;
   const results=recipes.filter(recipe=>query.every(word=>recipe.search.includes(word)));
   results.sort((a,b)=>(sort==='fit'?(rank.get(a.id)??Infinity)-(rank.get(b.id)??Infinity):sort==='time'?a.minutes-b.minutes:sort==='original'?0:numeric(a,b,sort,sort==='kcal'?1:-1))||a.index-b.index);
   $('catalog-status').textContent=results.length+' Rezepte · Nährwerte pro Portion sind berechnete Richtwerte.';
   $('catalog-list').innerHTML=results.map(recipe=>`<details data-id="${recipe.id}"><summary><div class="entryhead">${image(recipe,'thumb')}<div class="entrytext"><small>${escape(recipe.category)} · ${recipe.minutes} Min.</small><strong>${escape(recipe.name)}</strong></div><span class="chev" aria-hidden="true">⌄</span></div>${facts(recipe,1)}<div class="basis">Pro Portion · berechnete Richtwerte</div>${engine.restrictions(recipe,profile).map(x=>`<small class="warning">${escape(x)}</small>`).join(' ')}</summary><div class="recipe-tools"></div></details>`).join('');
  }
  function render(){
   root.querySelectorAll('.intro .tabs button').forEach(button=>{
    button.classList.toggle('active',button.dataset.action===view);
    button.setAttribute('aria-pressed',button.dataset.action===view);
   });
   for(const id of ['hero','recommendation','context'])$(id).hidden=view==='all';
   $('catalog').hidden=view!=='all';
   if(view==='personal')displayPersonal();else displayCollection();
  }
  function updateDetails(section){
   const recipe=recipes.find(item=>item.id===section.dataset.id);
   if(recipe)section.querySelector('.recipe-tools').innerHTML=image(recipe)+detail(recipe,portion(recipe));
  }
  let touch;
  root.addEventListener('touchstart',event=>{
   if(event.target.closest('.slider'))touch=[event.changedTouches[0].clientX,event.changedTouches[0].clientY];
  },{passive:true});
  root.addEventListener('touchcancel',()=>{touch=null},{passive:true});
  root.addEventListener('touchend',event=>{
   if(!touch)return;
   const {clientX,clientY}=event.changedTouches[0];
   const dx=clientX-touch[0],dy=clientY-touch[1];touch=null;
   if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3&&recommendations.length>1){
    active=(active+(dx<0?1:-1)+recommendations.length)%recommendations.length;render();
   }
  },{passive:true});
  root.addEventListener('click',async event=>{
   const control=event.target.closest('[data-action]');
   if(!control)return;
   event.preventDefault();
   const {action,value,id}=control.dataset;
   if(action==='diary'||action==='back'){api.navigate(action);return;}
   if(!recipes.length)return;
   if(action==='personal'||action==='all'){view=action;render();return;}
   if(action==='detail'){$('recipe-detail').scrollIntoView({behavior:'instant'});return;}
   if(action==='slide'){active=Number(value);render();return;}
   const recipe=recipes.find(item=>item.id===id);
   if(!recipe)return;
   if(action==='portion'){
    portions.set(key(recipe),Number(value));
    if(view==='all')updateDetails(control.closest('details[data-id]'));else render();
    return;
   }
   if(action!=='book'||busy||booked||engine.restrictions(recipe,profile).length)return;
   if(!confirm(`${recipe.name} · ${number(portion(recipe),1)} Portion(en) als einzelne Zutaten in „${meals[meal]}“ erfassen?`))return;
   busy=true;control.disabled=true;
   const message=control.nextElementSibling;
   try{
    booked=await api.book(recipe,portion(recipe),meals[meal]);
    if(booked){
     render();
     const notice=document.createElement('p');notice.className='wrap message';notice.textContent='Zutaten im Tagebuch gespeichert.';notice.setAttribute('role','status');
     $(view==='all'?'catalog':'recommendation').prepend(notice);
     setTimeout(()=>{booked=false},800);
    }else message.textContent='Buchung konnte nicht bestätigt werden. Prüfe dein Tagebuch.';
   }catch(error){message.textContent=error.message;}
   finally{busy=false;if(control.isConnected)control.disabled=false;}
  });
  $('meal').addEventListener('change',()=>{meal=$('meal').value;active=0;render();});
  $('preferences').addEventListener('submit',event=>{
   event.preventDefault();
   const form=event.target,data=new FormData(form);
   profile=engine.defaults({diet:data.get('diet'),minutes:Number(data.get('minutes')),allergy:data.getAll('allergy'),
    intolerance:data.getAll('intolerance'),foods:data.getAll('foods'),dishes:data.getAll('dishes'),
    exclusions:[...data.getAll('excluded'),...String(data.get('other')).split(',').map(x=>x.trim()).filter(Boolean)]});
   form.querySelector('output').textContent=api.store(profile)?'Gespeichert.':'Speicherung fehlgeschlagen.';
   active=0;render();
  });
  load().then(data=>{
   recipes=data;
   $('preferences').querySelector('div').innerHTML=prefsMarkup(profile,recipes);
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
