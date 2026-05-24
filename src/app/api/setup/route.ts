import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword, signSession, setSessionCookie } from '@/lib/auth';
import { querySetupComplete } from '@/lib/setup';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const done = await querySetupComplete();
    return NextResponse.json({ setupComplete: done });
  } catch {
    return NextResponse.json(
      { setupComplete: false, error: 'Database unavailable' },
      { status: 503 }
    );
  }
}

const schema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/, 'Invalid username'),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  let alreadySetup: boolean;
  try {
    alreadySetup = await querySetupComplete();
  } catch {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }
  if (alreadySetup) {
    return NextResponse.json(
      { error: 'Setup already completed. Admin already exists.' },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const username = parsed.data.username.toLowerCase();

  const stmt = db.prepare(`
    INSERT INTO User (username, passwordHash, role)
    VALUES (?, ?, 'admin')
  `);
  const result = stmt.run(username, passwordHash);
  const userId = result.lastInsertRowid.toString();

  const token = await signSession({
    sub: userId,
    username,
    role: 'admin',
  });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, username });
}
