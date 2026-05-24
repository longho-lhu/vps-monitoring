import { NextResponse } from 'next/server';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  agentId: z.string().min(8).max(64).optional(),
  hostname: z.string().max(255).default('unknown'),
  os: z.string().max(64).default('unknown'),
  osVersion: z.string().max(128).default(''),
  kernel: z.string().max(128).default(''),
  arch: z.string().max(32).default(''),
  cpuModel: z.string().max(255).default(''),
  cpuCores: z.number().int().min(0).max(4096).default(0),
  totalMemoryBytes: z.number().min(0).default(0),
  totalDiskBytes: z.number().min(0).default(0),
  publicIp: z.string().max(64).optional(),
  privateIp: z.string().max(64).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let agentId = parsed.data.agentId;
  let agent: any = null;

  if (agentId) {
    agent = db.prepare('SELECT * FROM Agent WHERE agentId = ?').get(agentId);
  }

  if (agent) {
    db.prepare(`
      UPDATE Agent
      SET hostname = ?,
          os = ?,
          osVersion = ?,
          kernel = ?,
          arch = ?,
          cpuModel = ?,
          cpuCores = ?,
          totalMemoryBytes = ?,
          totalDiskBytes = ?,
          publicIp = ?,
          privateIp = ?,
          updatedAt = CURRENT_TIMESTAMP
      WHERE agentId = ?
    `).run(
      parsed.data.hostname,
      parsed.data.os,
      parsed.data.osVersion,
      parsed.data.kernel,
      parsed.data.arch,
      parsed.data.cpuModel,
      parsed.data.cpuCores,
      parsed.data.totalMemoryBytes,
      parsed.data.totalDiskBytes,
      parsed.data.publicIp || null,
      parsed.data.privateIp || null,
      agentId
    );

    return NextResponse.json({
      ok: true,
      agentId: agent.agentId,
      token: agent.token,
      reused: true,
    });
  }

  const newAgentId = agentId ?? `vps_${nanoid(16)}`;
  const token = `tok_${nanoid(40)}`;

  db.prepare(`
    INSERT INTO Agent (
      agentId, token, hostname, os, osVersion, kernel, arch,
      cpuModel, cpuCores, totalMemoryBytes, totalDiskBytes, publicIp, privateIp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newAgentId,
    token,
    parsed.data.hostname,
    parsed.data.os,
    parsed.data.osVersion,
    parsed.data.kernel,
    parsed.data.arch,
    parsed.data.cpuModel,
    parsed.data.cpuCores,
    parsed.data.totalMemoryBytes,
    parsed.data.totalDiskBytes,
    parsed.data.publicIp || null,
    parsed.data.privateIp || null
  );

  return NextResponse.json({ ok: true, agentId: newAgentId, token, reused: false });
}
