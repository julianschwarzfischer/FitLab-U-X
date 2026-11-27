(function(root){
 'use strict';
 const goalKinds=['fatLoss','muscleGain','weightGain','maintain'];
 const profileKeys=['age','height','weight','sex','goals','priority','activity','days','minutes','intensity','kind','bodyfat','adjust','sleep','experience','place','equipment','limits','restricted'];
 const fingerprint=p=>JSON.stringify(profileKeys.map(key=>p[key]));
 const daysUntilReview=28;
 const highPlannedLoad=p=>Number(p.days)*Number(p.minutes)*(Number(p.intensity)-1)>=3000;
 function evaluate(context,wish){
  const blocked=(reason,alternative)=>({state:'blocked',reason,alternative});
  const revise=(reason,alternative)=>({state:'revise',reason,alternative});
  const {p,profileWarning,energyWarning,recoveryWarning}=context;
  const age=Number(p.age), h=Number(p.height)/100, weight=Number(p.weight);
  const {target,days,kinds,muscleKg}=wish||{};
  if(![age,h,weight].every(Number.isFinite)||age<20||age>65||h<1.2||h>2.3||weight<35||!['m','f'].includes(p.sex)||!p.goals?.length){
   return blocked('Die Ausgangsdaten reichen für eine automatische Zielprüfung nicht aus.','Prüfe dein Profil und kläre das Ziel bei Bedarf fachlich.');
  }
  if(profileWarning||energyWarning||recoveryWarning){
   return blocked('Profil, Energieversorgung oder Erholung erfordern zuerst eine Prüfung.','Prüfe den Coach-Hinweis. Bei anhaltender Belastung die Trainingsanforderungen und die Energieversorgung gemeinsam klären.');
  }
  if(!Number.isFinite(target)||target<=0||target>300||!Number.isInteger(days)||days<1||days>1095
   ||!Array.isArray(kinds)||!kinds.length||kinds.some(x=>!goalKinds.includes(x))){
   return blocked('Zielangaben fehlen oder sind ungültig.','Gib Zielgewicht, Zeitraum und Zielart an.');
  }
  if(weight/h**2<18.5||target/h**2<18.5){
   return blocked('Aktuelles oder angestrebtes Gewicht liegt im Untergewichtsbereich.','Das Zielgewicht fachlich abklären. Bis dahin kein automatisches Abnahmeziel.');
  }
  const loss=kinds.includes('fatLoss'), gain=kinds.includes('weightGain'), maintain=kinds.includes('maintain');
  if((loss&&gain)||(maintain&&target!==weight)||(loss&&target>weight)||(gain&&target<weight)
   ||(target<weight&&!loss)||(target>weight&&!gain&&!kinds.includes('muscleGain'))){
   return revise('Zielrichtung und Zielgewicht passen nicht zusammen.',{target:weight,description:'Gewicht zunächst stabilisieren und den Zielschwerpunkt bewusst wählen.'});
  }
  if(muscleKg!=null){
   return revise('Muskelzuwachs lässt sich aus diesen Daten nicht zuverlässig auf einen Termin festlegen.',{description:'Trainingskontinuität oder Leistungsfortschritt als überprüfbares Zwischenziel verfolgen.'});
  }
  if(target<weight){
   if(weight/h**2<25)return revise('Eine automatische Gewichtsabnahme lässt sich aus diesen Ausgangsdaten nicht ableiten.',
    {target:weight,description:'Gewichtserhalt und Kraftfortschritt als Zwischenziel prüfen.'});
   if(highPlannedLoad(p)){
    return revise('Für die hohe geplante Trainingslast ist ein zusätzliches Defizitziel nicht automatisch ableitbar.',
     {target:weight,description:'Gewicht zunächst stabilisieren oder Belastung und Energieversorgung mit fachlicher Unterstützung prüfen.'});
   }
   const rate=Math.min(.5,weight*.005);
   const reviewWindow=Math.ceil((weight-target)*7/rate);
   if(days<reviewWindow){
    return revise('Für die gewünschte Änderung ist der Zeitraum zu kurz.',{days:reviewWindow,
     description:'Der längere Zeitraum ist eine vorsichtige Orientierung anhand des Ausgangsgewichts. Der Verlauf wird neu bewertet.'});
   }
  }
  if(target>weight)return revise('Eine Gewichtszunahme lässt sich nicht als Muskelzuwachs planen.',
   {target:weight,description:'Zunächst Kraft- und Trainingsfortschritt beobachten und eine Zunahme individuell prüfen.'});
  return {state:'candidate',reason:'Ausgangsdaten, Zielrichtung, Zeitraum und bestehende Schutzsignale sind berücksichtigt.',
   goal:{target,days,kinds:[...new Set(kinds)],muscleKg:null}};
 }
 function effectiveProfile(p,decision){
  const selected=decision.kinds;
  const goals=p.goals.filter(g=>![0,1,2,6,7].includes(g));
  const loss=decision.target<Number(p.weight);
  if(loss)goals.push(0);
  if(selected.includes('muscleGain'))goals.push(2);
  if(!loss)goals.push(6);
  return {...p,goals,adjust:Math.max(0,Number(p.adjust)),priority:loss?'loss':'maintain'};
 }
 root.fitLabGoalIntelligence={fingerprint,evaluate,effectiveProfile,highPlannedLoad,daysUntilReview};
 if(typeof module!=='undefined')module.exports=root.fitLabGoalIntelligence;
})(typeof window==='undefined'?globalThis:window);
