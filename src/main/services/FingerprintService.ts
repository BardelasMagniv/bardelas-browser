export interface FingerprintOptions {
  seed: number;
  platform: 'windows' | 'macos';
  hardwareConcurrency?: number;
  deviceMemory?: number;
  screenWidth?: number;
  screenHeight?: number;
  brand?: string;
  browserLanguage?: string;
}

export class FingerprintService {
  generateSeed(): number {
    return Math.floor(Math.random() * 90000) + 10000;
  }

  buildArgs(options: FingerprintOptions): string[] {
    const args = [`--fingerprint=${options.seed}`];

    if (options.platform) {
      args.push(`--fingerprint-platform=${options.platform}`);
    }

    if (options.hardwareConcurrency) {
      args.push(`--fingerprint-hardware-concurrency=${options.hardwareConcurrency}`);
    }
    if (options.deviceMemory) {
      args.push(`--fingerprint-device-memory=${options.deviceMemory}`);
    }
    if (options.screenWidth) {
      args.push(`--fingerprint-screen-width=${options.screenWidth}`);
    }
    if (options.screenHeight) {
      args.push(`--fingerprint-screen-height=${options.screenHeight}`);
    }
    if (options.brand) {
      args.push(`--fingerprint-brand=${options.brand}`);
    }
    if (options.browserLanguage) {
      args.push(`--lang=${options.browserLanguage}`);
    }

    return args;
  }
}
