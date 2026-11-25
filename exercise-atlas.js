/* FITNESS LAB · Evolution 3 exercise atlas · independent read-only feature.
   Reuses the app's own catalog, machine availability, technique notes and
   schematic animations. No external media, no data writes. */
(()=>{
'use strict';
const $atlas=document.createElement('section');
$atlas.id='xp3Atlas';
$atlas.className='xp3Atlas';
$atlas.setAttribute('aria-label','Übungsatlas');
$atlas.innerHTML='<details id="xp3AtlasDisclosure"><summary>Übungsatlas · Techniken, Muskeln & Equipment</summary><div id="xp3AtlasBody"></div></details>';
const styles=document.createElement('style');
styles.textContent=`
#xp3Atlas{border:1px solid var(--line);border-radius:20px;margin:12px 0;padding:13px;background:var(--surface);box-shadow:none}
#xp3Atlas summary{list-style-position:inside;cursor:pointer;font-weight:750;color:var(--primary-text);padding:9px 0;min-height:44px}
#xp3Atlas summary:focus-visible,#xp3Atlas button:focus-visible,#xp3Atlas input:focus-visible,#xp3Atlas select:focus-visible{outline:3px solid var(--primary);outline-offset:2px}
.xp3AtlasIntro{font-size:13px;color:var(--muted);line-height:1.5;margin:7px 0 12px}
.xp3AtlasFilter{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.xp3AtlasFilter label:first-child{grid-column:1/-1}
.xp3AtlasFilter input,.xp3AtlasFilter select{width:100%;min-width:0}
.xp3AtlasCount{font-size:12px;margin:10px 0;color:var(--muted)}
.xp3AtlasList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.xp3AtlasItem{display:flex;flex-direction:column;gap:5px;text-align:left;align-items:flex-start;padding:11px;border:1px solid var(--line);background:var(--surface-soft);color:var(--text);border-radius:14px;min-height:85px}
.xp3AtlasItem b{font-size:14px;line-height:1.2}
.xp3AtlasItem small{font-size:11px;line-height:1.4}
.xp3AtlasItem[aria-pressed="true"]{border:2px solid var(--primary);background:var(--tint)}
.xp3AtlasItem .xp3Available{font-size:11px;color:var(--primary-text);font-weight:700}
.xp3AtlasDetail{border-top:1px solid var(--line);margin-top:15px;padding-top:15px;scroll-margin-top:20px}
.xp3AtlasDetail h3{margin:0;font-size:20px}
.xp3AtlasDetail p{font-size:14px;line-height:1.5}
.xp3AtlasNote{padding:10px;border-radius:12px;background:var(--tint);font-size:13px}
.xp3AtlasHistory{border-top:1px solid var(--line);padding-top:10px;margin:12px 0}
.xp3AtlasHistory h4{font-size:14px;margin:0 0 7px}
.xp3AtlasRecent{margin:0;padding:0;list-style:none;display:grid;gap:6px}
.xp3AtlasRecent li{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;border:1px solid var(--line);border-radius:9px;padding:8px}
.xp3AtlasRecent span{text-align:right}
#xp3Atlas .visual64 svg{max-height:210px}
#xp3Atlas .visual64 .motion64 button{min-width:0;font-size:12px;padding:8px 4px}
#xp3Atlas button{min-height:44px}
@media(max-width:350px){.xp3AtlasFilter{grid-template-columns:1fr}.xp3AtlasFilter label:first-child{grid-column:auto}.xp3AtlasList{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){#xp3Atlas *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;
document.head.append(styles);
let query='',group='',onlyAvailable=false,selected='';
const groupNames={legs:'Beine',hinge:'Hüfte & Beinrückseite',push:'Brust & Drücken',pull:'Rücken & Ziehen',shoulder:'Schultern',core:'Rumpf',cardio:'Ausdauer',mobility:'Mobilität'};
const catalog=()=>exs.filter(x=>Array.isArray(x)&&x.length>=5);
const fit=(ex)=>available(state.p,ex[2]).some(x=>x[0]===ex[0]);
function filtered(){
 const text=query.trim().toLocaleLowerCase('de-DE');
 return catalog().filter(ex=>(!group||ex[2]===group)&&(!onlyAvailable||fit(ex))&&
 (!text||[ex[1],ex[4],groupNames[ex[2]]||'',muscleLabel641(ex)].join(' ').toLocaleLowerCase('de-DE').includes(text)));
}
function drawList(){
 const list=$atlas.querySelector('#xp3AtlasList');if(!list)return;
 const entries=filtered();
 $atlas.querySelector('#xp3AtlasCount').textContent=entries.length+' von '+catalog().length+' Übungen · '+(onlyAvailable?'mit deinem Equipment':'gesamter Katalog');
 list.innerHTML=entries.map(ex=>`<button type="button" class="xp3AtlasItem" data-ex="${esc(ex[0])}" aria-pressed="${selected===ex[0]}"><b>${esc(ex[1])}</b><small>${esc(groupNames[ex[2]]||ex[2])}</small><span class="xp3Available">${fit(ex)?'Mit deinem Equipment möglich':'Weiteres Equipment erforderlich'}</span></button>`).join('')||'<p class="xp3AtlasIntro">Keine passende Übung. Versuche andere Filter.</p>';
 if(selected&&!entries.some(x=>x[0]===selected)){selected='';$atlas.querySelector('#xp3AtlasDetail').innerHTML='';}
}
function personalHistory(ex){
 const recent=history().filter(h=>h&&Array.isArray(h.items)).flatMap(h=>
 h.items.filter(i=>i&&i.id===ex[0]&&Array.isArray(i.sets)).map(i=>({
 date:String(h.date||''),sets:i.sets.filter(v=>v&&v.done&&(Number.isFinite(+v.reps)&&+v.reps>0))
 }))).filter(x=>x.sets.length).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
 if(!recent.length)return '<p class="xp3AtlasIntro">Noch keine abgeschlossenen Sätze für diese Übung dokumentiert.</p>';
 const lines=recent.map(x=>{
  let top=x.sets.reduce((a,b)=>!a||(+b.weight||0)>(+a.weight||0)||(+b.weight||0)===(+a.weight||0)&&+b.reps>+a.reps?b:a,null);
  if(!top)return '';
  const amount=timed(ex)?fmt(+top.reps,0)+' '+unit(ex):fmt(+top.reps,0)+' Wiederholungen';
  const load=!timed(ex)&&Number.isFinite(+top.weight)&&+top.weight>0?' · '+fmt(+top.weight,1)+' '+loadLabel(ex):'';
  return '<li><strong>'+esc(x.date?dateDE(x.date):'Ohne Datum')+'</strong><span>'+esc(amount+load)+'</span></li>';
 }).join('');
 return '<ul class="xp3AtlasRecent">'+lines+'</ul><p class="xp3AtlasIntro">Dokumentierte Bestsätze je Trainingseintrag. Unterschiedliche Wiederholungszahlen und Bedingungen sind nicht direkt als Leistungssteigerung vergleichbar.</p>';
}
function show(id){
 const ex=exBy(id);if(!ex)return;
 const detail=$atlas.querySelector('#xp3AtlasDetail');selected=id;
 const known=fit(ex),gear=ex[3].map(i=>equipment[i]).filter(Boolean),muscle=muscleLabel641(ex);
 detail.innerHTML=`<h3 id="xp3AtlasExercise">${esc(ex[1])}</h3><p>${esc(groupNames[ex[2]]||ex[2])} · ${esc(muscle)}</p><p class="xp3AtlasNote">${known?'Mit deinem aktuellen Equipment durchführbar.':'Für deinen aktuellen Gerätebestand nicht verfügbar.'} ${gear.length?'Benötigtes Equipment (abhängig von Variante): '+esc(gear.join(', '))+'.':'Ohne zusätzliche Geräte möglich.'}</p><section class="xp3AtlasHistory"><h4>Deine bisherigen Einheiten</h4>${personalHistory(ex)}</section>${motion64[id]?exerciseGuide(ex):`<div class="xp3AtlasNote"><strong>Technik</strong><p>${esc(ex[4])}</p><p>Für diese Übung liegt aktuell keine geprüfte Bewegungssequenz vor.</p></div>`}<p class="xp3AtlasIntro">Die vorhandenen Bewegungsbilder sind schematische Lernhilfen, keine anatomisch validierte 3D-Darstellung. Wähle eine schmerzfreie Ausführung und passe das Training an deine Möglichkeiten an.</p>`;
 const box=detail.querySelector('.visual64');if(box&&motion64[id]){const svg=box.querySelector('svg');frame64(svg,id,0);box._step=0;const play=box.querySelector('.play64'),step=box.querySelector('.step64');if(play)play.addEventListener('click',e=>{e.preventDefault();toggle64(play)});if(step)step.addEventListener('click',e=>{e.preventDefault();step64(step)})}
 const regions=Object.keys(xpMap).filter(key=>xpMap[key].includes(id));
 if(regions.length){
  const button=document.createElement('button'),panel=document.createElement('div');
  button.type='button';button.className='secondary';button.textContent='Muskelkarte ansehen';button.setAttribute('aria-expanded','false');
  panel.hidden=true;detail.append(button,panel);
  let side=Object.keys(xpBodyRegions('mf')).some(k=>regions.includes(k))?'front':'back';
  function draw(){
   panel.innerHTML=xpAvatarSVG(xpPrefs.avatar,side,false,regions);
   const labels=regions.filter(k=>Object.hasOwn(xpBodyRegions((xpPrefs.avatar==='f'?'f':'m')+(side==='front'?'f':'b')),k));
   const caption=document.createElement('p');caption.textContent=labels.length?labels.map(k=>xpNames[k]).join(' · '):'Keine markierte Region in dieser Ansicht.';
   const flip=document.createElement('button');flip.type='button';flip.className='secondary';flip.textContent=side==='front'?'Rückansicht zeigen':'Vorderansicht zeigen';
   flip.onclick=()=>{side=side==='front'?'back':'front';draw();panel.lastChild.focus()};panel.append(caption,flip);
  }
  button.onclick=()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));button.textContent=panel.hidden?'Muskelkarte ansehen':'Muskelkarte schließen';if(!panel.hidden)draw()};
 }
 drawList();detail.setAttribute('tabindex','-1');detail.focus();
}
function mount(){
 const root=document.getElementById('training');if(!root)return;
 const target=root.querySelector('#trainingout');if(!target)return;
 target.before($atlas);
 $atlas.querySelector('#xp3AtlasBody').innerHTML=`<p class="xp3AtlasIntro">Entdecke alle im Trainingsplaner verfügbaren Übungen. Suche nach Bewegung oder Muskelgruppe und sieh, was mit deinem Equipment möglich ist. Die Bibliothek ändert deinen aktiven Trainingsplan nicht.</p>
 <div class="xp3AtlasFilter"><label>Übung oder Muskel suchen<input id="xp3AtlasSearch" type="search" placeholder="z. B. Rücken oder Kniebeuge" autocomplete="off"></label>
 <label>Bewegungsbereich<select id="xp3AtlasGroup"><option value="">Alle Bereiche</option>${Object.entries(groupNames).map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select></label>
 <label>Equipment<select id="xp3AtlasEquipment"><option value="all">Alle Übungen</option><option value="owned">Mit meinem Equipment</option></select></label></div>
 <div id="xp3AtlasCount" class="xp3AtlasCount" role="status" aria-live="polite"></div>
 <div id="xp3AtlasList" class="xp3AtlasList"></div>
 <div id="xp3AtlasDetail" class="xp3AtlasDetail" aria-live="polite"></div>`;
 $atlas.querySelector('#xp3AtlasSearch').addEventListener('input',e=>{query=e.target.value;drawList()});
 $atlas.querySelector('#xp3AtlasGroup').addEventListener('change',e=>{group=e.target.value;drawList()});
 $atlas.querySelector('#xp3AtlasEquipment').addEventListener('change',e=>{onlyAvailable=e.target.value==='owned';drawList()});
 $atlas.querySelector('#xp3AtlasList').addEventListener('click',e=>{const b=e.target.closest('button[data-ex]');if(b)show(b.dataset.ex)});
 $atlas.querySelector('#xp3AtlasDisclosure').addEventListener('toggle',e=>{if(e.target.open)drawList();else{for(const box of $atlas.querySelectorAll('.visual64')){if(box._raf)cancelAnimationFrame(box._raf);box._raf=0;const play=box.querySelector('.play64');if(play)play.textContent='Animation starten'}}});
 drawList();
}
mount();
window.fitlabAtlas3={getCount:()=>catalog().length,filter:(q,g,eq)=>{query=q||'';group=g||'';onlyAvailable=!!eq;drawList();return filtered().length;}};
})();
