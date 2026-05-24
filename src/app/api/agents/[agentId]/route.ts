import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSessionFromCookies } from '@/lib/auth';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { agentId: string };
}

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agent = db.prepare('SELECT * FROM Agent WHERE agentId = ?').get(params.agentId) as any;
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const latest = db.prepare('SELECT * FROM Metric WHERE agentId = ? ORDER BY ts DESC LIMIT 1').get(params.agentId) as any;

  const offlineMs = env.AGENT_OFFLINE_AFTER_SECONDS * 1000;
  const online =
    agent.lastSeenAt && Date.now() - new Date(agent.lastSeenAt).getTime() <= offlineMs;

  let parsedTags: string[] = [];
  try {
    parsedTags = JSON.parse(agent.tags || '[]');
  } catch {
    parsedTags = [];
  }

  let parsedPm2: any[] = [];
  try {
    parsedPm2 = JSON.parse(agent.pm2 || '[]');
  } catch {
    parsedPm2 = [];
  }

  return NextResponse.json({
    agent: {
      agentId: agent.agentId,
      hostname: agent.hostname,
      label: agent.label,
      os: agent.os,
      osVersion: agent.osVersion,
      kernel: agent.kernel,
      arch: agent.arch,
      cpuModel: agent.cpuModel,
      cpuCores: agent.cpuCores,
      totalMemoryBytes: agent.totalMemoryBytes,
      totalDiskBytes: agent.totalDiskBytes,
      publicIp: agent.publicIp,
      privateIp: agent.privateIp,
      tags: parsedTags,
      pm2: parsedPm2,
      online,
      lastSeenAt: agent.lastSeenAt,
      registeredAt: agent.registeredAt,
      latest,
    },
  });
}

const patchSchema = z.object({
  label: z.string().max(64).optional(),
  tags: z.array(z.string().max(32)).max(20).optional(),
});

export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const agent = db.prepare('SELECT * FROM Agent WHERE agentId = ?').get(params.agentId) as any;
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: string[] = [];
  const paramsList: any[] = [];

  if (parsed.data.label !== undefined) {
    updates.push('label = ?');
    paramsList.push(parsed.data.label);
  }
  if (parsed.data.tags !== undefined) {
    updates.push('tags = ?');
    paramsList.push(JSON.stringify(parsed.data.tags));
  }

  if (updates.length > 0) {
    updates.push('updatedAt = CURRENT_TIMESTAMP');
    paramsList.push(params.agentId);
    db.prepare(`
      UPDATE Agent
      SET ${updates.join(', ')}
      WHERE agentId = ?
    `).run(...paramsList);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Delete Agent and their metrics explicitly (even though CASCADE is set up)
  db.prepare('DELETE FROM Agent WHERE agentId = ?').run(params.agentId);
  db.prepare('DELETE FROM Metric WHERE agentId = ?').run(params.agentId);

  return NextResponse.json({ ok: true });
}
