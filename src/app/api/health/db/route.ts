import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeErr(err: unknown): { name: string; message: string } {
  if (!err || typeof err !== 'object') {
    return { name: 'Error', message: 'Unknown error' };
  }
  const e = err as { name?: string; message?: string };
  return {
    name: String(e.name ?? 'Error'),
    message: String(e.message ?? 'error').slice(0, 800),
  };
}

export async function GET() {
  try {
    const row = db.prepare('SELECT 1 as ping').get() as { ping: number } | undefined;
    if (row?.ping !== 1) throw new Error('Database ping failed');
    
    return NextResponse.json({
      ok: true,
      database: 'SQLite',
    });
  } catch (err) {
    const s = safeErr(err);
    return NextResponse.json(
      {
        ok: false,
        error: s,
      },
      { status: 503 }
    );
  }
}
