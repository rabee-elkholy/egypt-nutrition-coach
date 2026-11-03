// Import exact retained source profiles. No guessed nutrients or portion weights.
import fs from 'node:fs';
const path='data/planning-library.json',lib=JSON.parse(fs.readFileSync(path)),idx=JSON.parse(fs.readFileSync('data/index.json'));
export const additions=[
 ['taro','قلقاس مطبوخ','630128bd-d128-4156-9f14-2209884bca75','carb',60,300,['قلقاس']],
 ['corn','ذرة حلوة مطبوخة','fe434815-ce0b-4581-a563-67d21ed86ab6','carb',50,250,['ذرة','درة']],
 ['mushrooms','مشروم مطبوخ','26b6deef-cb34-4dee-a118-bf5106317d9e','veg',40,200,['مشروم','فطر','عيش الغراب']],
 ['cauliflower','قرنبيط مطبوخ','6fbbef08-8e85-4de5-8a04-16e07ae870e0','veg',50,250,['قرنبيط','زهرة']],
 ['beetroot','بنجر مطبوخ','a6711251-9f9e-40bc-8bc5-2ceff29e4c77','veg',40,200,['بنجر','شمندر']],
 ['pumpkin','قرع عسل مطبوخ','ef536f1e-3a01-4479-9e03-d916c9d560cf','veg',60,300,['قرع','يقطين','قرعة']]
];
const metrics={energy:'fdc:1008',protein:'fdc:1003',fat:'fdc:1004',carbs:'fdc:1005',fiber:'fdc:1079',saturated:'fdc:1258',sodium:'fdc:1093',sugars:'fdc:2000'};
for(const [key,label,id,role,min_g,max_g,aliases] of additions){
 const source=idx.find(f=>f.id===id),d=JSON.parse(fs.readFileSync('data/details/'+id.slice(0,2)+'.json'))[id];
 if(source?.status!=='approved'||Number(d.basis_g)!==100)throw Error('Unapproved or non-100g source '+id);
 const evidence=Object.fromEntries(d.nutrients.map(n=>[n.id,n]));
 lib.ingredients[key]={key,label,food_id:id,role,protein_group:null,budget_tier:key==='mushrooms'?'medium':'low',min_g,max_g,aliases,state:'cooked',
 values:Object.fromEntries(Object.entries(metrics).map(([m,n])=>[m,evidence[n]?.value??null])),carb_id:'fdc:1005',energy_id:'fdc:1008',
 source:d.source_id,source_name:source.english,source_external_id:d.external_id,nutrient_evidence:evidence,
 reference:{profile_id:d.profile_id,source_id:d.source_id,source_region:d.source_region,locator:d.locator,sha256:d.sha256,review_scope:d.review_scope},
 portions:d.portions,notes:'الوزن بعد الطبخ للجزء الصالح للأكل؛ القيم والحصص من المرجع المحفوظ.',regions:['egypt','gulf','levant','maghreb'],regional_basis:'Editorial menu availability, not a source-country claim'};
}
fs.writeFileSync(path,JSON.stringify(lib));console.log('Planning ingredients:',Object.keys(lib.ingredients).length);
