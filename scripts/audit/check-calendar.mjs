import {readFileSync,writeFileSync,existsSync,createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {cohortCalendarDate} from '../cohort/common.mjs';

const root=path.resolve(process.argv[2]||''),output=path.resolve(process.argv[3]||'docs/production-readiness/evidence/calendar-verdict.json');
if(existsSync(output))throw Error('Preserve existing calendar evidence');
const config=JSON.parse(readFileSync(path.join(root,'simulation_config.json'))),failures=[],dates=new Set();let records=0;
for await(const line of createInterface({input:createReadStream(path.join(root,'all_days.jsonl')),crlfDelay:Infinity})){
 if(!line.trim())continue;const day=JSON.parse(line),expected=cohortCalendarDate(config.startDate,day.day);records++;
 if(day.date!==expected)failures.push({userId:day.userId,day:day.day,date:day.date,expected});
 const key=day.userId+':'+day.date;if(dates.has(key))failures.push({userId:day.userId,day:day.day,code:'DUPLICATE_USER_DATE',date:day.date});dates.add(key);
}
const report={scope:'Temporal audit of hash-verifiable derived daily records',run:root,passed:failures.length===0&&records===config.users*config.days,records,uniqueUserDates:dates.size,failures};
writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({output,passed:report.passed,records,uniqueUserDates:dates.size,temporalFailures:failures.length}));if(!report.passed)process.exitCode=1;
