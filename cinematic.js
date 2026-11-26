/* Evolution 3.1: presentation only; never reads/writes nutrition, workout or profile data. */
(()=>{
 'use strict';
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const selector=[
  '#xpHome .xpFirstHero','#xpHome .xpFirstPreview','#xpHome .xpFirstMini','#xpHome .xpHero','#xpHome .xpHomeStack','#xpHome .xpHeading',
  '#xpHome .xpTiles .xpTile','#xpHome .xpCoachCompact',
  '#xpHome .xpStrip','#xpHome .xpCineAvatarChapter','#xpHome .xpEvoCoach','#xpHome .xp12Focus','#xpDeep .xp12DetailHero',
  '#xpCheck > :is(section,.xpHero,.xpCard)'
 ].join(',');
 let observer,scheduled=false,frame=0;
 const known=new WeakSet();
 function visible(el){
  const r=el.getBoundingClientRect();
  return r.width>0&&r.height>0&&r.top<window.innerHeight*.95&&r.bottom>0;
 }
 function update(){
  scheduled=false;
  const nodes=[...document.querySelectorAll(selector)];
  if(reduced.matches||!('IntersectionObserver' in window)){
   nodes.forEach(el=>{el.classList.add('xpCine');el.dataset.cineReady='yes';el.dataset.cineVisible='yes';});
   return;
  }
  if(!observer)observer=new IntersectionObserver(entries=>{
   for(const e of entries){
    if(e.isIntersecting){
     e.target.dataset.cineVisible='yes';
     // Reveal only once per rendered element. Repeated scrolling must not flicker.
     observer.unobserve(e.target);
    }
   }
  },{root:null,rootMargin:'0px 0px -3% 0px',threshold:.04});
  for(const el of nodes){
   if(known.has(el))continue;
   known.add(el);
   el.classList.add('xpCine');
   // Elements already on screen are fully shown before arming hidden transitions.
   el.dataset.cineVisible=visible(el)?'yes':'no';
   el.dataset.cineReady='yes';
   if(el.dataset.cineVisible!=='yes')observer.observe(el);
  }
  updateScroll();
 }
 function schedule(){
  if(scheduled)return;scheduled=true;
  queueMicrotask(update);
 }
 function updateScroll(){
  if(frame||reduced.matches)return;
  frame=requestAnimationFrame(()=>{
   frame=0;
   const hero=document.querySelector('#xpHome:not([hidden]) .xpHero');
   if(!hero)return;
   const rect=hero.getBoundingClientRect();
   const progress=Math.max(-1,Math.min(1,-rect.top/Math.max(rect.height,1)));
   hero.style.setProperty('--cine-scroll',String(progress));
  });
 }
 // Profile, nutrition and training DOM are owned by the application.
 // Never modify their nodes: the observer merely adds presentation classes to cockpit sections.
 const watch=new MutationObserver(schedule);
 function init(){
  if(!document.body)return;
  watch.observe(document.getElementById('today')||document.body,{childList:true,subtree:true});
  reduced.addEventListener?.('change',()=>{observer?.disconnect();observer=null;schedule();});
  window.addEventListener('scroll',updateScroll,{passive:true});
  window.addEventListener('resize',updateScroll,{passive:true});
  schedule();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
