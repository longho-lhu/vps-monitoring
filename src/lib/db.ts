import Database from 'better-sqlite3';
import path from 'path';
import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __betterSqliteInstance: Database.Database | undefined;
}

function getDatabasePath(): string {
  const dbPath = env.SQLITE_DB_PATH;
  if (path.isAbsolute(dbPath)) return dbPath;
  return path.join(process.cwd(), dbPath);
}

function initDB(): Database.Database {
  if (global.__betterSqliteInstance) {
    return global.__betterSqliteInstance;
  }

  const p = getDatabasePath();
  const db = new Database(p);
  
  // Enable Write-Ahead Logging (WAL) mode for better concurrency performance
  db.pragma('journal_mode = WAL');
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create tables if they do not exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS User (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Agent (
      agentId TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      hostname TEXT NOT NULL DEFAULT 'unknown',
      os TEXT NOT NULL DEFAULT 'unknown',
      osVersion TEXT NOT NULL DEFAULT '',
      kernel TEXT NOT NULL DEFAULT '',
      arch TEXT NOT NULL DEFAULT '',
      cpuModel TEXT NOT NULL DEFAULT '',
      cpuCores INTEGER NOT NULL DEFAULT 0,
      totalMemoryBytes INTEGER NOT NULL DEFAULT 0,
      totalDiskBytes INTEGER NOT NULL DEFAULT 0,
      publicIp TEXT,
      privateIp TEXT,
      tags TEXT NOT NULL DEFAULT '[]', -- JSON stringified array of strings
      pm2 TEXT NOT NULL DEFAULT '[]', -- JSON stringified array of PM2 processes
      label TEXT,
      lastSeenAt DATETIME,
      lastTelegramAlertAt DATETIME,
      registeredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Metric (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agentId TEXT NOT NULL,
      ts DATETIME NOT NULL,
      cpuPercent REAL NOT NULL DEFAULT 0,
      loadAvg1 REAL NOT NULL DEFAULT 0,
      loadAvg5 REAL NOT NULL DEFAULT 0,
      loadAvg15 REAL NOT NULL DEFAULT 0,
      memUsedBytes INTEGER NOT NULL DEFAULT 0,
      memTotalBytes INTEGER NOT NULL DEFAULT 0,
      swapUsedBytes INTEGER NOT NULL DEFAULT 0,
      swapTotalBytes INTEGER NOT NULL DEFAULT 0,
      diskUsedBytes INTEGER NOT NULL DEFAULT 0,
      diskTotalBytes INTEGER NOT NULL DEFAULT 0,
      netRxBytes INTEGER NOT NULL DEFAULT 0,
      netTxBytes INTEGER NOT NULL DEFAULT 0,
      netRxBps REAL NOT NULL DEFAULT 0,
      netTxBps REAL NOT NULL DEFAULT 0,
      uptimeSeconds INTEGER NOT NULL DEFAULT 0,
      processCount INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (agentId) REFERENCES Agent(agentId) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_metric_agent_ts ON Metric(agentId, ts DESC);

    CREATE TABLE IF NOT EXISTS AppSettings (
      singleton INTEGER PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
      telegramBotToken TEXT NOT NULL DEFAULT '',
      telegramChatId TEXT NOT NULL DEFAULT '',
      alertCpuPercent INTEGER NOT NULL DEFAULT 85 CHECK (alertCpuPercent BETWEEN 1 AND 100),
      alertRamPercent INTEGER NOT NULL DEFAULT 85 CHECK (alertRamPercent BETWEEN 1 AND 100),
      alertDiskPercent INTEGER NOT NULL DEFAULT 90 CHECK (alertDiskPercent BETWEEN 1 AND 100),
      telegramCooldownSeconds INTEGER NOT NULL DEFAULT 300 CHECK (telegramCooldownSeconds BETWEEN 60 AND 86400),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Dynamic migration for existing DB files without pm2 column
  try {
    db.prepare('SELECT pm2 FROM Agent LIMIT 1').get();
  } catch (e) {
    try {
      db.prepare("ALTER TABLE Agent ADD COLUMN pm2 TEXT NOT NULL DEFAULT '[]'").run();
    } catch (err: any) {
      if (err && err.message && err.message.includes('duplicate column name')) {
        // Silently ignore parallel build/execution race conditions
      } else {
        console.error('Failed to migrate SQLite database column pm2:', err);
      }
    }
  }

  global.__betterSqliteInstance = db;
  return db;
}

export const db = initDB();

// A helper function to align with the async connectDB signature
export async function connectDB() {
  return db;
}
