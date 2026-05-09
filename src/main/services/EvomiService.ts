import type { ProxyCredentials } from '../../shared/types';

const EVOMI_ENDPOINT = 'https://api.evomi.com/public/generate';

export class EvomiService {
  constructor(private apiKey: string) {}

  setApiKey(value: string) {
    this.apiKey = value;
  }

  private async wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async generateProxy(country: string, persistent: boolean, retries = 3, retryDelayMs = 800): Promise<ProxyCredentials> {
    if (!this.apiKey) {
      throw new Error('Evomi API key is not configured.');
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const url = new URL(EVOMI_ENDPOINT);
        url.searchParams.set('product', 'rpc');
        url.searchParams.set('countries', country);
        url.searchParams.set('protocol', 'socks5');
        url.searchParams.set('format', '2');
        url.searchParams.set('amount', '1');
        if (persistent) {
          url.searchParams.set('session', 'hard');
        }
        url.searchParams.set('apikey', this.apiKey);

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Accept: 'text/plain',
          },
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Evomi proxy generation failed: ${response.status} ${body}`);
        }

        const text = await response.text();
        const line = text.split(/\r?\n/).find(Boolean)?.trim();
        if (!line) {
          throw new Error('Evomi returned an empty proxy response.');
        }

        let host: string;
        let portText: string;
        let username: string;
        let password: string;
        let passwordParts: string[] = [];

        const withProtocolMatch = line.match(/^(?<proto>[^:]+):\/\/(?<host>[^:]+):(?<port>\d+):(?<user>[^:]+):(?<pass>.+)$/);
        if (withProtocolMatch?.groups) {
          host = withProtocolMatch.groups.host;
          portText = withProtocolMatch.groups.port;
          username = withProtocolMatch.groups.user;
          password = withProtocolMatch.groups.pass;
        } else {
          const segments = line.split(':');
          if (segments.length < 4) {
            throw new Error(`Unexpected Evomi proxy format: ${line}`);
          }
          [host, portText, username, ...passwordParts] = segments;
          password = passwordParts.join(':');
        }

        const port = Number(portText);
        if (!host || Number.isNaN(port) || !username || !password) {
          throw new Error(`Invalid proxy credentials from Evomi: ${line}`);
        }

        return {
          host,
          port,
          username,
          password,
          protocol: 'socks5',
        };
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await this.wait(retryDelayMs * attempt);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }
}
