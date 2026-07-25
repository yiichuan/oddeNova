import { describe, expect, it, vi } from 'vitest';
import {
  getErrorStatus,
  getRetryDelayMs,
  isAbortError,
  isRetryableRequestError,
  waitForRetryDelay,
} from '../errors';

describe('request retry errors', () => {
  it.each([408, 429, 500, 503])('retries HTTP %s', (status) => {
    const error = Object.assign(new Error('request failed'), { status });

    expect(isRetryableRequestError(error)).toBe(true);
    expect(getErrorStatus(error)).toBe(status);
  });

  it.each([400, 401, 403, 404, 422])('does not retry HTTP %s', (status) => {
    const error = Object.assign(new Error('request failed'), { status });

    expect(isRetryableRequestError(error)).toBe(false);
  });

  it('retries browser and SDK connection failures', () => {
    const sdkError = Object.assign(new Error('Connection closed'), {
      name: 'APIConnectionError',
    });

    expect(isRetryableRequestError(new TypeError('network error'))).toBe(true);
    expect(isRetryableRequestError(sdkError)).toBe(true);
  });

  it('retries empty responses but not unrelated errors', () => {
    const emptyResponse = Object.assign(new Error('empty'), {
      name: 'EmptyAgentResponseError',
    });

    expect(isRetryableRequestError(emptyResponse)).toBe(true);
    expect(isRetryableRequestError(new Error('invalid local state'))).toBe(false);
  });

  it('never retries an abort', () => {
    const controller = new AbortController();
    controller.abort();

    expect(isAbortError(controller.signal.reason, controller.signal)).toBe(true);
    expect(isRetryableRequestError(controller.signal.reason, controller.signal)).toBe(false);
  });
});

describe('request retry delay', () => {
  it('uses fixed bases plus a 0-250ms jitter', () => {
    expect(getRetryDelayMs(1, () => 0)).toBe(500);
    expect(getRetryDelayMs(1, () => 0.9999)).toBe(750);
    expect(getRetryDelayMs(2, () => 0)).toBe(1500);
    expect(getRetryDelayMs(2, () => 0.9999)).toBe(1750);
  });

  it('can be aborted while waiting', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const waiting = waitForRetryDelay(500, controller.signal);

      controller.abort();

      await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      vi.useRealTimers();
    }
  });
});
