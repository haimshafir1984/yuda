import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/** יוצר מסד נתונים נפרד לבדיקות (prisma/test.db) ומחיל עליו את המיגרציות. */
export default function setup() {
  const dbFile = path.resolve(__dirname, '../prisma/test.db');
  for (const f of [dbFile, `${dbFile}-journal`]) if (fs.existsSync(f)) fs.rmSync(f);
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'pipe',
  });
}
