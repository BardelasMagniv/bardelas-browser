import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

export function createDatabase() {
  const userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Bardelas');
  fs.mkdirSync(userDataPath, { recursive: true });
  const dbPath = path.join(userDataPath, 'bardelas.db');
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('persistent','incognito')),
      country TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      fingerprint_seed INTEGER NOT NULL,
      fingerprint_platform TEXT NOT NULL,
      fingerprint_hardware_concurrency INTEGER,
      fingerprint_device_memory INTEGER,
      fingerprint_screen_width INTEGER,
      fingerprint_screen_height INTEGER,
      fingerprint_brand TEXT,
      browser_language TEXT DEFAULT 'en-US',
      proxy_host TEXT,
      proxy_port INTEGER,
      proxy_username TEXT,
      proxy_password TEXT,
      proxy_protocol TEXT DEFAULT 'socks5',
      proxy_session_type TEXT,
      user_data_dir TEXT,
      extra_args TEXT
    );
  `);

  const profileColumns = db.prepare('PRAGMA table_info(profiles)').all();
  const hasBrowserLanguage = profileColumns.some((column: any) => column.name === 'browser_language');
  if (!hasBrowserLanguage) {
    db.exec(`ALTER TABLE profiles ADD COLUMN browser_language TEXT DEFAULT 'en-US'`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}
