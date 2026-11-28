'use strict';
window.fitLabStudios=(()=>{
 const templates=new Map();
 const allowed=new Set(['identity','settings','vault','progress','recovery']);
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const option=(value,label)=>`<option value="${escape(value)}">${escape(label)}</option>`;
 function create({read,commands,navigate,back}){
  let revision=0,host;
  function close(){revision++;host?.remove();host=null;}
  async function show(route){
   if(!allowed.has(route))throw TypeError('Unbekannte Ansicht');
   close();const version=revision,previous=document.activeElement;
   host=document.createElement('fitlab-studio');host.dataset.route=route;
   const root=host.attachShadow({mode:'open'});
   host.tabIndex=-1;document.body.append(host);
   window.scrollTo(0,0);
   try{
    if(!templates.has(route))templates.set(route,fetch('premium/'+route+'.html').then(response=>{
     if(!response.ok)throw Error('Ansicht nicht verfügbar');
     return response.text();
    }).catch(error=>{templates.delete(route);throw error;}));
    const template=await templates.get(route);
    if(version!==revision)return;
    root.innerHTML=template;
    const $=selector=>root.querySelector(selector);
    const notify=(message,id='#status')=>{const status=$(id);if(status)status.textContent=message;};
    $('[data-back]').onclick=()=>{close();back(route);previous?.focus({preventScroll:true});};
    root.addEventListener('keydown',event=>{if(event.key==='Escape'&&route!=='identity')$('[data-back]').click();});
    const heading=$('h1');heading.tabIndex=-1;heading.focus({preventScroll:true});
    async function run(button,command,id='#status'){
     button.disabled=true;
     try{notify(await command(),id);}catch(error){notify(error.message,id);}finally{button.disabled=false;}
    }
    if(route==='vault'){
     const file=$('#file'),confirm=$('#confirm'),restore=$('#restore');
     let selected,request=0;
     $('#export').onclick=event=>run(event.currentTarget,commands.download,'#exportstatus');
     file.onchange=async()=>{
      const running=++request;selected=null;confirm.checked=false;confirm.disabled=true;restore.disabled=true;
      notify('Datei wird geprüft.','#filestatus');notify('','#restorestatus');
      try{
       const result=await commands.stage(file.files[0]);
       if(request!==running)return;
       selected=result;confirm.disabled=false;notify('Geprüft: '+file.files[0].name+'. Die Wiederherstellung ersetzt die vorhandenen lokalen Daten.','#filestatus');
      }catch(error){if(request===running)notify(error.message,'#filestatus');}
     };
     confirm.onchange=()=>{restore.disabled=!confirm.checked||!selected;};
     restore.onclick=async()=>{
      if(!selected||!confirm.checked)return;
      const staged=selected;selected=null;confirm.checked=false;confirm.disabled=true;file.disabled=true;
      restore.disabled=true;
      try{notify(await commands.restore(staged),'#restorestatus');}catch(error){notify(error.message,'#restorestatus');}finally{file.disabled=false;file.value='';}
     };
    }else if(route==='settings'){
     const model=read('settings'),name=$('[data-name]');
     name.value=model.name;
     name.onchange=()=>{try{commands.name(name.value);notify('Name gespeichert.');}catch(error){notify(error.message);}};
     root.querySelectorAll('[name=theme]').forEach(field=>{
      field.checked=field.value===model.theme;field.onchange=()=>{try{commands.theme(field.value);notify('Darstellung gespeichert.');}catch(error){notify(error.message);}};
     });
     root.querySelectorAll('[data-route]').forEach(button=>button.onclick=()=>navigate(button.dataset.route));
    }else if(route==='recovery'){
     const sleep=$('#sleep');
     const readForm=selector=>{const button=$(selector+' [aria-pressed=true]');return button?Number(button.textContent):null;};
     function refresh(fill){
      const model=read('recovery'),values=model.today;
      const format=(value,unit)=>Number.isFinite(value)?value.toLocaleString('de-DE')+unit:'–';
      for(const [key,id,unit,max] of [['sleep','rSleep',' h',24],['energy','rEnergy','/5',5],['soreness','rSore','/4',4]]){
       $('#'+id).textContent=format(values[key],unit);
       $('#'+id+'Arc').style.setProperty('--v',String(Number.isFinite(values[key])?values[key]/max*100:0));
      }
      $('#rSore').closest('.ring').parentElement.querySelector('small').textContent='Dokumentierter Wert';
      $('#headline').textContent=model.blocked?'Trainingsschutz aktiv':'Dein Check-in';
      $('#message').innerHTML=model.guidance;
      $('#reason').textContent='';
      if(fill)sleep.value=values.sleep??'';
      for(const [id,key] of [['energy','energy'],['sore','soreness']])$(`#${id}`).querySelectorAll('button').forEach(button=>{
       if(fill)button.setAttribute('aria-pressed',String(+button.textContent===values[key]));
       button.onclick=()=>$(`#${id}`).querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
      });
     }
     $('#save').onclick=event=>run(event.currentTarget,async()=>{
      const message=await commands.recovery({sleep:sleep.valueAsNumber,energy:readForm('#energy'),soreness:readForm('#sore')});
      refresh(false);return message;
     },'#notice');
     refresh(true);
    }else if(route==='identity'){
     const model=read('identity'),form=$('form'),bindings={};
     function bind(element,name,options){
      if(options)element.innerHTML=options.map(([value,label])=>option(value,label)).join('');
      if(element.type==='checkbox')element.checked=!!model.profile[name];else element.value=model.profile[name]??'';
      bindings[name]=element;
     }
     const bodyFields=$('#body').querySelectorAll('input[type=number]');
     model.fields.forEach(([name,,min,max],index)=>{const input=bodyFields[index];input.min=min;input.max=max;bind(input,name);});
     bind($('#body select'),'sex',[['','Bitte auswählen'],['m','Männlich'],['f','Weiblich']]);bind($('#body input[type=checkbox]'),'restricted');
     bind($('#goals select'),'priority',[['auto','Automatisch'],['loss','Fettabbau'],['gain','Aufbau'],['maintain','Gewicht halten']]);
     const section=$('#training');
     const selectors=[...section.querySelectorAll('select')],numeric=[...section.querySelectorAll('input')];
     const replace=(element,key,items)=>{
      const select=document.createElement('select');element.replaceWith(select);bind(select,key,items);
     };
     const entries=Object.fromEntries(model.selects.map(([name,,items])=>[name,items]));
     bind(selectors[0],'activity',entries.activity);replace(numeric[0],'sleep',entries.sleep);
     for(const [i,key] of ['experience','place','kind'].entries())bind(selectors[i+1],key,entries[key]);
     bind(numeric[1],'days');bind(numeric[2],'minutes');replace(numeric[3],'intensity',entries.intensity);
     bind($('#equipment input[type=text]'),'extra');bind($('#equipment textarea'),'limits');bind($('#adjust'),'adjust');
     $('#adjust').oninput=()=>{$('#delta').textContent=$('#adjust').value+' kcal';};$('#adjust').oninput();
     $('#adjust').closest('section').querySelector('button').onclick=()=>{$('#adjust').value=0;$('#adjust').oninput();};
     root.querySelectorAll('[name=avatar]').forEach((input,i)=>{input.value=['m','f'][i];input.checked=input.value===model.avatar;});
     for(const key of ['goals','equipment']){
      const controls=root.querySelectorAll('#'+key+' input[type=checkbox]');
      controls.forEach((input,index)=>{input.checked=model.profile[key].includes(index);});
     }
     form.onsubmit=event=>{
      event.preventDefault();
      const patch=Object.fromEntries(Object.entries(bindings).map(([key,element])=>[key,element.type==='checkbox'?element.checked:element.value]));
      for(const key of ['goals','equipment'])patch[key]=[...root.querySelectorAll('#'+key+' input[type=checkbox]')].flatMap((input,index)=>input.checked?[index]:[]);
      const avatar=root.querySelector('[name=avatar]:checked')?.value;
      return run(event.submitter,async()=>{const message=await commands.profile(patch,model.profile,avatar);model.profile=read('identity').profile;return message;});
     };
    }else{
     let period=30,section='Überblick',metric='weight';
     const render=()=>{
      const model=read('progress',{period,section,metric});
      $('.scene').dataset.portrait=model.portrait;
      $('#period').innerHTML=[7,14,30,90,0].map(value=>`<button type="button" data-period="${value}" aria-pressed="${value===period}">${value?value+' Tage':'Gesamt'}</button>`).join('');
      $('#sections').innerHTML=['Überblick','Körper','Training','Ernährung'].map(value=>`<button type="button" data-section="${value}" aria-pressed="${value===section}">${value}</button>`).join('');
      $('#content').innerHTML=model.markup;
      if($('#metric'))$('#metric').onchange=event=>{metric=event.target.value;render();};
     };
     root.addEventListener('click',event=>{
      const button=event.target.closest('button');
      if(!button)return;
      if(button.dataset.period!==undefined){period=Number(button.dataset.period);render();}
      if(button.dataset.section){section=button.dataset.section;render();}
      if(button.dataset.route)navigate(button.dataset.route);
     });
     render();
    }
   }catch(error){
    if(version===revision){root.textContent=error.message;const button=document.createElement('button');button.textContent='Zurück';button.onclick=()=>{close();back(route);};root.append(button);}
   }
  }
  return {show,close};
 }
 return {create};
})();
