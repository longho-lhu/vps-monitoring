import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { verifyPassword, signSession, setSessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';

const schema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(1).max(256),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const user = db.prepare('SELECT * FROM User WHERE username = ?').get(parsed.data.username.toLowerCase()) as any;
  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = await signSession({
    sub: user.id.toString(),
    username: user.username,
    role: 'admin',
  });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, username: user.username });
}
