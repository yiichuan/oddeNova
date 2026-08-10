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

describe('account session schema', () => {
  it('persists optional revision, suggestion, and external-source state as validated jsonb', () => {
    const sql = allMigrationSql();

    expect(sql).toMatch(/add column if not exists revisions jsonb/);
    expect(sql).toMatch(/add column if not exists suggestions jsonb/);
    expect(sql).toMatch(/add column if not exists external_source jsonb/);
    expect(sql).toMatch(/jsonb_typeof\(revisions\) = 'array'/);
    expect(sql).toMatch(/jsonb_typeof\(suggestions\) = 'object'/);
    expect(sql).toMatch(/jsonb_typeof\(external_source\) = 'object'/);
  });
});
