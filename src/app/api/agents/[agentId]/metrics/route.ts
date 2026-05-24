import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookies } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { agentId: string };
}

export async function GET(req: Request, { params }: RouteContext) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const range = url.searchParams.get('range') ?? '1h';

  const now = Date.now();
  let fromMs = now - 60 * 60 * 1000;
  if (range === '6h') fromMs = now - 6 * 60 * 60 * 1000;
  else if (range === '24h') fromMs = now - 24 * 60 * 60 * 1000;
  else if (range === '7d') fromMs = now - 7 * 24 * 60 * 60 * 1000;

  const fromIso = new Date(fromMs).toISOString();
  const rows = db.prepare(`
    SELECT * FROM Metric
    WHERE agentId = ? AND ts >= ?
    ORDER BY ts ASC
    LIMIT 2000
  `).all(params.agentId, fromIso) as any[];

  const metrics = rows.map((m) => ({
    ts: m.ts,
    cpuPercent: m.cpuPercent,
    memUsedBytes: m.memUsedBytes,
    memTotalBytes: m.memTotalBytes,
    diskUsedBytes: m.diskUsedBytes,
    diskTotalBytes: m.diskTotalBytes,
    netRxBps: m.netRxBps,
    netTxBps: m.netTxBps,
    loadAvg1: m.loadAvg1,
    loadAvg5: m.loadAvg5,
    loadAvg15: m.loadAvg15,
  }));

  return NextResponse.json({ metrics });
}
