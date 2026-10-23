import {readFile,writeFile} from 'node:fs/promises';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const [meta,library,foods]=await Promise.all([read('data/meta.json'),read('data/planning-library.json'),read('data/index.json')]);
const expected={planning_source_ingredient_count:Object.keys(library.ingredients).length,planning_template_count:library.templates.length,food_count:foods.filter(f=>f.source!=='editorial-estimates').length,estimated_recipe_count:foods.filter(f=>f.source==='editorial-estimates').length};
const mismatches=Object.entries(expected).filter(([k,v])=>meta[k]!==v);
if(process.argv.includes('--write')){Object.assign(meta,expected);await writeFile('data/meta.json',JSON.stringify(meta));}
else if(mismatches.length)throw Error('Data manifest mismatch: '+mismatches.map(([k,v])=>`${k}: expected ${v}, found ${meta[k]}`).join('; '));
console.log('Verified derived data counts:',expected);
