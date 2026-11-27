(function(root){
 'use strict';
 root.fitLabGoalView=function(api){
  const previous=document.activeElement;
  const host=document.createElement('fitlab-goal'),view=host.attachShadow({mode:'open'});
  host.tabIndex=-1;
  host.setAttribute('role','dialog');
  host.setAttribute('aria-label','Persönliches Ziel prüfen');
  host.setAttribute('aria-modal','true');
  view.innerHTML=`<link rel="stylesheet" href="nutrition/goal.css?v=390"><div class="goal-scene" aria-hidden="true"></div><main>
   <small>FITNESS LAB · GOAL INTELLIGENCE</small><h1>Dein Ziel.<br>Dein Weg.</h1>
   <p id="context"></p><section id="goal-chart" aria-label="Dokumentierter Gewichtsverlauf"></section><div class="grid"><div><label for="weight">Aktuelles Gewicht (kg)</label><input id="weight" type="number" readonly></div>
   <div><label for="target">Zielgewicht (kg)</label><input id="target" type="number" step="0.1"></div></div>
   <label for="days">Gewünschter Zeitraum (Tage)</label><input id="days" type="number" step="1">
   <div id="muscle-row"><label for="muscle">Gewünschter Muskelzuwachs (kg, optional)</label><input id="muscle" type="number" min="0" step="0.1"></div>
   <p class="note">Die Angaben aus deinem Profil fließen in die Prüfung ein. Der vorgeschlagene Zeitraum ist eine Orientierung.</p>
   <button id="evaluate">Ziel prüfen</button><section class="result" aria-live="polite" hidden>
   <small>MEINE EMPFEHLUNG FÜR DICH</small><h2 id="heading"></h2><p id="reason"></p><p id="alternative"></p>
   <button id="adopt" hidden>Alternative übernehmen</button><button id="confirm" class="secondary" disabled>Ziel bestätigen</button>
   <p id="status" class="note"></p></section><button id="back" class="secondary">Zurück</button></main>`;
  const $=id=>view.getElementById(id);
  const {profile,wish,current,legacyWeight,measurements=[]}=api.model();
  const fingerprint=root.fitLabGoalIntelligence.fingerprint(profile);
  const selected=profile.goals||[];
  const kindsForProfile=()=>[
   ...(selected.some(value=>value===0||value===1)?['fatLoss']:[]),
   ...(selected.includes(2)?['muscleGain']:[]),
   ...(selected.includes(7)?['weightGain']:[]),
   ...(selected.includes(6)?['maintain']:[])
  ];
  const goalKinds=kindsForProfile();
  let kinds=wish?.kinds|| (goalKinds.length?goalKinds:['maintain']);
  let evaluated=null, pending=false;
  $('weight').value=profile.weight;
  $('target').value=wish?.target??legacyWeight??'';
  $('days').value=wish?.days??'';
  $('muscle-row').hidden=!goalKinds.includes('muscleGain');
  const labels={fatLoss:'Fettabbau',muscleGain:'Muskelaufbau',weightGain:'Gewichtszunahme',maintain:'Gewichtserhalt'};
  function context(){
   $('context').textContent=kinds.map(key=>labels[key]).join(' · ')+(current.reviewOn?' · Neubewertung am '+current.reviewOn:'')+(current.reason?' · '+current.reason:'');
  }
  function drawWeights(points,active){
   const container=$('goal-chart');
   const records=points.filter(point=>point.weight>0).sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);
   const title=document.createElement('h2');title.textContent='Dein Gewichtsverlauf';
   container.replaceChildren(title);
   if(!records.length){
    const empty=document.createElement('p');empty.textContent='Noch keine dokumentierten Gewichte. Neue Messwerte erscheinen nach dem Check-in.';
    container.append(empty);return;
   }
   const goal=active.state==='confirmed'?active.goal?.target:null;
   const values=records.map(point=>point.weight).concat(goal??[]);
   const low=Math.min(...values)-.5,high=Math.max(...values)+.5;
   const tMin=Date.parse(records[0].date),tMax=Date.parse(records.at(-1).date);
   const coords=records.map(point=>[32+238*(Date.parse(point.date)-tMin)/Math.max(tMax-tMin,86400000),110-95*(point.weight-low)/(high-low)]);
   const y=goal==null?null:110-95*(goal-low)/(high-low);
   const chart=document.createElementNS('http://www.w3.org/2000/svg','svg');
   chart.setAttribute('viewBox','0 0 280 128');
   chart.setAttribute('role','img');
   chart.setAttribute('aria-label','Gemessener Gewichtsverlauf in kg'+(goal==null?'':', bestätigtes Ziel '+goal+' kg'));
   chart.innerHTML=`<path d="M32 12V110H273" fill="none" stroke="#829480"/><text x="0" y="16" fill="#e3ebdc" font-size="11">${high.toFixed(1)}</text><text x="0" y="112" fill="#e3ebdc" font-size="11">${low.toFixed(1)}</text>${y==null?'':`<path d="M32 ${y}H273" stroke="#d5be85" stroke-dasharray="4 4"/>`}<polyline points="${coords.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#b4d29d" stroke-width="2"/>${coords.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3" fill="#e2ecdd"/>`).join('')}`;
   const description=document.createElement('p');
   const number=new Intl.NumberFormat('de-DE',{maximumFractionDigits:1});
   description.textContent=records[0].date+' bis '+records.at(-1).date+' · Zuletzt '+number.format(records.at(-1).weight)+' kg'+(goal==null?'':' · Ziel '+number.format(goal)+' kg');
   container.append(chart,description);
  }
  drawWeights(measurements,current);
  let chartState=JSON.stringify([measurements,current]);
  host.refreshGoalChart=()=>{
   const latest=api.model(),next=JSON.stringify([latest.measurements,latest.current]);
   if(next!==chartState){chartState=next;drawWeights(latest.measurements,latest.current);}
  };
  context();
  function read(){
   return {target:$('target').valueAsNumber,days:$('days').valueAsNumber,kinds:[...kinds],
    muscleKg:$('muscle').value===''?null:$('muscle').valueAsNumber};
  }
  function evaluate(){
   if(pending)return;
   const wish=read();
   evaluated={wish,decision:api.evaluate(wish)};
   const {decision}=evaluated;
   view.querySelector('.result').hidden=false;
   $('heading').textContent={candidate:'Dein Ziel ist bereit zur Bestätigung',revise:'Lass uns dein Ziel anpassen',blocked:'Dein Ziel braucht eine Prüfung'}[decision.state];
   $('reason').textContent=decision.reason;
   $('alternative').textContent=typeof decision.alternative==='string'?decision.alternative:decision.alternative?.description||'';
   $('confirm').disabled=decision.state!=='candidate';
   $('adopt').hidden=!(decision.alternative?.days||decision.alternative?.target);
   $('adopt').textContent=decision.alternative?.days?'Empfohlenen Zeitraum übernehmen':'Vorgeschlagenes Zwischenziel übernehmen';
   $('status').textContent='';
  }
  $('evaluate').onclick=evaluate;
  for(const id of ['target','days','muscle'])$(id).oninput=()=>{
   evaluated=null;$('confirm').disabled=true;$('adopt').hidden=true;
  };
  $('adopt').onclick=()=>{
   const alternative=evaluated?.decision.alternative;
   if(alternative?.days)$('days').value=alternative.days;
   else if(alternative?.target){
    $('target').value=alternative.target;$('muscle').value='';
    kinds=[...(kinds.includes('muscleGain')?['muscleGain']:[]),'maintain'];context();
   }
   evaluate();
  };
  $('confirm').onclick=async()=>{
   if(pending||evaluated?.decision.state!=='candidate')return;
   pending=true;$('confirm').disabled=true;
   try{
    const saved=await api.confirm(evaluated.wish,fingerprint);
    if(saved){const updated=api.model();drawWeights(updated.measurements,updated.current);}
    $('status').textContent=saved?'Ziel bestätigt. Dein Plan wurde aktualisiert.':'Ziel konnte nicht bestätigt werden. Prüfe deine aktuellen Angaben erneut.';
   }catch{$('status').textContent='Ziel konnte nicht gespeichert werden.'}
   finally{pending=false}
  };
  const close=()=>{if(!pending){host.remove();previous?.focus()}};
  $('back').onclick=close;
  host.addEventListener('keydown',event=>{
   if(event.key==='Escape'){close();return}
   if(event.key!=='Tab')return;
   const focusable=[...view.querySelectorAll('input,button')].filter(el=>!el.disabled&&el.getClientRects().length);
   if(event.shiftKey&&view.activeElement===focusable[0]){event.preventDefault();focusable.at(-1)?.focus()}
   else if(!event.shiftKey&&view.activeElement===focusable.at(-1)){event.preventDefault();focusable[0]?.focus()}
  });
  requestAnimationFrame(()=>$('target').focus());
  return host;
 };
})(window);
