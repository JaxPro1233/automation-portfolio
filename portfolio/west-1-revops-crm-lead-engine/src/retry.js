export const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export function isRetryable(error) {
  return error?.retryable === true || RETRYABLE_STATUS_CODES.has(Number(error?.statusCode));
}

export function retryDelayMs(error, attempt, options = {}) {
  const hasRetryAfter = error?.retryAfterMs !== null && error?.retryAfterMs !== undefined;
  const retryAfterMs = hasRetryAfter ? Number(error.retryAfterMs) : Number.NaN;
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) return retryAfterMs;
  const baseMs = options.baseMs ?? 250;
  const maxMs = options.maxMs ?? 10_000;
  const jitter = options.jitter ?? (() => 0);
  return Math.min(maxMs, baseMs * (2 ** (attempt - 1))) + Math.floor(jitter() * baseMs);
}

export async function withRetry(operation, options = {}) {
  const maxAttempts = options.maxAttempts ?? 5;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await operation(attempt);
      attempts.push({ attempt, ok: true });
      return { value, attempts };
    } catch (error) {
      const retryable = isRetryable(error);
      const delayMs = retryable && attempt < maxAttempts
        ? retryDelayMs(error, attempt, options)
        : null;
      attempts.push({
        attempt,
        ok: false,
        statusCode: error?.statusCode ?? null,
        code: error?.code ?? 'INTEGRATION_ERROR',
        retryable,
        delayMs,
      });
      if (!retryable || attempt === maxAttempts) {
        error.attempts = attempts;
        throw error;
      }
      await sleep(delayMs);
    }
  }

  throw new Error('Unreachable retry state');
}
