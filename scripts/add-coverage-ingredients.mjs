// Promote two retained reference foods into planning; never invent nutrients.
import fs from 'node:fs';
const file='data/planning-library.json',lib=JSON.parse(fs.readFileSync(file));
const index=JSON.parse(fs.readFileSync('data/index.json'));
const metrics={energy:'fdc:1008',protein:'fdc:1003',fat:'fdc:1004',carbs:'fdc:1005',fiber:'fdc:1079',saturated:'fdc:1258',sodium:'fdc:1093',sugars:'fdc:2000'};
for(const spec of [
 {key:'soybeans',id:'c48612e1-bf61-4708-9cff-c2d4130984f2',label:'فول صويا ناضج مسلوق بدون ملح',role:'protein',group:'legumes',budget:'high',min:80,max:250,aliases:['صويا','فول صويا','soybeans'],cost:'Conservative high tier for a less routinely stocked specialty legume; does not make all legumes interchangeable.'},
 {key:'sunfloweroil',id:'ffed97f3-9836-4044-a2f1-d407f52a7882',label:'زيت دوار الشمس',role:'fat',group:null,budget:'low',min:0,max:35,aliases:['زيت عباد الشمس','زيت دوار الشمس','sunflower oil'],cost:'Editorial relative cost for limited recipe quantities, not a current monetary guarantee; sunflower retail offers are materially below olive oil. See COVERAGE_FOOD_REPAIR.md.'}
]){
 const food=index.find(f=>f.id===spec.id),detail=JSON.parse(fs.readFileSync('data/details/'+spec.id.slice(0,2)+'.json'))[spec.id];
 if(food.status!=='approved'||detail.source_id!=='usda-fdc'||Number(detail.basis_g)!==100)throw Error('Unexpected source identity/basis');
 const evidence=Object.fromEntries(detail.nutrients.map(n=>[n.id,n]));
 const values=Object.fromEntries(Object.entries(metrics).map(([key,id])=>[key,evidence[id]?.value??null]));
 if(Object.values(values).some(v=>v===null))throw Error('Required source nutrient missing');
 lib.ingredients[spec.key]={key:spec.key,label:spec.label,food_id:spec.id,role:spec.role,protein_group:spec.group,budget_tier:spec.budget,min_g:spec.min,max_g:spec.max,aliases:spec.aliases,state:food.state,values,carb_id:food.carb_id,energy_id:food.energy_id,source:detail.source_id,source_name:food.english,source_external_id:detail.external_id,nutrient_evidence:evidence,reference:{profile_id:detail.profile_id,source_id:detail.source_id,source_region:detail.source_region,locator:detail.locator,sha256:detail.sha256,review_scope:detail.review_scope},portions:detail.portions,notes:'الوزن للجزء الصالح للأكل بالحالة المرجعية؛ الصويا موزونة بعد السلق، والزيت محسوب داخل الوجبة.',regions:['egypt','levant','gulf','maghreb'],regional_basis:'Editorial availability, not source-country equivalence',budget_scope:spec.cost};
}
lib.data_version='0.6.0-data.5';
fs.writeFileSync(file,JSON.stringify(lib));
console.log('Promoted retained soybeans and sunflower oil reference profiles without changing nutrient values.');
