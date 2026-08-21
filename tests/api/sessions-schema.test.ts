import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function allMigrationSql(): string {
  const migrationDir = join(process.cwd(), 'supabase', 'migrations');
  return readdirSync(migrationDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(migrationDir, name), 'utf8'))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function migrationSql(name: string): string {
  return readFileSync(
    join(process.cwd(), 'supabase', 'migrations', name),
    'utf8',
  ).replace(/\s+/g, ' ').toLowerCase();
}

describe('account session schema', () => {
  it('uses the UUID id as the only session entity identifier and omits token stats', () => {
    const sql = migrationSql('20260707000000_account_sessions.sql');

    expect(sql).toMatch(/create table if not exists public\.sessions/);
    expect(sql).toMatch(/id uuid primary key default gen_random_uuid\(\)/);
    expect(sql).not.toMatch(/session_id/);
    expect(sql).not.toMatch(/token_stats/);
    expect(sql).toMatch(/input_mode text check \(input_mode is null or input_mode in \('normal', 'choice'\)\)/);
    expect(sql).not.toMatch(/unique \(user_id, session_id\)/);
  });

  it('persists optional revision, suggestion, and external-source state as validated jsonb', () => {
    const sql = allMigrationSql();

    expect(sql).toMatch(/add column if not exists revisions jsonb/);
    expect(sql).toMatch(/add column if not exists suggestions jsonb/);
    expect(sql).toMatch(/add column if not exists external_source jsonb/);
    expect(sql).toMatch(/jsonb_typeof\(revisions\) = 'array'/);
    expect(sql).toMatch(/jsonb_typeof\(suggestions\) = 'object'/);
    expect(sql).toMatch(/jsonb_typeof\(external_source\) = 'object'/);
  });

  it('ships a forward-compatible cleanup migration for already-applied session schemas', () => {
    const migrationPath = join(
      process.cwd(),
      'supabase',
      'migrations',
      '20260816000001_uuid_sessions_compat.sql',
    );
    const sql = readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();

    expect(sql).toMatch(/alter table public\.sessions add column if not exists input_mode/);
    expect(sql).toMatch(/drop constraint if exists sessions_user_id_session_id_key/);
    expect(sql).toMatch(/drop column if exists session_id/);
    expect(sql).toMatch(/drop column if exists token_stats/);
    expect(sql).toMatch(/create or replace function public\.set_updated_at/);
    expect(sql).toMatch(/return new/);
    expect(sql).not.toMatch(/new\.updated_at = now\(\)/);
  });
});
