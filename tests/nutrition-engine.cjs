const assert=require('node:assert/strict');
const fs=require('node:fs');
const e=require('../nutrition/engine.js');
const raw=require('../nutrition/recipes.json').recipes;
const foods=require('../nutrition/foods.json').foods;
const recipes=e.enrich(raw,foods);
assert.equal(recipes.length,30);
assert.equal(new Set(recipes.map(x=>x.id)).size,30);
assert.equal(e.allergens.length,14);
for(const recipe of recipes){
 assert(fs.statSync('nutrition/recipes/'+recipe.id+'.webp').size>0);
 for(const key of e.nutrients)assert(recipe.values[key]===recipe.nutrition_per_serving[key]||Number.isFinite(recipe.values[key])&&Number.isFinite(recipe.nutrition_per_serving[key])&&Math.abs(recipe.values[key]-recipe.nutrition_per_serving[key])<1e-8);
}
const model={target:{kcal:2050,protein_g:145,available_carbs_g:215,fat_g:65,fiber_g:30},
 used:{kcal:900,protein_g:55,available_carbs_g:90,fat_g:30,fiber_g:12},meal:'mittag',profile:e.defaults()};
const ordered=e.rank(recipes,model);
assert(ordered.length);
for(const [target,used] of [[model.target,model.used],[{...model.target,kcal:2450,protein_g:180},model.used],[{...model.target,kcal:1780,protein_g:130},model.used],[{...model.target,kcal:2100,protein_g:105},model.used]]){
 const out=e.rank(recipes,{...model,target,used});
 assert(out.length&&out.every(x=>x.recipe.values.kcal*x.portion<=target.kcal-used.kcal));
}
assert.equal(e.rank(recipes,{...model,target:null}).length,0);
assert.equal(e.rank(recipes,{...model,blocked:true}).length,0);
assert.equal(e.rank(recipes,{...model,used:{...model.used,kcal:2050}}).length,0);
assert.equal(e.rank(recipes,{...model,profile:e.defaults({allergy:['Milch']})}).length,0);
assert.equal(e.rank(recipes,{...model,profile:e.defaults({exclusions:['ungeprüft']})}).length,0);
assert(e.rank(recipes,{...model,profile:e.defaults({exclusions:['F021'],minutes:30})}).every(x=>!x.recipe.rows.some(row=>row.food.id==='F021')&&x.recipe.minutes<=30));
for(const diet of ['Vegan','Vegetarisch']){
 const out=e.rank(recipes,{...model,profile:e.defaults({diet})});
 assert(out.length&&out.every(x=>x.recipe.diet==='vegan'||diet==='Vegetarisch'&&x.recipe.diet==='vegetarisch'));
}
assert(e.rank(recipes,{...model,profile:e.defaults({intolerance:['Soja']})}).every(x=>!x.recipe.declared.includes('Soja')));
assert.equal(recipes.filter(x=>x.values.fiber_g===null).length,3);
console.log('PASS 30 recipe totals, unknown fiber, dietary and safety rules, energy and preparation bounds');
