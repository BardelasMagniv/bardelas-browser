import type { Profile } from '../../shared/types';
import Database from 'better-sqlite3';
import { createDatabase } from './schema';

export class ProfileRepository {
  private db: Database.Database;

  constructor() {
    this.db = createDatabase();
  }

  list(): Profile[] {
    const rows = this.db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all();
    return rows.map((row: any) => this.mapRow(row));
  }

  findById(id: string): Profile | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
    return row ? this.mapRow(row) : null;
  }

  create(profile: Profile): Profile {
    const stmt = this.db.prepare(`INSERT INTO profiles (
      id, name, type, country, created_at, last_used_at, fingerprint_seed,
      fingerprint_platform, fingerprint_hardware_concurrency, fingerprint_device_memory,
      fingerprint_screen_width, fingerprint_screen_height, fingerprint_brand, browser_language,
      proxy_host, proxy_port, proxy_username, proxy_password, proxy_protocol,
      proxy_session_type, user_data_dir, extra_args
    ) VALUES (@id, @name, @type, @country, @createdAt, @lastUsedAt, @fingerprintSeed,
      @fingerprintPlatform, @fingerprintHardwareConcurrency, @fingerprintDeviceMemory,
      @fingerprintScreenWidth, @fingerprintScreenHeight, @fingerprintBrand, @browserLanguage,
      @proxyHost, @proxyPort, @proxyUsername, @proxyPassword, @proxyProtocol,
      @proxySessionType, @userDataDir, @extraArgs)`);
    stmt.run(this.toDbRow(profile));
    return profile;
  }

  update(profile: Profile): Profile {
    const stmt = this.db.prepare(`UPDATE profiles SET
      name = @name,
      type = @type,
      country = @country,
      last_used_at = @lastUsedAt,
      fingerprint_seed = @fingerprintSeed,
      fingerprint_platform = @fingerprintPlatform,
      fingerprint_hardware_concurrency = @fingerprintHardwareConcurrency,
      fingerprint_device_memory = @fingerprintDeviceMemory,
      fingerprint_screen_width = @fingerprintScreenWidth,
      fingerprint_screen_height = @fingerprintScreenHeight,
      fingerprint_brand = @fingerprintBrand,
      browser_language = @browserLanguage,
      proxy_host = @proxyHost,
      proxy_port = @proxyPort,
      proxy_username = @proxyUsername,
      proxy_password = @proxyPassword,
      proxy_protocol = @proxyProtocol,
      proxy_session_type = @proxySessionType,
      user_data_dir = @userDataDir,
      extra_args = @extraArgs
      WHERE id = @id`);
    stmt.run(this.toDbRow(profile));
    return profile;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
  }

  private mapRow(row: any): Profile {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      country: row.country,
      createdAt: Number(row.created_at),
      lastUsedAt: row.last_used_at ? Number(row.last_used_at) : undefined,
      fingerprintSeed: Number(row.fingerprint_seed),
      fingerprintPlatform: row.fingerprint_platform,
      fingerprintHardwareConcurrency: row.fingerprint_hardware_concurrency ?? undefined,
      fingerprintDeviceMemory: row.fingerprint_device_memory ?? undefined,
      fingerprintScreenWidth: row.fingerprint_screen_width ?? undefined,
      fingerprintScreenHeight: row.fingerprint_screen_height ?? undefined,
      fingerprintBrand: 'Chrome',
      proxyHost: row.proxy_host ?? undefined,
      proxyPort: row.proxy_port ?? undefined,
      proxyUsername: row.proxy_username ?? undefined,
      proxyPassword: row.proxy_password ?? undefined,
      proxyProtocol: row.proxy_protocol ?? undefined,
      proxySessionType: row.proxy_session_type ?? undefined,
      userDataDir: row.user_data_dir ?? undefined,
      browserLanguage: row.browser_language ?? 'en-US',
      extraArgs: this.parseExtraArgs(row.extra_args),
    };
  }

  private parseExtraArgs(value: unknown): string[] | undefined {
    if (value == null) {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value.map((item) => String(item)).filter(Boolean);
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item)).filter(Boolean);
        }
      } catch {
        // Ignore parse failure and fall back to plain string splitting.
      }

      return trimmed
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return undefined;
  }

  private toDbRow(profile: Profile): Record<string, unknown> {
    return {
      id: profile.id,
      name: profile.name,
      type: profile.type,
      country: profile.country,
      createdAt: profile.createdAt,
      lastUsedAt: profile.lastUsedAt ?? null,
      fingerprintSeed: profile.fingerprintSeed,
      fingerprintPlatform: profile.fingerprintPlatform,
      fingerprintHardwareConcurrency: profile.fingerprintHardwareConcurrency ?? null,
      fingerprintDeviceMemory: profile.fingerprintDeviceMemory ?? null,
      fingerprintScreenWidth: profile.fingerprintScreenWidth ?? null,
      fingerprintScreenHeight: profile.fingerprintScreenHeight ?? null,
      fingerprintBrand: 'Chrome',
      proxyHost: profile.proxyHost ?? null,
      proxyPort: profile.proxyPort ?? null,
      proxyUsername: profile.proxyUsername ?? null,
      proxyPassword: profile.proxyPassword ?? null,
      proxyProtocol: profile.proxyProtocol ?? null,
      proxySessionType: profile.proxySessionType ?? null,
      userDataDir: profile.userDataDir ?? null,
      browserLanguage: profile.browserLanguage ?? 'en-US',
      extraArgs: profile.extraArgs ? JSON.stringify(profile.extraArgs) : null,
    };
  }
}
