// @ts-check
// Shared policy; wording belongs to the message modules.
export const recoveryNeedsAttention=status=>['stop','hold','high','caution'].includes(status);
export const followupIsProtected=note=>!!note&&(['safety-support','short-sleep','tired','return'].includes(note.key)||note.key.startsWith('coaching-'));
export const nutritionNeedsAttention=notes=>notes.some(n=>['high-hunger','plan-expired','maintenance-declined','calories-declined'].includes(n.key));
export const agreementMayReplaceFollowup=(ready,follow)=>!recoveryNeedsAttention(ready.status)&&!['short-sleep','tired'].includes(follow?.key);
