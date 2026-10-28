// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { formatReceiptNumber, nextReceiptNumber, RECEIPT_COUNTER_KEY, recordReceiptPrinted } from '../receipt-counter';

const morning = new Date(2026, 9, 18, 9, 0).getTime();
const evening = new Date(2026, 9, 18, 23, 59).getTime();
const nextDay = new Date(2026, 9, 19, 0, 1).getTime();

beforeEach(() => localStorage.clear());

describe('receipt counter', () => {
  it('starts each day at 1 and counts up with every print', () => {
    expect(nextReceiptNumber(morning)).toBe(1);
    recordReceiptPrinted(1, morning);
    recordReceiptPrinted(2, evening);
    expect(nextReceiptNumber(evening)).toBe(3);
  });
  it('starts over after midnight', () => {
    recordReceiptPrinted(1, morning);
    recordReceiptPrinted(2, evening);
    expect(nextReceiptNumber(nextDay)).toBe(1);
    recordReceiptPrinted(1, nextDay);
    expect(nextReceiptNumber(nextDay)).toBe(2);
  });
  it('never moves backwards when an older number is recorded', () => {
    recordReceiptPrinted(5, morning);
    recordReceiptPrinted(3, morning);
    expect(nextReceiptNumber(morning)).toBe(6);
  });
  it('treats unreadable storage as no prints yet', () => {
    localStorage.setItem(RECEIPT_COUNTER_KEY, '{oops');
    expect(nextReceiptNumber(morning)).toBe(1);
  });
  it('pads to three digits', () => {
    expect(formatReceiptNumber(7)).toBe('007');
    expect(formatReceiptNumber(1234)).toBe('1234');
  });
});
