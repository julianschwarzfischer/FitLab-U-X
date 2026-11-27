(function(root){
 'use strict';
 const nutrients=['kcal','protein_g','available_carbs_g','fat_g','fiber_g'];
 const portions=[0.5,1,1.5,2,2.5,3];
 const allergens=['Gluten','Krebstiere','Ei','Fisch','Erdnüsse','Soja','Milch','Schalenfrüchte','Sellerie','Senf','Sesam','Sulfite','Lupinen','Weichtiere'];
 const diets=['Mischkost','Pescetarisch','Vegetarisch','Vegan'];
 const foodGroups={
  Rind:['F027','F031'],Geflügel:['F021','F029'],Schwein:['F036'],Fisch:['F042','F047','F048'],Meeresfrüchte:['F050'],
  Gemüse:['F008','F009','F015','F016','F020','F023','F025','F033','F034','F044','F045','F046','F055'],
  Hülsenfrüchte:['F019','F024','F037','F038','F049','F052','F053','F064'],
  Milchprodukte:['F002','F004','F014','F041','F054'],Eier:['F006']
 };
 const dishes=['Bowls','Pasta','Reisgerichte','Salate','Hausmannskost','Suppen'];
 const normalize=value=>String(value??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replaceAll('ß','ss').trim();
 function groupDish(recipe,ids){
  const title=normalize(recipe.name);
  return [title.includes('bowl')&&'Bowls',ids.includes('F032')&&'Pasta',ids.includes('F022')&&'Reisgerichte',title.includes('salat')&&'Salate',title.includes('suppe')&&'Suppen',/eintopf|pfanne|filet|omelett/.test(title)&&'Hausmannskost'].filter(Boolean);
 }
 function defaults(profile={}){
  const list=(key,values)=>Array.isArray(profile[key])?profile[key].filter(x=>values.includes(x)):[];
  return {diet:diets.includes(profile.diet)?profile.diet:diets[0],allergy:list('allergy',allergens),intolerance:list('intolerance',allergens),
   exclusions:Array.isArray(profile.exclusions)?profile.exclusions.filter(x=>typeof x==='string'):[],
   foods:list('foods',Object.keys(foodGroups)),dishes:list('dishes',dishes),minutes:[15,30,60].includes(profile.minutes)?profile.minutes:0};
 }
 function enrich(recipes,foods){
  const map=new Map(foods.map(food=>[food.id,food]));
  return recipes.map((recipe,index)=>{
   const rows=recipe.ingredients.map(item=>({grams:item.grams,food:map.get(item.food_id)}));
   if(rows.some(row=>!row.food))throw Error('Fehlende Zutat in '+recipe.id);
   const ids=rows.map(row=>row.food.id);
   const groups=Object.keys(foodGroups).filter(group=>ids.some(id=>foodGroups[group].includes(id)));
   const styles=groupDish(recipe,ids);
   const values=Object.fromEntries(nutrients.map(key=>[key,rows.some(({food})=>!Number.isFinite(food.nutrients_per_100g[key]))?null:rows.reduce((sum,{grams,food})=>sum+food.nutrients_per_100g[key]*grams/100,0)/recipe.base_servings]));
   const declared=[...new Set([...recipe.allergens_declared,...rows.flatMap(({food})=>food.allergens_intrinsic_preliminary||[])])];
   return {...recipe,index,rows,groups,styles,values,declared,search:normalize([recipe.name,recipe.category,recipe.diet,...recipe.meal_types,...groups,...styles,...rows.flatMap(({food})=>[food.name,...(food.id==='F042'?['Wildlachs']:[])])].join(' '))};
  });
 }
 function restrictions(recipe,profile){
  const warnings=[];
  if(diets.indexOf(/^mischkost$/i.test(recipe.diet)?'Mischkost':recipe.diet.charAt(0).toUpperCase()+recipe.diet.slice(1))<diets.indexOf(profile.diet))warnings.push('Entspricht nicht deiner Ernährungsform.');
  if(recipe.diet_condition&&profile.diet!=='Mischkost')warnings.push(recipe.diet_condition);
  const overlap=recipe.declared.filter(x=>profile.allergy.includes(x)||profile.intolerance.includes(x));
  if(overlap.length)warnings.push('Dein Ausschluss: '+overlap.join(', ')+'.');
  const excluded=profile.exclusions.filter(term=>recipe.rows.some(({food})=>food.id===term||normalize(food.name).includes(normalize(term))));
  if(excluded.length)warnings.push('Ausgeschlossene Zutat im Rezept.');
  if(profile.exclusions.some(term=>!/^F\d{3}$/.test(term)))warnings.push('Individueller Ausschluss ohne eindeutige Katalogzuordnung. Keine persönliche Eignungsfreigabe.');
  if(profile.allergy.length)warnings.push('Konkrete Produktetiketten und Kreuzkontakte sind nicht verifiziert.');
  return warnings;
 }
 function rank(recipes,{profile,target,used,blocked,meal,protection,recent=[]}){
  if(blocked||!target||!used)return [];
  const remaining=nutrients.map(key=>Number.isFinite(target[key])&&Number.isFinite(used[key])?target[key]-used[key]:null);
  if(!remaining.slice(0,4).every(Number.isFinite)||remaining[0]<=0)return [];
  const fractions={frühstück:.3,mittag:.4,abend:.4,snack:.18};
  const fraction=fractions[meal]||.4;
  const ideals=remaining.map(value=>Math.max(0,value??0)*fraction);
  const floors=[150,15,20,10,5],weights=[3,3,1,1,.5];
  return recipes.flatMap(recipe=>{
   if((protection?root.fitLabNutritionSafety.recipeGate(recipe,protection).status!=='checked':restrictions(recipe,profile).length)||!recipe.meal_types.includes(meal)||recipe.passive_time||(profile.minutes&&recipe.minutes>profile.minutes))return [];
   const scored=portions.slice(0,3).flatMap(portion=>{
    const values=nutrients.map(key=>recipe.values[key]===null?null:recipe.values[key]*portion);
    if(values[0]>remaining[0]||!values.slice(0,4).every(Number.isFinite))return [];
    const distance=values.reduce((score,value,i)=>score+(value===null||remaining[i]===null?0:weights[i]*(i===4?Math.max(0,ideals[i]-value):Math.abs(value-ideals[i]))/Math.max(floors[i],ideals[i])),0);
    const preferences=[...recipe.groups.filter(g=>profile.foods.includes(g)),...recipe.styles.filter(g=>profile.dishes.includes(g))];
    const score=distance+.2*Math.abs(portion-1)+.4*Number(recent.includes(recipe.id))+.005*recipe.minutes-.12*preferences.length;
    const reason=['Diese Portion liegt im verbleibenden Kalorienbudget.'];
    if(remaining[1]>0&&values[1]>0)reason.push('Sie liefert '+values[1].toLocaleString('de-DE',{maximumFractionDigits:1})+' g Protein für deinen offenen Tagesbedarf.');
    if(preferences.length)reason.push('Berücksichtigt deine Vorlieben für '+preferences.join(', ')+'.');
    return [{recipe,portion,score,reason:reason.join(' ')}];
   }).sort((a,b)=>a.score-b.score);
   return scored.slice(0,1);
  }).sort((a,b)=>a.score-b.score||a.recipe.index-b.recipe.index);
 }
 const engine={nutrients,portions,allergens,diets,foodGroups,dishes,normalize,defaults,enrich,restrictions,rank};
 if(typeof module==='object')module.exports=engine;else root.fitLabNutritionEngine=engine;
})(globalThis);
