'use strict';

function retryDecision({ attempt, statusCode, retryAfterSeconds = null, baseDelayMs = 1000, maxAttempts = 5 }) {
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error('RETRY_POLICY: attempt must start at 1');
  const retryable = statusCode === 429 || statusCode === 408 || statusCode >= 500;
  if (!retryable || attempt >= maxAttempts) return { retry: false, delayMs: 0, reason: retryable ? 'attempt_limit' : 'not_retryable' };
  const headerDelay = retryAfterSeconds === null ? 0 : Number(retryAfterSeconds) * 1000;
  const exponentialDelay = baseDelayMs * (2 ** (attempt - 1));
  return { retry: true, delayMs: Math.max(headerDelay, exponentialDelay), reason: statusCode === 429 ? 'rate_limit' : 'temporary_error' };
}

module.exports = { retryDecision };
