import test from 'node:test';
import assert from 'node:assert/strict';
import {checkBriefMessageEvidence} from '../scripts/cohort/evidence-checks.mjs';

function fixture(){return {behavior:{openedApp:true},state:{profile:{name:'Synthetic'}},records:[{eventId:'e',status:200,request:{method:'GET',endpoint:'coaching/brief'},response:{viewKind:'on_demand_coaching_brief',revision:2,notes:[{id:'n',text:'Recorded factual note',action:'Next action',key:'context',role:'training',status:'GENERATED',deliveryStatus:'NOT_MEASURED',renderingStatus:'NOT_MEASURED'}]}}],messages:[{messageId:'n',eventId:'e',exactText:'Recorded factual note',actionText:'Next action',reasonCode:'context',engineStateRevision:2}]};}
test('message evidence is checked against original HTTP bytes, without regenerating optimistic messages',()=>{
 const b=fixture();assert.deepEqual(checkBriefMessageEvidence(b),[]);
 for(const [prefix,mutate]of [['BRIEF_MESSAGE_SOURCE',b=>b.messages[0].exactText='fabricated'],['BRIEF_MESSAGE_COUNT',b=>b.messages=[]],['BRIEF_FALSE_DELIVERY_CLAIM',b=>b.records[0].response.notes[0].renderingStatus='RENDERED'],['MISSING_BACKEND_BRIEF_EVIDENCE',b=>b.records=[]]]){const changed=structuredClone(b);mutate(changed);assert.ok(checkBriefMessageEvidence(changed).some(f=>f.startsWith(prefix)),prefix);}
});

test('cohort cannot claim a brief fetch while the user is absent or hide duplicate note IDs',()=>{
 const absent=fixture();absent.behavior.openedApp=false;
 assert.ok(checkBriefMessageEvidence(absent).some(f=>f.startsWith('BRIEF_FETCH_WITHOUT_APP')));
 const duplicate=fixture();duplicate.records[0].response.notes.push({...duplicate.records[0].response.notes[0]});
 assert.ok(checkBriefMessageEvidence(duplicate).some(f=>f.startsWith('BRIEF_DUPLICATE_NOTE')));
});
