// @ts-check
export {localDate,dateOffset,validDate} from './coaching-shared.mjs';
export const DAY_MS=86400000;
/** @param {string} at @param {number} now @param {number} [span]
 * Exact elapsed time; do not replace with a count of local dates. */
export function withinElapsed(at,now,span=DAY_MS){const time=Date.parse(at);return Number.isFinite(time)&&time<=now&&now-time<=span;}
/** @param {string} at @param {number} now
 * Expiry is exclusive, unlike the inclusive freshness window above. */
export function unexpired(at,now){return Number.isFinite(Date.parse(at))&&Date.parse(at)>now;}
