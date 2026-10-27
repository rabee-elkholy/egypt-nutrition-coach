import {readdirSync,readFileSync} from 'node:fs';import {spawn} from 'node:child_process';
const group=process.argv[2];if(!['fast','worker'].includes(group))throw Error('Use fast or worker');
const files=readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).map(f=>'tests/'+f).filter(f=>/miniflare|server\/worker|dispatchFetch|getD1Database/i.test(readFileSync(f,'utf8'))===(group==='worker'));
const p=spawn(process.execPath,['--test','--test-concurrency=2',...files],{stdio:'inherit'});p.on('exit',code=>process.exitCode=code??1);
