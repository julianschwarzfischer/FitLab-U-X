// Used only by tests of the positive booking path. Production recipes remain drafts.
async function syntheticReviewedRecipes(page){
 await page.addInitScript(()=>{
  const realFetch=window.fetch.bind(window);
  window.fetch=async (resource,options)=>{
   const response=await realFetch(resource,options);
   if(!response.ok||typeof resource!=='string')return response;
   if(!['nutrition/recipes.json','nutrition/allergen-matrix.json'].includes(resource.split('?')[0]))return response;
   const data=await response.json();
   for(const row of Object.values(data.recipes))row.release_status='reviewed';
   return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
  };
 });
}
async function confirmNutrition(page,overrides={}){
 const saved=await page.evaluate(overrides=>xpNutritionStore({
  diet:'Mischkost',allergy:[],intolerance:[],exclusions:[],foods:[],dishes:[],minutes:0,...overrides
 },xpNutritionProfile().revision),overrides);
 if(!saved)throw Error('Synthetic nutrition profile was not saved.');
}
module.exports={syntheticReviewedRecipes,confirmNutrition};
