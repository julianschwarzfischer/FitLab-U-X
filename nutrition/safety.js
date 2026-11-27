(function(root){
 'use strict';
 const groups=['Gluten','Krebstiere','Ei','Fisch','Erdnüsse','Soja','Milch','Schalenfrüchte','Sellerie','Senf','Sesam','Sulfite','Lupinen','Weichtiere'];
 const diets=['Mischkost','Pescetarisch','Vegetarisch','Vegan'];
 const knownIds=Array.from({length:66},(_,i)=>'F'+String(i+1).padStart(3,'0'));
 const validList=(list,allowed)=>Array.isArray(list)&&list.every(item=>typeof item==='string'&&allowed.includes(item));
 const validSelection=p=>p&&diets.includes(p.diet)&&validList(p.allergy,groups)
  &&validList(p.intolerance,groups)&&validList(p.exclusions,knownIds)
  &&Array.isArray(p.foods)&&p.foods.every(x=>typeof x==='string')
  &&Array.isArray(p.dishes)&&p.dishes.every(x=>typeof x==='string')&&[0,15,30,60].includes(p.minutes);
 const statuses=['setup','missing','migrated','damaged','confirmed'];
 const statusText={
  setup:'Bestätige zuerst dein Ernährungsprofil, auch wenn du keine Einschränkungen hast.',
  missing:'Es liegt kein bestätigtes Ernährungsprofil vor. Prüfe deine Angaben oder stelle eine Sicherung wieder her.',
  migrated:'Übernommene Ernährungsangaben bitte prüfen und bestätigen.',
  damaged:'Deine Ernährungsangaben sind unvollständig oder nicht lesbar. Prüfe sie erneut oder stelle eine Sicherung wieder her.'
 };
 function readProtection(record){
  if(record===undefined)return {status:'missing',revision:null};
  if(!record||record.version!==1||typeof record.revision!=='string'||!record.revision||!statuses.includes(record.status)
   ||record.status==='confirmed'&&!validSelection(record.selection)){
   return {status:'damaged',revision:null};
  }
  return record;
 }
 function envelope(status,revision,selection){
  return {version:1,status,revision,...(selection===undefined?{}:{selection})};
 }
 function migrate(raw,first,revision){
  if(raw===null)return envelope(first?'setup':'missing',revision);
  try{
   const selection=JSON.parse(raw);
   if(!selection||typeof selection!=='object'||Array.isArray(selection))return envelope('damaged',revision);
   return envelope(validSelection(selection)?'migrated':'damaged',revision,selection);
  }catch{return envelope('damaged',revision);}
 }
 function recipeGate(recipe,protection){
  const block=reason=>({status:'blocked',reason});
  const check=reason=>({status:'product-check',reason});
  if(protection.status!=='confirmed'||!validSelection(protection.selection))return block(statusText[protection.status]||statusText.damaged);
  const record=recipe.safety;
  if(!record||record.recipeId!==recipe.id||record.revision!==recipe.safety_revision
   ||record.release_status!==recipe.release_status)return block('Sicherheitsprüfung des Rezepts fehlt.');
  const p=protection.selection;
  const index=diet=>diets.findIndex(value=>value.toLowerCase()===diet.toLowerCase());
  if(index(record.diet)<index(p.diet))return block('Entspricht nicht deiner Ernährungsform.');
  if(p.exclusions.some(id=>record.all_food_ids.includes(id)))return block('Enthält eine ausgeschlossene Zutat.');
  const relevant=[...new Set([...p.allergy,...p.intolerance])];
  const conflict=relevant.find(group=>record.declared.includes(group)||record.groups[group]==='present');
  if(conflict)return block('Enthält '+conflict+'.');
  if(record.vegetarian_requires_microbial_rennet&&p.diet!=='Mischkost'){
   return check('Produktprüfung erforderlich: Lab beim konkreten Feta prüfen.');
  }
  const unknown=relevant.filter(group=>!productEvidenceCovers(record,group));
  if(unknown.length)return check('Produktprüfung erforderlich für '+unknown.join(', ')+'. Etiketten, Unterzutaten und Kreuzkontakte sind ungeklärt.');
  if(record.release_status!=='reviewed')return block('Fachliche Rezeptfreigabe offen.');
  return {status:'checked',reason:'Profilbezogen geprüft. Etiketten und mögliche Kreuzkontakte beachten.'};
 }
 // Evidence belongs to an exact recipe revision with a product and source for
 // every ingredient, including preparation and cross-contact review.
 function productEvidenceCovers(record,group){
  const evidence=record.product_evidence?.[group];
  if(evidence?.recipeId!==record.recipeId||evidence.revision!==record.revision
   ||evidence.preparationReviewed!==true||(typeof evidence.preparationSource!=='string'||!evidence.preparationSource.trim())||!Array.isArray(evidence.ingredients))return false;
  return record.all_food_ids.every(foodId=>evidence.ingredients.some(item=>item?.foodId===foodId
   &&typeof item.product==='string'&&item.product.trim()&&typeof item.source==='string'&&item.source.trim()
   &&item.ingredientsReviewed===true&&item.crossContactReviewed===true&&item.relevantConflict===false));
 }
 function attachMatrix(recipes,matrix){
  if(!matrix||JSON.stringify(matrix.groups)!==JSON.stringify(groups))throw Error('Allergenmatrix fehlt.');
  return recipes.map(recipe=>{
   const record=matrix.recipes?.[recipe.id];
   if(!record||!Array.isArray(record.all_food_ids)||!Array.isArray(record.declared)||!record.groups||typeof record.diet!=='string'||record.recipeId!==recipe.id||record.revision!==recipe.safety_revision||record.release_status!==recipe.release_status
    ||record.diet.toLowerCase()!==String(recipe.diet).toLowerCase()
    ||record.vegetarian_requires_microbial_rennet!==Boolean(recipe.diet_condition)
    ||JSON.stringify([...record.all_food_ids].sort())!==JSON.stringify(recipe.rows.map(({food})=>food.id).sort())
    ||JSON.stringify([...record.declared].sort())!==JSON.stringify([...recipe.declared].sort())
    ||groups.some(group=>record.groups[group]!== (recipe.declared.includes(group)?'present':'not_intrinsic_label_crosscontact_unverified'))){
    return {...recipe,safety:null};
   }
   return {...recipe,safety:record};
  });
 }
 root.fitLabNutritionSafety={groups,diets,knownIds,statusText,validSelection,readProtection,envelope,migrate,recipeGate,attachMatrix};
 if(typeof module!=='undefined')module.exports=root.fitLabNutritionSafety;
})(typeof window==='undefined'?globalThis:window);
