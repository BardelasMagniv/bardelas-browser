export interface ProxyDict {
  server: string;
  username?: string;
  password?: string;
  bypass?: string;
}

export interface ProxyConfig {
  proxyOption?: ProxyDict;
  proxyArgs: string[];
}

export function ensureProxyScheme(proxyUrl: string): string {
  return proxyUrl.includes('://') ? proxyUrl : `http://${proxyUrl}`;
}

export function isSocksProxy(proxy?: string | ProxyDict): boolean {
  if (!proxy) return false;
  const url = typeof proxy === 'string' ? proxy : proxy.server;
  return /^socks5h?:\/\//i.test(url);
}

function assembleSocksUrl(scheme: string, encUser: string, encPass: string | null, hostAndRest: string) {
  let userinfo;
  if (encPass !== null) {
    userinfo = `${encUser}:${encPass}@`;
  } else if (encUser) {
    userinfo = `${encUser}@`;
  } else {
    userinfo = '';
  }
  return `${scheme}://${userinfo}${hostAndRest}`;
}

export function reconstructSocksUrl(proxy: ProxyDict): string {
  const url = new URL(proxy.server);
  if (proxy.username) {
    url.username = encodeURIComponent(proxy.username);
    if (proxy.password) {
      url.password = encodeURIComponent(proxy.password);
    }
  }
  return url.href.replace(/\/$/, '');
}

function lenientDecodeURIComponent(s: string): string {
  return s.replace(/%([0-9A-Fa-f]{2})|%/g, (match, hex) =>
    hex ? String.fromCharCode(parseInt(hex, 16)) : '%'
  );
}

export function normalizeSocksStringUrl(urlStr: string): string {
  const schemeMatch = urlStr.match(/^([a-z][a-z0-9+\-.]*):\/\/(.*)$/i);
  if (!schemeMatch) return urlStr;
  const [, scheme, rest] = schemeMatch;
  const hostStart = rest.search(/[/?#]/);
  const authority = hostStart === -1 ? rest : rest.slice(0, hostStart);
  const suffix = hostStart === -1 ? '' : rest.slice(hostStart);
  const atIdx = authority.lastIndexOf('@');
  if (atIdx === -1) return urlStr;
  const userinfo = authority.slice(0, atIdx);
  const hostPart = authority.slice(atIdx + 1);
  const bracketEnd = hostPart.lastIndexOf(']');
  const portColonIdx = hostPart.indexOf(':', Math.max(bracketEnd, 0));
  if (portColonIdx !== -1) {
    const portStr = hostPart.slice(portColonIdx + 1);
    if (portStr && !/^\d+$/.test(portStr)) {
      console.warn('[ProxyHelper] Malformed SOCKS5 proxy URL, passing through unchanged: invalid port');
      return urlStr;
    }
  }
  const hostAndRest = hostPart + suffix;
  const colonIdx = userinfo.indexOf(':');
  const rawUserEnc = colonIdx === -1 ? userinfo : userinfo.slice(0, colonIdx);
  const hasPassword = colonIdx !== -1;
  const rawPassEnc = hasPassword ? userinfo.slice(colonIdx + 1) : '';
  try {
    const encUser = rawUserEnc ? encodeURIComponent(lenientDecodeURIComponent(rawUserEnc)) : '';
    const encPass = hasPassword
      ? rawPassEnc
        ? encodeURIComponent(lenientDecodeURIComponent(rawPassEnc))
        : ''
      : null;
    return assembleSocksUrl(scheme, encUser, encPass, hostAndRest);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[ProxyHelper] Could not normalize SOCKS5 proxy URL, passing through unchanged: ${message}`);
    return urlStr;
  }
}

export function parseProxyUrl(proxy: string): ProxyDict {
  let url: URL;
  const normalized = proxy.includes('@') && !proxy.includes('://') ? `http://${proxy}` : proxy;
  try {
    url = new URL(normalized);
  } catch {
    return { server: proxy };
  }
  if (!url.username) {
    return { server: proxy };
  }
  const server = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
  const result: ProxyDict = {
    server,
    username: decodeURIComponent(url.username),
  };
  if (url.password) {
    result.password = decodeURIComponent(url.password);
  }
  return result;
}

export function resolveProxyConfig(proxy?: string | ProxyDict): ProxyConfig {
  if (!proxy) return { proxyArgs: [] };
  if (isSocksProxy(proxy)) {
    if (typeof proxy === 'string') {
      const url = normalizeSocksStringUrl(proxy);
      return {
        proxyOption: parseProxyUrl(url),
        proxyArgs: [`--proxy-server=${url}`],
      };
    }
    const socksUrl = reconstructSocksUrl(proxy);
    const args = [`--proxy-server=${socksUrl}`];
    if (proxy.bypass) args.push(`--proxy-bypass-list=${proxy.bypass}`);
    return {
      proxyOption: {
        server: socksUrl,
        username: proxy.username,
        password: proxy.password,
        bypass: proxy.bypass,
      },
      proxyArgs: args,
    };
  }
  if (typeof proxy === 'string') {
    return { proxyOption: parseProxyUrl(proxy), proxyArgs: [] };
  }
  return { proxyOption: proxy, proxyArgs: [] };
}
