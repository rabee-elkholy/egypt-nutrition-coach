// Structural evidence checks, independent of runner outcome classifications.
export function checkDayEvidence(bundle,expectedDate=null) {
  const failures = [];
 if(expectedDate!==null&&bundle.date!==expectedDate)failures.push('CALENDAR_DATE:'+bundle.date+':expected:'+expectedDate);
  for (const rec of bundle.records) {
    const id = rec.eventId;
    if (!Number.isInteger(rec.status) || rec.status < 100 || rec.status > 599) failures.push('HTTP_STATUS:' + id);
    if (!rec.requestId && !rec.transportError) failures.push('REQUEST_ID:' + id);
    if (!rec.requestUrl || !rec.request?.method || !rec.request?.endpoint) failures.push('HTTP_ENVELOPE:' + id);
    if (rec.identityContext?.userId !== bundle.userId || rec.requestHeaders?.['oai-authenticated-user-id'] !== bundle.userId) failures.push('IDENTITY_CONTEXT:' + id);
    if (rec.request.method === 'POST' && (!rec.idempotencyKey || rec.requestHeaders?.['Idempotency-Key'] !== rec.idempotencyKey)) failures.push('IDEMPOTENCY_CONTEXT:' + id);
    if (!Number.isFinite(rec.latencyMs) || rec.latencyMs < 0 || rec.latencyProvenance !== 'LOCAL_MINIFLARE_DISPATCH_WITH_D1') failures.push('LATENCY_PROVENANCE:' + id);
    if (rec.expectedOutcome === 'VALIDATION_ERROR' && rec.status !== 400) failures.push('INVALID_ACTION_NOT_REJECTED:' + id);
  }
  for (const message of bundle.messages) {
    if (message.wasActuallyRendered || message.visibleAt !== null || message.renderingStatus !== 'NOT_MEASURED') failures.push('FABRICATED_RENDERING:' + message.messageId);
  }
  const plans = bundle.state.plans || [], ids = plans.map(p => p.id);
  if (new Set(ids).size !== ids.length) failures.push('DUPLICATE_PLAN_ID');
  if (bundle.state.active_plan_id && !ids.includes(bundle.state.active_plan_id)) failures.push('MISSING_ACTIVE_PLAN_SNAPSHOT');
  return failures;
}

export function checkBriefMessageEvidence(bundle){
 const failures=[],expected=new Map();
 for(const event of bundle.records){
  if(event.request.method!=='GET'||event.request.endpoint!=='coaching/brief'||event.status!==200)continue;
  if(!bundle.behavior?.openedApp)failures.push('BRIEF_FETCH_WITHOUT_APP:'+event.eventId);
  if(event.response.viewKind!=='on_demand_coaching_brief'||!Array.isArray(event.response.notes)){failures.push('BRIEF_RESPONSE_CONTRACT:'+event.eventId);continue;}
  for(const note of event.response.notes){
   if(note.status!=='GENERATED'||note.deliveryStatus!=='NOT_MEASURED'||note.renderingStatus!=='NOT_MEASURED')failures.push('BRIEF_FALSE_DELIVERY_CLAIM:'+event.eventId);
   if(expected.has(note.id))failures.push('BRIEF_DUPLICATE_NOTE:'+note.id);
   expected.set(note.id,{note,event});
  }
 }
 if(bundle.behavior?.openedApp&&bundle.state.profile&&!expected.size)failures.push('MISSING_BACKEND_BRIEF_EVIDENCE');
 if(bundle.messages.length!==expected.size)failures.push('BRIEF_MESSAGE_COUNT');
 for(const message of bundle.messages){
  const source=expected.get(message.messageId),note=source?.note;
  if(!note||source.event.eventId!==message.eventId||note.text!==message.exactText||note.action!==message.actionText||note.key!==message.reasonCode||source.event.response.revision!==message.engineStateRevision)failures.push('BRIEF_MESSAGE_SOURCE:'+message.messageId);
 }
 return failures;
}
