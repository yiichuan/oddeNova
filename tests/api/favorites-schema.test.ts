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

describe('favorite schema', () => {
  it('stores private immutable snapshots with UUID ids and a stable cursor index', () => {
    const sql = allMigrationSql();

    expect(sql).toMatch(/create table if not exists public\.favorites/);
    expect(sql).toMatch(/id uuid primary key default gen_random_uuid\(\)/);
    expect(sql).toMatch(/user_id uuid not null references auth\.users\(id\) on delete cascade/);
    expect(sql).toMatch(/title text not null/);
    expect(sql).toMatch(/code text not null/);
    expect(sql).toMatch(/messages jsonb not null default '\[\]'::jsonb check \(jsonb_typeof\(messages\) = 'array'\)/);
    expect(sql).toMatch(/revisions jsonb check \(revisions is null or jsonb_typeof\(revisions\) = 'array'\)/);
    expect(sql).toMatch(/suggestions jsonb check \(suggestions is null or jsonb_typeof\(suggestions\) = 'object'\)/);
    expect(sql).toMatch(/input_mode text check \(input_mode is null or input_mode in \('normal', 'choice'\)\)/);
    expect(sql).not.toMatch(/content_hash/);
    expect(sql).not.toMatch(/unique \(user_id, content_hash\)/);
    expect(sql).toMatch(/create index if not exists favorites_user_created_id_idx on public\.favorites \(user_id, created_at desc, id desc\)/);
    expect(sql).toMatch(/alter table public\.favorites enable row level security/);
    expect(sql).toMatch(/grant select, insert, delete on public\.favorites to authenticated/);
    expect(sql).toMatch(/favorites_select_own/);
    expect(sql).toMatch(/favorites_insert_own/);
    expect(sql).toMatch(/favorites_delete_own/);
    expect(sql).toMatch(/grant select, insert, delete on public\.favorites to authenticated/);
  });
});
