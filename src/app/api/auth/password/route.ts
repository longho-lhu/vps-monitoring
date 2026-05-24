import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSessionFromCookies, hashPassword, verifyPassword } from '@/lib/auth';

export const runtime = 'nodejs';

const schema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const user = db.prepare('SELECT * FROM User WHERE id = ?').get(session.sub) as any;
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const ok = await verifyPassword(parsed.data.oldPassword, user.passwordHash);
  if (!ok) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });

  const newHash = await hashPassword(parsed.data.newPassword);
  db.prepare('UPDATE User SET passwordHash = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, session.sub);

  return NextResponse.json({ ok: true });
}
