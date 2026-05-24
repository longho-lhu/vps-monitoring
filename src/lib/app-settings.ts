import { db } from '@/lib/db';
import {
  sanitizeTelegramBotToken,
  sanitizeTelegramChatId,
  telegramGetMe,
  TelegramTokenRejectedError,
} from '@/lib/telegram-client';

export type ResolvedAppSettings = {
  telegramBotToken: string | undefined;
  telegramChatId: string | undefined;
  alertCpuPercent: number;
  alertRamPercent: number;
  alertDiskPercent: number;
  telegramCooldownSeconds: number;
};

const CACHE_TTL_MS = 5000;
let cache: { expiresAt: number; value: ResolvedAppSettings } | null = null;

function toResolved(doc: any): ResolvedAppSettings {
  const rawT = doc.telegramBotToken ?? '';
  const rawC = doc.telegramChatId ?? '';
  const token = rawT ? sanitizeTelegramBotToken(rawT) : '';
  const chat = rawC ? sanitizeTelegramChatId(rawC) : '';
  return {
    telegramBotToken: token || undefined,
    telegramChatId: chat || undefined,
    alertCpuPercent: doc.alertCpuPercent,
    alertRamPercent: doc.alertRamPercent,
    alertDiskPercent: doc.alertDiskPercent,
    telegramCooldownSeconds: doc.telegramCooldownSeconds,
  };
}

function loadDoc() {
  let doc = db.prepare('SELECT * FROM AppSettings WHERE singleton = 1').get() as any;
  if (doc) return doc;
  try {
    db.prepare('INSERT OR IGNORE INTO AppSettings (singleton) VALUES (1)').run();
    doc = db.prepare('SELECT * FROM AppSettings WHERE singleton = 1').get() as any;
    return doc;
  } catch (e: unknown) {
    const again = db.prepare('SELECT * FROM AppSettings WHERE singleton = 1').get() as any;
    if (again) return again;
    throw e;
  }
}

export function invalidateAppSettingsCache(): void {
  cache = null;
}

export async function getAppSettings(): Promise<ResolvedAppSettings> {
  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return cache.value;
  }
  const doc = loadDoc();
  const value = toResolved(doc);
  cache = { expiresAt: now + CACHE_TTL_MS, value };
  return value;
}

export type PublicAlertSettings = {
  botTokenConfigured: boolean;
  telegramChatId: string;
  alertCpuPercent: number;
  alertRamPercent: number;
  alertDiskPercent: number;
  telegramCooldownSeconds: number;
};

export async function getPublicAlertSettings(): Promise<PublicAlertSettings> {
  const doc = loadDoc();
  const r = toResolved(doc);
  return {
    botTokenConfigured: Boolean(r.telegramBotToken),
    telegramChatId: r.telegramChatId ?? '',
    alertCpuPercent: r.alertCpuPercent,
    alertRamPercent: r.alertRamPercent,
    alertDiskPercent: r.alertDiskPercent,
    telegramCooldownSeconds: r.telegramCooldownSeconds,
  };
}

export type UpdateAppSettingsInput = {
  telegramBotToken?: string;
  clearTelegramBotToken?: boolean;
  telegramChatId?: string;
  alertCpuPercent?: number;
  alertRamPercent?: number;
  alertDiskPercent?: number;
  telegramCooldownSeconds?: number;
};

export async function updateAppSettings(input: UpdateAppSettingsInput): Promise<PublicAlertSettings> {
  const doc = loadDoc();

  let telegramBotToken = doc.telegramBotToken;
  const newToken = input.telegramBotToken?.trim();
  if (newToken) {
    const clean = sanitizeTelegramBotToken(newToken);
    if (!clean.includes(':')) {
      throw new TelegramTokenRejectedError(
        'Token bot không đúng định dạng (cần dạng 123456789:AAH… từ @BotFather).'
      );
    }
    const me = await telegramGetMe(clean);
    if (!me.ok) {
      throw new TelegramTokenRejectedError(me.description);
    }
    telegramBotToken = clean;
  } else if (input.clearTelegramBotToken) {
    telegramBotToken = '';
  }

  let telegramChatId = doc.telegramChatId;
  if (input.telegramChatId !== undefined) {
    telegramChatId = sanitizeTelegramChatId(input.telegramChatId);
  }

  let alertCpuPercent = doc.alertCpuPercent;
  if (input.alertCpuPercent !== undefined) {
    alertCpuPercent = Math.max(1, Math.min(100, Math.round(input.alertCpuPercent)));
  }

  let alertRamPercent = doc.alertRamPercent;
  if (input.alertRamPercent !== undefined) {
    alertRamPercent = Math.max(1, Math.min(100, Math.round(input.alertRamPercent)));
  }

  let alertDiskPercent = doc.alertDiskPercent;
  if (input.alertDiskPercent !== undefined) {
    alertDiskPercent = Math.max(1, Math.min(100, Math.round(input.alertDiskPercent)));
  }

  let telegramCooldownSeconds = doc.telegramCooldownSeconds;
  if (input.telegramCooldownSeconds !== undefined) {
    const c = Math.round(input.telegramCooldownSeconds);
    telegramCooldownSeconds = Math.max(60, Math.min(86_400, c));
  }

  // Update in SQLite
  db.prepare(`
    UPDATE AppSettings
    SET telegramBotToken = ?,
        telegramChatId = ?,
        alertCpuPercent = ?,
        alertRamPercent = ?,
        alertDiskPercent = ?,
        telegramCooldownSeconds = ?,
        updatedAt = CURRENT_TIMESTAMP
    WHERE singleton = 1
  `).run(
    telegramBotToken,
    telegramChatId,
    alertCpuPercent,
    alertRamPercent,
    alertDiskPercent,
    telegramCooldownSeconds
  );

  invalidateAppSettingsCache();
  return getPublicAlertSettings();
}
