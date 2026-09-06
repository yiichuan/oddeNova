import { describe, expect, it } from 'vitest';
import { accountInitials, displayNameFromMetadata } from '../account-identity';

describe('displayNameFromMetadata', () => {
  it('reads the name Google leaves under either key', () => {
    expect(displayNameFromMetadata({ full_name: 'Ada Lovelace' })).toBe('Ada Lovelace');
    expect(displayNameFromMetadata({ name: 'Ada Lovelace' })).toBe('Ada Lovelace');
    expect(displayNameFromMetadata({ full_name: '  Ada  ', name: 'Other' })).toBe('Ada');
  });

  it('has nothing to read off an email sign-up', () => {
    expect(displayNameFromMetadata({ email_verified: true })).toBeNull();
    expect(displayNameFromMetadata({ full_name: '   ' })).toBeNull();
    expect(displayNameFromMetadata(null)).toBeNull();
  });
});

describe('accountInitials', () => {
  it('takes a named account down to first and last', () => {
    expect(accountInitials({ name: 'Ada Lovelace', email: 'ada@example.com' })).toBe('AL');
    expect(accountInitials({ name: 'ada byron lovelace', email: null })).toBe('AL');
  });

  it('gives a one-word name its own first two letters', () => {
    expect(accountInitials({ name: 'Ada', email: null })).toBe('AD');
  });

  it('keeps only the family name of a full-width script', () => {
    expect(accountInitials({ name: '陈奕川', email: null })).toBe('陈');
    expect(accountInitials({ name: '陈 奕川', email: null })).toBe('陈');
    expect(accountInitials({ name: '山田 太郎', email: null })).toBe('山');
  });

  it('falls back to the local part of an address', () => {
    expect(accountInitials({ email: 'yichuan@example.com' })).toBe('YI');
    expect(accountInitials({ name: null, email: 'j.doe@example.com' })).toBe('JD');
    expect(accountInitials({ email: 'air19950419@gmail.com' })).toBe('AI');
  });

  it('has no letters for nobody', () => {
    expect(accountInitials(null)).toBeNull();
    expect(accountInitials({ name: null, email: null })).toBeNull();
    expect(accountInitials({ email: '@example.com' })).toBeNull();
  });
});
