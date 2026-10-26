import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const dbFile = path.join(root, 'prisma', 'seed-check.db');
const env = { ...process.env, DATABASE_URL: 'file:./seed-check.db' };
const run = (cmd: string) => execSync(cmd, { cwd: root, env, stdio: 'pipe', encoding: 'utf-8' });

const cleanup = () => {
  for (const f of [dbFile, `${dbFile}-journal`]) if (fs.existsSync(f)) fs.rmSync(f);
};

describe('נתוני הדגמה על מסד נתונים ריק (כמו בפריסה חדשה)', () => {
  afterAll(cleanup);

  it('המיגרציות והסידינג עוברים על מסד ריק, והרצה חוזרת לא משכפלת', () => {
    cleanup();
    run('npx prisma migrate deploy');
    const first = run('npx tsx prisma/seed.ts');
    const second = run('npx tsx prisma/seed.ts');
    expect(first).toContain('Seed complete');
    // אותם סכומים בהרצה השנייה: אין כפילויות
    expect(second.match(/Seed complete:.*/)?.[0]).toBe(first.match(/Seed complete:.*/)?.[0]);
  }, 180_000);
});
