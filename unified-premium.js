/* Presentation adapters for the existing diary, workout and check-in state. */
(() => {
 'use strict';
 const fmt=new Intl.NumberFormat('de-DE',{maximumFractionDigits:1});
 const ring=(label,used,goal)=>{
  const percent=goal>0?Math.min(100,Math.max(0,used/goal*100)):0;
  return `<div class="macro-ring"><div class="ring-meter" ${goal>0?'style="--value:'+percent+'%"':'data-unset'}><span>${fmt.format(used)}</span></div><strong>${label}</strong><small>${goal>0?'von '+fmt.format(goal):'Ohne aktives Ziel'}</small></div>`;
 };
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
    let week=document.getElementById('xpPremiumTraining');
    if(!week){week=document.createElement('section');week.id='xpPremiumTraining';anchor.before(week);}
    const plan=api.trainingWeek();
    const done=plan.filter(session=>session.complete).length;
    const text=plan.length?done+' von '+plan.length+' geplanten Einheiten vollständig abgeschlossen':'Kein aktiver Wochenplan verfügbar.';
    const markup=`<h3>Deine Trainingswoche</h3><p>${text}</p>${plan.length?`<progress max="${plan.length}" value="${done}" aria-label="Abgeschlossene Einheiten dieser Woche"></progress>`:''}`;
    if(week.innerHTML!==markup)week.innerHTML=markup;
   }
   if(area!=='diary')return;
   const anchor=document.getElementById('xpEvoDaily');
   if(!anchor)return;
   let card=document.getElementById('xpPremiumDiary');
   if(!card){
    card=document.createElement('section');card.id='xpPremiumDiary';
    const quick=document.getElementById('xpCQuick');
    if(quick)quick.after(card);else anchor.before(card);
   }
   const {used,target}=api.diary();
   const markup='<h3>Dein Ernährungstag</h3>'+[
    ['Kalorien (kcal)','k','k'],['Protein (g)','p','protein'],['Kohlenhydrate (g)','c','carbs'],['Fett (g)','f','fat']
   ].map(([label,intake,key])=>ring(label,used[intake],target?.[key])).join('')+
    `<p class="budget-copy">${target?`${fmt.format(Math.abs(target.k-used.k))} kcal ${used.k<=target.k?'im Tagesbudget':'über Tagesbudget'}`:'Deine Einträge bleiben sichtbar. Ein Ziel ist aktuell nicht verfügbar.'}</p>`;
   if(card.innerHTML!==markup)card.innerHTML=markup;
  }
  let gesture;
  document.addEventListener('pointerdown',event=>{
   if(event.target.closest('#trainingout .workHero')&&!event.target.closest('input,button,select,a')){
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
 window.fitLabPremium={attach};
})();
