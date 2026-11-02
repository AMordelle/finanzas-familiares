import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'db/migrations/0015_atomic_movement_mutations.sql'),
  'utf8'
);

describe('atomic movement migration', () => {
  it('defines invoker functions and limits execution to the service role', () => {
    expect(migration).toContain('FUNCTION public.update_movement_atomic');
    expect(migration).toContain('FUNCTION public.delete_movement_atomic');
    expect(migration.match(/SECURITY INVOKER/g)).toHaveLength(2);
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration.match(/TO service_role/g)).toHaveLength(2);
    expect(migration).not.toContain('SECURITY DEFINER');
  });

  it('locks affected rows and applies relative balance changes', () => {
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('SET balance = account.balance + delta.delta');
    expect(migration).toContain("RAISE EXCEPTION 'movement_changed'");
  });
});
