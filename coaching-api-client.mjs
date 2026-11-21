// @ts-check
import { formatArabicError } from './error-messages-ar.mjs';

/** Reads are disposable. Mutations keep their original envelope across uncertainty.
 * @param {{fetcher?:typeof fetch}} [options]
 */
export function createCoachingApiClient({ fetcher = globalThis.fetch } = {}) {
  let epoch = 0, disposed = false;
  const reads = new Set();
  const stale = () => new DOMException('', 'AbortError');
  function invalidateReads() { epoch++; for (const controller of reads) controller.abort(); reads.clear(); }

  /** @param {string} path @param {RequestInit} [options] */
  async function request(path, options = {}) {
    const read = (options.method || 'GET') === 'GET', version = epoch;
    if (disposed) throw stale();
    const controller = read ? new AbortController() : null;
    if (controller) reads.add(controller);
    try {
      const response = await fetcher('/v1/' + path, { ...options, ...(controller ? { signal: controller.signal } : {}) });
      const payload = await response.json();
      if (read && (disposed || version !== epoch)) throw stale();
      if (!response.ok) {
        const errObj = payload && typeof payload.error === 'object' ? payload.error : { code: payload?.code, message: payload?.error || payload?.message, params: payload?.params, fieldErrors: payload?.fieldErrors, retryable: payload?.retryable, details: payload?.details };
        const arabicMessage = formatArabicError(errObj.code, errObj.params || {}, errObj.message || 'تعذر الاتصال');
        throw Object.assign(Error(arabicMessage), {
          status: response.status,
          code: errObj.code || 'INTERNAL_ERROR',
          params: errObj.params || {},
          fieldErrors: errObj.fieldErrors || [],
          retryable: Boolean(errObj.retryable),
          details: errObj.details
        });
      }
      if (payload && payload.ok === true && Object.hasOwn(payload, 'data')) {
        return payload.data;
      }
      return payload;
    } catch (error) {
      if (read && (disposed || version !== epoch || controller?.signal.aborted)) throw stale();
      throw error;
    } finally {
      if (controller) reads.delete(controller);
    }
  }
  return { request, invalidateReads, dispose() { disposed = true; invalidateReads(); }, get pendingReads() { return reads.size; } };
}
