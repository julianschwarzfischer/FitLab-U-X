/* Presentation adapters for the existing diary, workout and check-in state. */
(() => {
 'use strict';
 const fmt=new Intl.NumberFormat('de-DE',{maximumFractionDigits:1});
 const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function meter(value,max,caption,unit=''){
  const percent=max>0&&Number.isFinite(value)?Math.min(100,Math.max(0,value/max*100)):null;
  return `<div class="ring-meter" ${percent===null?'data-unset':`style="--value:${percent}%"`} aria-label="${caption}"><span>${Number.isFinite(value)?fmt.format(value)+unit:'–'}</span></div>`;
 }
 function ring(label,used,goal,unit){
  return `<div class="macro-ring">${meter(used,goal,label)}<strong>${label}</strong><small>${goal>0?'von '+fmt.format(goal)+' '+unit:'Ohne aktives Ziel'}</small></div>`;
 }
 function appendBefore(anchor,id){
  let panel=document.getElementById(id);
  if(!panel){panel=document.createElement('section');panel.id=id;}
  if(panel.nextElementSibling!==anchor)anchor.before(panel);
  return panel;
 }
 function setMarkup(panel,markup){
  if(panel.premiumMarkup===markup)return;
  panel.premiumMarkup=markup;
  panel.innerHTML=markup;
 }
 function attach(api){
  const wall=document.createElement('div');
  wall.id='fitlab-scene';wall.setAttribute('aria-hidden','true');
  document.body.prepend(wall);
  function sync(){
   const {area,sex,exercise}=api.context();
   const body=document.body;
   if(area){
    body.dataset.premiumArea=area;body.dataset.premiumAvatar=sex??'';body.dataset.premiumExercise=exercise??'';
   }else delete body.dataset.premiumArea;
   if(area==='training'){
    const anchor=document.getElementById('xpTrainingChoice');
    if(!anchor)return;
    const week=appendBefore(anchor,'xpPremiumTraining');
    const {complete,total,avatar,workout}=api.trainingWeek();
    setMarkup(week,`<div class="training-overview"><div class="training-avatar" aria-hidden="true">${avatar}</div><div class="training-week"><h3>Deine Trainingswoche</h3>
     ${total?meter(complete,total,complete+' von '+total+' geplanten Einheiten',' / '+total)+'<small>Einheiten diese Woche</small>':'<p>Kein aktiver Wochenplan verfügbar.</p>'}</div></div>
     <dl class="training-totals"><div><dt>Heute geplant</dt><dd>${workout?workout.minutes+' Min.':'–'}</dd></div>
     <div><dt>Übungen</dt><dd>${workout?.exercises??'–'}</dd></div><div><dt>Sätze geplant</dt><dd>${workout?.sets??'–'}</dd></div></dl>`);
   }
   if(area==='workout'){
    const anchor=document.querySelector('#trainingout .workHero');
    if(!anchor)return;
    const {index,count,name,pause,caps}=api.workout();
    const atlas=document.getElementById('xp3Atlas');
    if(atlas&&atlas.previousElementSibling!==anchor.parentElement)anchor.parentElement.after(atlas);
    if(!name)return;
    const intro=appendBefore(anchor,'xpPremiumWorkout');
    setMarkup(intro,`<small class="premium-kicker">Aktives Workout · ${index+1} / ${count}</small><h2>${safe(name)}</h2><p>${caps} Sätze${pause?' · '+pause+' Sek. Satzpause':''}</p>`);
   }
   if(area==='recovery'){
    const {check,guidance,view}=api.recovery();
    const parent=document.getElementById(view==='coach'?'xpDeep':'xpCheck');
    if(!parent?.firstElementChild)return;
    const recovery=document.getElementById('xpPremiumRecovery')||document.createElement('section');
    recovery.id='xpPremiumRecovery';
    if(recovery.parentNode!==parent||recovery!==parent.firstElementChild)parent.prepend(recovery);
    setMarkup(recovery,`<small class="premium-kicker">Recovery &amp; Coach</small><h2>Erholung ist deine Stärke.</h2><p>Dein Körper gibt dir Signale. Hör auf ihn.</p>
     <section class="recovery-measures" aria-label="Dein heutiger Check-in"><h3>Dein heutiger Check-in</h3><div class="recovery-rings">${[
      ['Schlaf',check.sleep,24,' h'],['Energie',check.energy,5,'/5'],['Muskelkater',check.soreness,4,'/4']
     ].map(([title,value,max,unit])=>`<div>${meter(value,max,title,unit)}<strong>${title}</strong>${Number.isFinite(value)?'':'<small>Nicht erfasst</small>'}</div>`).join('')}</div></section>
     <section class="recovery-guidance"><h3>Dein Coach</h3>${guidance}
      ${view==='coach'?'<button type="button" data-recovery-check>Check-in ansehen</button>':''}</section>`);
    const button=recovery.querySelector('[data-recovery-check]');
    if(button)button.onclick=api.openCheck;
   }
   if(area!=='diary')return;
   const quick=document.getElementById('xpCQuick');
   if(!quick)return;
   const card=appendBefore(quick,'xpPremiumDiary');
   const {used,target}=api.diary();
   setMarkup(card,'<h3>Tagesbilanz</h3>'+[
    ['Kalorien (kcal)','k','k','kcal'],['Protein (g)','p','protein','g'],['Kohlenhydrate (g)','c','carbs','g'],['Fett (g)','f','fat','g']
   ].map(([label,intake,key,unit])=>ring(label,used[intake],target?.[key],unit)).join('')+
    `<p class="budget-copy">${target?`${fmt.format(Math.abs(target.k-used.k))} kcal ${used.k<=target.k?'im Tagesbudget':'über Tagesbudget'}`:'Deine Einträge bleiben sichtbar. Ein Ziel ist aktuell nicht verfügbar.'}</p>`);
  }
  let gesture;
  document.addEventListener('pointerdown',event=>{
   if(event.target.closest('#trainingout .workHero,#xpPremiumWorkout')&&!event.target.closest('input,button,select,a')){
    gesture={pointer:event.pointerId,x:event.clientX,y:event.clientY};
   }
  },{passive:true});
  document.addEventListener('pointercancel',()=>{gesture=null},{passive:true});
  document.addEventListener('pointerup',event=>{
   if(!gesture||gesture.pointer!==event.pointerId)return;
   const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
   gesture=null;
   if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)api.changeExercise(dx<0?1:-1);
  },{passive:true});
  return {sync};
 }
 function ask(message,{title='Bitte bestätigen',action='Übernehmen',danger=false,value,type='text',min,max,step,inform=false}={}){
  if(document.getElementById('fitlab-confirmation'))return Promise.resolve(null);
  const previous=document.activeElement;
  const dialog=document.createElement('dialog');
  dialog.id='fitlab-confirmation';
  dialog.setAttribute('aria-labelledby','fitlab-dialog-title');
  dialog.setAttribute('aria-describedby','fitlab-dialog-copy');
  dialog.innerHTML=`<form><h2 id="fitlab-dialog-title"></h2><p id="fitlab-dialog-copy"></p>
   <div class="fitlab-dialog-actions"><button type="button" class="secondary" data-cancel autofocus></button>
   ${inform?'':`<button type="submit" class="${danger?'danger':''}" data-accept></button>`}</div></form>`;
  const form=dialog.firstElementChild;
  const body=form.querySelector('p');
  form.querySelector('h2').textContent=title;
  body.textContent=message;
  const cancel=form.querySelector('[data-cancel]'),accept=form.querySelector('[data-accept]');
  cancel.textContent=inform?'Schließen':'Abbrechen';
  if(accept)accept.textContent=action;
  let input;
  if(value!==undefined){
   input=document.createElement('input');input.type=type;input.value=value;
   input.setAttribute('aria-labelledby',body.id);
   if(min!==undefined)input.min=min;
   if(max!==undefined)input.max=max;
   if(step!==undefined)input.step=step;
   body.after(input);
  }
  return new Promise(resolve=>{
   let answer=null;
   cancel.onclick=()=>dialog.close();
   form.onsubmit=event=>{event.preventDefault();answer=input?.value??'';dialog.close()};
   dialog.addEventListener('close',()=>{
    dialog.remove();
    previous?.focus({preventScroll:true});
    resolve(answer);
   },{once:true});
   document.body.append(dialog);
   dialog.showModal();
   (input||cancel).focus({preventScroll:true});
  });
 }
 window.fitLabPremium={attach,ask};
})();
