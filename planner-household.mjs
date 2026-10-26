const FALLBACK_UNITS={
 soybeans:['كوب',172,.25,'6ef6a66f-c0c8-400f-b846-9abe3d39b058','1 cup undetermined'],
 sunfloweroil:['ملعقة صغيرة',4.5,.5,'64744054-d657-434c-9e68-92c8123bc2cc','1 tsp undetermined'],
 fava:['كوب',170,.25,'ae4eade3-1b20-4bb2-a26c-f2e772c4d2fb','1 cup undetermined'],
 lentils:['كوب',198,.25,'759a8573-b676-4da4-9110-d4ff4d2bbe48','1 cup undetermined'],
 chickpeas:['كوب',164,.25,'3983d435-15b2-4312-bae4-a64f8cb9a6b6','1 cup undetermined'],
 kidney:['كوب',177,.25,'1471948b-face-4b4b-8092-0fd794287b17','1 cup undetermined'],
 whitebeans:['كوب',179,.25,'2d385e9f-c274-4d9e-b7ad-55c791fd4bac','1 cup undetermined'],
 egg:['بيضة كبيرة',50,1,'6c2ef6ff-35dc-4de1-b845-d820fd8ada46','1 large undetermined'],
 bread:['رغيف بلدي',116.36,.25,'efca6a6e-26ca-42e1-bb81-93593bf74906','رغيف عينة الدراسة فقط؛ متوسط 116.36 جم، انحراف معياري 0.77 جم'],
 wholebread:['رغيف أسمر',64,.5,'6b64c9c1-e255-431b-9d0f-c6af01d53941','1 pita, large (6-1/2" dia) undetermined'],
 yogurt:['علبة زبادي',170,.5,'8dfb1dbd-672d-4290-91cd-b63c71868369','1 container (6 oz) undetermined'],
 cottage:['قطعة متوسطة (نص كوب)',113,.5,'d4ac8ca5-e9ac-49b9-9de7-f003340c8aa4','4 oz undetermined'],
 chicken:['قطعة صدر دجاج',86,.5,'ccf8a0c0-e5be-4fcc-bd92-a6d7e5fc0650','0.5 breast, bone and skin removed undetermined'],
 fish:['شريحة سمك فيليه',87,.5,'50f39f9c-5f39-4e5d-af41-d29e038bc964','1 fillet undetermined'],
 beef:['قطعة متوسطة (بحجم كف اليد)',85,.5,'bc4ec13f-3f49-4ba0-b86b-f4306844acbf','3 oz undetermined'],
 rice:['كوب',158,.25,'34d8cd83-5e27-4741-9fd2-ab0cbac22588','1 cup undetermined'],
 brownrice:['كوب',202,.25,'04559c7c-51f7-4167-a73d-08a920c645c5','1 cup undetermined'],
 pasta:['كوب',124,.25,'e3845756-6135-4514-a6cf-e9399a0f40c8','1 cup spaghetti not packed undetermined'],
 potato:['حبة متوسطة',167,.5,'242f64a5-20a6-4bc3-a48c-42bc50067639','1 medium (2-1/4" to 3-1/4" dia.) undetermined'],
 oats:['كوب',80,.25,'dfdf512d-d9cf-48f2-b24a-9003622c5a6b',' 1 cup undetermined'],
 tomato:['حبة متوسطة',123,.5,'8f41f6f9-61ba-4c08-93c1-6d79f352f5bc','1 medium whole (2-3/5" dia) undetermined'],
 cucumber:['حبة متوسطة',104,.5,'938bfef4-e930-4f76-9401-6a23466f9814','0.5 cup slices undetermined'],
 spinach:['كوب',180,.25,'f2ae0225-91ff-465f-af38-7e5d0ed9cabc','1 cup undetermined'],
 broccoli:['كوب',156,.25,'8eb8417e-5e32-4dad-9be4-434eb929ca1a','0.5 cup, chopped undetermined'],
 apple:['حبة متوسطة',182,.5,'30656cd6-eac8-42ac-badd-2c848654f2dd','1 medium (3" dia) undetermined'],
 banana:['حبة متوسطة',118,.5,'6455e4c4-868c-4610-b8ac-d4e8f96ca00a','1 medium (7" to 7-7/8" long) undetermined'],
 orange:['حبة متوسطة',131,.5,'3b58aae7-9e05-409b-ab53-c402eeaacbc0','1 fruit (2-5/8" dia) undetermined'],
 dates:['تمرة',7.1,1,'083047a7-ee50-4e65-9a50-c921bc989224','1 date, pitted undetermined'],
 peanuts:['حفنة يد متوسطة',28.35,.5,'f971c18c-6a0a-4202-8f39-7d2d6893b39d','1 oz undetermined'],
 almonds:['حفنة يد متوسطة',28.35,.5,'c1de131c-e620-4549-889f-cb4aff1df8d4','1 oz (23 whole kernels) undetermined'],
 olive:['ملعقة صغيرة',4.5,.5,'dbab19d3-7c7d-49dc-b885-5aa158667f5d','1 tsp undetermined'],
 feta:['قطعة متوسطة',38,.5,'3e9bc0fb-33c1-42f7-9d4b-a067a386317c','1 wedge (1.33 oz) undetermined'],
 milk:['كوب',244,.25,'30579ea4-c532-4431-bcba-36bc313ca04e','1 cup undetermined'],
 eggwhite:['كوب',135,.25,'6a32d866-b27a-4de8-a17e-0ebeb4866988',' 1 cup undetermined'],
 chickenthigh:['قطعة ورك دجاج',116,.5,'a3376d2f-4f2e-4e4d-9f76-ba50131149ab','1 thigh without skin undetermined'],
 peas:['كوب',160,.25,'e7e6b9ad-21ac-4819-8a30-d253f6e32b14','1 cup undetermined'],
 greenbeans:['كوب',125,.25,'aebbbe04-96b7-4449-89d4-7521be59c012','1 cup undetermined'],
 okra:['كوب',160,.25,'538d7b00-e950-4b8d-a298-5990248d7d7d','0.5 cup slices undetermined'],
 zucchini:['كوب',180,.25,'e31e4367-14c5-48af-95c9-4d14ea23414b','1 cup, sliced undetermined'],
 eggplant:['كوب',99,.25,'a53bd234-6a0e-47b9-ae20-9356defe7dae','1 cup (1" cubes) undetermined'],
 carrotcooked:['حبة متوسطة',46,.5,'c5b5dad6-743d-468f-bc8f-81ecb60e6f96','1 carrot undetermined'],
 carrot:['حبة متوسطة',61,.5,'c035d8b2-34ed-4a47-aa22-f155f11106cb','1 medium undetermined'],
 pepper:['حبة متوسطة',119,.5,'cded36ea-d1ff-470a-bc04-15489c2b2f64','1 medium (approx 2-3/4" long, 2-1/2" dia) undetermined'],
 lettuce:['كوب',72,.25,'cb30d999-3483-4bd8-bbea-e9efe1ff9e2a','1 cup shredded undetermined'],
 cabbage:['كوب',89,.25,'1009e7d3-04f6-4482-a9d1-9314af7dc329','1 cup, chopped undetermined'],
 onion:['حبة صغيرة',60,.5,'5a817e64-0623-4ef5-846f-5c989878b912','1 small undetermined'],
 garlic:['فص ثوم',3,1,'c54d1a25-32b6-486d-b1f2-250dddde226a','1 clove undetermined'],
 parsley:['كوب',60,.25,'a3b13e0c-3db7-4f85-a087-8a347a4baccf','1 cup chopped undetermined'],
 lemon:['حبة ليمون',58,.5,'3f20d264-0a57-4bf2-91a4-266518ce3c7e','1 fruit (2-1/8" dia) undetermined'],
 tahini:['ملعقة كبيرة',15,.5,'c5ea2b6c-c600-4070-99b8-d89f4af7a131','1 tbsp undetermined'],
 bulgur:['كوب',182,.25,'b6f9aa6b-5832-4df4-ac3b-9e34f7da2d21','1 cup undetermined'],
 couscous:['كوب',157,.25,'297b7150-8f99-4ad6-b3d9-3f98bf0a27f1','1 cup, cooked undetermined'],
 guava:['حبة متوسطة',55,.5,'a1a134a2-d429-4917-8da7-406db8895659','1 fruit, without refuse undetermined'],
 mango:['حبة متوسطة',165,.5,'93725880-f487-4299-959f-1b7dc6df3a1d','1 cup pieces undetermined'],
 melon:['كوب',177,.25,'dd3d966d-6cc0-453d-8aa7-0872dc9e25f2','1 cup, balls undetermined'],
 watermelon:['كوب',154,.25,'49a6c52e-d16d-40d4-9776-41eb9ab1a29b','1 cup, balls undetermined'],
 fig:['حبة متوسطة',50,.5,'01a5cd54-ec1a-44b1-ab19-720d2e3b9932','1 medium (2-1/4" dia) undetermined'],
 grape:['كوب',151,.25,'68a58a0d-1138-4ed7-8224-9e9959bee71e','1 cup undetermined'],
 strawberry:['كوب',152,.25,'eb039c1a-19f9-44b7-bac2-00c625c83d57','1 cup, halves undetermined'],
 pear:['حبة متوسطة',178,.5,'d8c64280-1817-4d5a-8590-8ab36103f4b1','1 medium undetermined'],
 tomatocooked:['كوب',240,.25,'c5672387-1d33-4ae6-b262-3e5dcb67b0b8','1 cup undetermined'],
 friedegg:['بيضة',50,1,'8ca701d3-dd99-4802-9fcb-0156de0c0163',' 1 egg undetermined'],
 chickenboiled:['قطعة صدر دجاج',95,.5,'633449da-ba16-4a24-93c6-ec00eff36dbb','0.5 breast, bone and skin removed undetermined'],
 shrimp:['حصة متوسطة (حوالي 12 حبة)',85,.5,'0f176f22-4a42-4865-9ac1-4be9e7975ad9','3 oz undetermined'],
 seabass:['شريحة سمك فيليه',101,.5,'e8cf0247-e1b7-4cfb-a204-2a9f2655aae5','1 fillet undetermined'],
 greekyogurt:['علبة زبادي يوناني',200,.5,'79be6896-8a09-4937-b845-85b82ad37262','1 container (7 oz) undetermined'],
 wholemilk:['كوب',244,.25,'b3bef49c-c9b0-42cd-9c9b-ccf4b6ee2d2c','1 cup undetermined'],
 mozzarella:['شريحة متوسطة',28.35,.5,'a0b4fb66-b89f-4e64-9a14-8e2b24e52616',' 1 stick undetermined'],
 tuna:['علبة تونة مصفاة',90,.5,'f2a18284-7406-489c-bc23-e8b03425d720',' 1 small/regular fillet undetermined'],
 salmon:['شريحة متوسطة',85,.5,'bc5176b3-062f-4d74-bae7-7eb71c39ae57','3 oz undetermined'],
 turkey:['قطعة متوسطة (بحجم كف اليد)',85,.5,'2a75052b-1052-4f24-90d2-2dc0c03500b0','3 oz undetermined'],
 lamb:['قطعة متوسطة (بحجم كف اليد)',85,.5,'46d75285-4baa-411e-a0c8-ac14ecc6fd48','3 oz undetermined'],
 liver:['شريحة متوسطة',81,.5,'74e9996e-d82d-47a2-a423-f90791ab255d','1 slice undetermined'],
 shawarma_chicken:['بولة متوسطة (4 ملاعق كبيرة)',54,.5,'5158e508-329c-4037-8ed3-7003687fd3c7','54 g (4 Tbsp)'],
 shawarma_beef:['بولة متوسطة (4 ملاعق كبيرة)',50,.5,'43b391d7-35d7-498a-88ec-0e3268b5b58f','50 g (4 Tbsp)'],
 falafel:['قرص طعمية',17,1,'c050a150-d153-4c2b-a508-64ae1f08c47c','1 patty (approx 2-1/4" dia) undetermined'],
 sweetpotato:['حبة متوسطة',150,.5,'adda95c6-030d-42c9-9b6a-9b0fc9c04948',' 1 medium undetermined'],
 toast:['شريحة توست',42,.5,'a8f88f4c-b527-4a9a-9189-c18fe026e528','1 slice undetermined'],
 basmati:['كوب',158,.25,'0e4f5a02-8109-4347-9852-37c74fa483e2','1 cup undetermined'],
 quinoa:['كوب',185,.25,'5d12fe98-c647-4943-9525-e6f3b70b4bca','1 cup undetermined'],
 peanutbutter:['ملعقة كبيرة',16,.5,'2563d783-ec7d-4036-a4a3-e645ea8534e5','2 tbsp undetermined'],
 honey:['ملعقة كبيرة',21,.5,'e810ba84-5b95-447e-bb03-04404cbf5f97','1 tbsp undetermined'],
 avocado:['حبة متوسطة',150,.5,'928dfb1a-0093-4b69-8812-7fb4e1c6a2e9',' 1 fruit undetermined'],
 walnuts:['حفنة يد متوسطة',28.35,.5,'13c43af8-9fb7-4331-b383-2e07d5368e96','1 oz (14 halves) undetermined'],
 cashews:['حفنة يد متوسطة',28.35,.5,'f4cf8ded-aef3-452f-a97a-169c0e1aa0d7',' 1 oz undetermined'],
 tabbouleh:['طبق سلطة (كوب)',200,.5,'0d21899b-a296-4388-965c-1522202dc01e','200 g (1 cup)'],
 fattoush:['طبق سلطة (كوب)',200,.5,'18c37808-bfed-4109-becc-d926e7d352fe','200 g (1 cup)'],
 babaghanouj:['طبق صغير (6 ملاعق كبيرة)',100,.5,'118489d8-53e6-4287-9daa-a8ffd8ff13fb','100 g (6 Tbsp)']
};

export function preferredPortion(i){
 const rows=(i.portions||[]).filter(p=>Number(p.grams)>0&&Number.isFinite(Number(p.grams)));
 const pick=(re,label,step)=>{const p=rows.find(p=>re.test(p.label.trim().replace(/\s*undetermined$/i,'')));return p?{...p,original_label:p.label,label,step}:null};
 if(['egg','friedegg'].includes(i.key))return pick(/^1 large$/i,'بيضة كبيرة',1)||pick(/^1 egg$/i,'بيضة',1);
 if(i.key==='bread')return pick(/^رغيف عينة الدراسة/,'رغيف بلدي',.25);
 if(i.role==='fruit'){const p=pick(/^1 medium\b/i,'حبة متوسطة',1);if(p)return p;}
 if(i.role==='fat')return pick(/^1 (tsp|teaspoon)$/i,'ملعقة صغيرة',.5)||pick(/^1 (tbsp|tablespoon)$/i,'ملعقة كبيرة',.25);
 const p=rows.find(p=>/^1 cup(?:\b|,)/i.test(p.label.trim())&&!/mashed|chopped|sliced|crumbled|shredded|diced|quartered/i.test(p.label));
 if(p)return {...p,label:'كوب',step:.25};
 return null;
}

export function displayPortion(i){
 const rows=(i.portions||[]).filter(p=>Number(p.grams)>0&&Number.isFinite(Number(p.grams)));
 if(!rows.length){
  if(!Array.isArray(i.portions)&&i.key&&FALLBACK_UNITS[i.key]){
   const [label,grams,step,id,original_label]=FALLBACK_UNITS[i.key];
   return {id,label,grams:String(grams),step,original_label};
  }
  return null;
 }
 const pick=(re,label,step=.5,scale=1)=>{
  const p=rows.find(p=>re.test(p.label.trim().replace(/\s*undetermined$/i,'')));
  return p?{...p,grams:String(Number(p.grams)*scale),original_label:p.label,label,step}:null;
 };
 if(['egg','friedegg'].includes(i.key))return pick(/^1 large$/i,'بيضة كبيرة',1)||pick(/^1 egg$/i,'بيضة',1);
 if(i.key==='bread')return pick(/^رغيف عينة الدراسة/,'رغيف بلدي',.25);
 if(i.key==='wholebread')return pick(/^1 pita, large/i,'رغيف أسمر',.5)||pick(/^1 pita/i,'رغيف أسمر',.5);
 if(i.key==='toast')return pick(/^1 slice\b/i,'شريحة توست',.5);
 if(i.key==='dates')return pick(/^1 date/i,'تمرة',1);
 if(i.key==='falafel')return pick(/^1 patty/i,'قرص طعمية',1);
 if(i.key==='garlic')return pick(/^1 clove/i,'فص ثوم',1);
 if(i.key==='lemon')return pick(/^1 fruit/i,'حبة ليمون',.5);
 if(i.key==='yogurt')return pick(/^1 container \(6 oz\)/i,'علبة زبادي',.5)||pick(/^1 cup/i,'كوب',.25);
 if(i.key==='greekyogurt')return pick(/^1 container/i,'علبة زبادي يوناني',.5);
 if(i.key==='cottage')return pick(/^4 oz/i,'قطعة متوسطة (نص كوب)',.5)||pick(/^1 cup/i,'كوب',.25);
 if(i.key==='feta')return pick(/^1 wedge/i,'قطعة متوسطة',.5)||pick(/^1 oz/i,'قطعة متوسطة',.5);
 if(i.key==='mozzarella')return pick(/^1 stick/i,'شريحة متوسطة',.5)||pick(/^1 slice\b/i,'شريحة متوسطة',.5);
 if(['chicken','chickenboiled'].includes(i.key))return pick(/^0\.5 breast/i,'قطعة صدر دجاج',.5);
 if(i.key==='chickenthigh')return pick(/^1 thigh without skin/i,'قطعة ورك دجاج',.5)||pick(/^3 oz/i,'قطعة متوسطة',.5);
 if(i.key==='tuna')return pick(/^1 small\/regular fillet/i,'علبة تونة مصفاة',.5)||pick(/^1 cup/i,'كوب',.25);
 if(['fish','seabass','salmon'].includes(i.key))return pick(/^1 fillet/i,'شريحة سمك فيليه',.5)||pick(/^3 oz/i,'شريحة متوسطة',.5);
 if(i.key==='liver')return pick(/^1 slice/i,'شريحة متوسطة',.5)||pick(/^3 oz/i,'حصة متوسطة',.5);
 if(['beef','lamb','turkey'].includes(i.key))return pick(/^3 oz/i,'قطعة متوسطة (بحجم كف اليد)',.5);
 if(i.key==='shrimp')return pick(/^3 oz/i,'حصة متوسطة (حوالي 12 حبة)',.5)||pick(/^4 large/i,'حبة جمبري كبيرة',1,.25);
 if(['shawarma_chicken','shawarma_beef'].includes(i.key))return pick(/\(4 Tbsp\)/i,'بولة متوسطة (4 ملاعق كبيرة)',.5);
 if(i.key==='babaghanouj')return pick(/\(6 Tbsp\)/i,'طبق صغير (6 ملاعق كبيرة)',.5);
 if(['tabbouleh','fattoush'].includes(i.key))return pick(/\(1 cup\)/i,'طبق سلطة (كوب)',.5);
 if(['almonds','peanuts','walnuts','cashews'].includes(i.key))return pick(/^1 oz/i,'حفنة يد متوسطة',.5);
 if(i.key==='peanutbutter')return pick(/^2 tbsp/i,'ملعقة كبيرة',.5,.5);
 if(['tahini','honey'].includes(i.key))return pick(/^1 (tbsp|tablespoon)/i,'ملعقة كبيرة',.5);
 if(i.key==='sunfloweroil')return pick(/^1 tsp/i,'ملعقة صغيرة',.5);
 if(i.key==='olive')return Number(i.grams)>=10?(pick(/^1 (tbsp|tablespoon)/i,'ملعقة كبيرة',.5)||pick(/^1 (tsp|teaspoon)/i,'ملعقة صغيرة',.5)):(pick(/^1 (tsp|teaspoon)/i,'ملعقة صغيرة',.5)||pick(/^1 (tbsp|tablespoon)/i,'ملعقة كبيرة',.5));
 if(i.key==='cucumber')return pick(/^0\.5 cup/i,'حبة متوسطة',.5,2)||pick(/^1 cucumber/i,'حبة متوسطة',.5);
 if(i.key==='mango')return pick(/^1 cup pieces/i,'حبة متوسطة',.5)||pick(/^1 fruit/i,'حبة متوسطة',.5);
 if(i.key==='onion')return pick(/^1 small/i,'حبة صغيرة',.5)||pick(/^1 medium/i,'حبة متوسطة',.5);
 if(['potato','sweetpotato','tomato','pepper','carrot','carrotcooked','avocado','apple','banana','orange','guava','pear','fig'].includes(i.key)){
  return pick(/^1 (medium|carrot|avocado|fruit)/i,'حبة متوسطة',.5)||pick(/^2 medium/i,'حبة متوسطة',.5,.5);
 }
 return pick(/^1 cup/i,'كوب',.25)||pick(/^0\.5 cup/i,'كوب',.25,2)||pick(/^1 (tbsp|tablespoon)/i,'ملعقة كبيرة',.5)||preferredPortion(i);
}

export function roundedHouseholdGrams(i){
 const grams=Number(i.grams);if(i.grams==null||!Number.isFinite(grams)||grams<=0)return i.grams;
 const unit=preferredPortion(i),step=unit?Number(unit.grams)*unit.step:(grams<10?1:10);
 return String(Number((Math.max(1,Math.round(grams/step))*step).toFixed(6)));
}
export function practicalParts(parts,lib){
 return parts.map(p=>{
  const i=lib.ingredients[p.key],unit=preferredPortion(i);if(!unit){const g=Number(roundedHouseholdGrams({...i,grams:p.grams}));return {...p,grams:String(Math.max(Math.max(i.min_g,p.min_g||0),Math.min(p.max_g??i.max_g,g)))};}
  const step=Number(unit.grams)*unit.step,lo=Math.max(i.min_g,p.min_g||0),hi=p.max_g??i.max_g;
  const min=Math.max(1,Math.ceil(lo/step)),max=Math.floor(hi/step);if(min>max)return p;
  const count=Math.max(min,Math.min(max,Math.round(Number(p.grams)/step)));
  return {...p,grams:String(Number((count*step).toFixed(6)))};
 });
}
export function householdQuantity(i){
 if(i.grams==null||Number(i.grams)<=0)return null;
 const unit=displayPortion(i);if(!unit)return null;
 const rawCount=Number(i.grams)/Number(unit.grams);
 const step=unit.step||.5;
 const snapped=Math.max(step,Math.round(rawCount/step)*step);
 const quarter=Math.round(snapped*4)/4;
 const whole=Math.floor(quarter),fraction=Math.round((quarter-whole)*4),words=['','ربع','نص','تلات أرباع'];
 let label=fraction?(whole?`${whole} و${words[fraction]} ${unit.label}`:`${words[fraction]} ${unit.label}`):`${whole} ${unit.label}`;
 if(quarter===1)label=unit.label;
 if(quarter===1.5){
  const sp=unit.label.indexOf(' ');
  label=sp>0?`${unit.label.slice(0,sp)} ونص${unit.label.slice(sp)}`:`${unit.label} ونص`;
 }
 if(unit.label==='بيضة كبيرة'&&quarter===1)label='بيضة كبيرة';
 if(unit.label==='بيضة كبيرة'&&quarter===2)label='بيضتين كبار';
 if(unit.label==='بيضة'&&quarter===1)label='بيضة';
 if(unit.label==='بيضة'&&quarter===2)label='بيضتين';
 return {label,grams:i.grams,portion_id:unit.id,source_label:unit.original_label||unit.label,source_grams:unit.grams};
}
