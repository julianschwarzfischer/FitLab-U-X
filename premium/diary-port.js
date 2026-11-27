'use strict';
window.createDiaryPort=function createDiaryPort({read,commands,subscribe}){
 return Object.freeze({
  read(date){return structuredClone(read(date));},
  async command(type,payload){
   if(!Object.hasOwn(commands,type))throw new TypeError('Unbekannter Tagebuchbefehl: '+type);
   const result=await commands[type](structuredClone(payload));
   if(!result||!['ok','invalid','blocked','conflict','cancelled'].includes(result.status))throw new TypeError('Ungültiges Befehlsergebnis');
   return structuredClone(result);
  },
  subscribe(listener){
   if(typeof listener!=='function')throw new TypeError('Tagebuch erwartet einen Listener');
   return subscribe(listener);
  }
 });
};
