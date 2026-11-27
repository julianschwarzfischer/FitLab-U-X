const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const safety=require('../nutrition/safety.js');
const engine=require('../nutrition/engine.js');
const {recipes}=require('../nutrition/recipes.json');
const {foods}=require('../nutrition/foods.json');
const matrix=require('../nutrition/allergen-matrix.json');
const hashes=require('./fixtures/recipe-original-hashes.json');
const actual=safety.attachMatrix(engine.enrich(recipes,foods),matrix);
assert.equal(actual.length,30);
assert.equal(Object.keys(hashes).length,30);
for(const recipe of actual){
 assert.equal(createHash('sha256').update(fs.readFileSync('nutrition/recipes/'+recipe.id+'.webp')).digest('hex'),hashes[recipe.id+'.webp']);
 assert.equal(Object.keys(recipe.safety.groups).length,14);
 const expected=recipe.id==='R003'?'draft':'reviewed';
 assert.equal(recipe.release_status,expected);
 assert.equal(recipe.safety.release_status,expected);
 assert.equal(recipe.safety.revision,recipe.safety_revision);
 assert.equal(recipe.safety.diet,recipe.diet);
 assert.equal(recipe.safety.vegetarian_requires_microbial_rennet,Boolean(recipe.diet_condition));
 assert.equal(recipe.safety.product_evidence,undefined);
 for(const key of engine.nutrients){
  const stored=recipe.nutrition_per_serving[key],computed=recipe.values[key];
  if(computed===null)assert.equal(stored,null);
  else assert.ok(Math.abs(stored-computed)<1e-8,recipe.id+' '+key);
 }
}
for(const id of ['R007','R020','R030']){
 const recipe=actual.find(recipe=>recipe.id===id);
 assert.ok(recipe.rows.some(({food})=>food.source_record_id==='G750902'&&food.state.includes('abgetropft')));
 assert.ok(recipe.steps.some(step=>step.includes('abtropfen')));
 assert.ok(!recipe.rows.some(({food})=>food.id==='F064'));
}
for(const group of safety.groups){
 const selection=engine.defaults({allergy:[group]});
 const protection=safety.envelope('confirmed','test',selection);
 const recipe=actual[0];
 // Test every group with known, missing, stale and explicitly scoped synthetic evidence.
 const row={...recipe.safety,release_status:'reviewed',declared:[group]};
 const known={...recipe,release_status:'reviewed',safety:{...row,groups:{[group]:'present'}}};
 assert.equal(safety.recipeGate(known,protection).status,'blocked');
 const record={...row,declared:[],groups:{}};
 const unknown={...known,safety:record};
 assert.equal(safety.recipeGate(unknown,protection).status,'product-check');
 const evidence={recipeId:record.recipeId,revision:record.revision,preparationReviewed:true,preparationSource:'Synthetisch',
  ingredients:record.all_food_ids.map(foodId=>({foodId,product:'Synthetisch',source:'Synthetisch',ingredientsReviewed:true,crossContactReviewed:true,relevantConflict:false}))};
 record.product_evidence={[group]:evidence};
 assert.equal(safety.recipeGate(unknown,protection).status,'checked');
 evidence.revision='stale';
 assert.equal(safety.recipeGate(unknown,protection).status,'product-check');
 evidence.revision=record.revision;
 evidence.ingredients[0].relevantConflict=true;
 assert.equal(safety.recipeGate(unknown,protection).status,'product-check');
}
console.log('PASS 420 allergy matrix rows, 14 group positive/negative and stale evidence, 30 original SHA-256, release statuses, values and Edamame states');
