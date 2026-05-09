export type ProfileType = 'persistent' | 'incognito';

export interface Profile {
  id: string;
  name: string;
  type: ProfileType;
  country: string;
  createdAt: number;
  lastUsedAt?: number;
  fingerprintSeed: number;
  fingerprintPlatform: string;
  fingerprintHardwareConcurrency?: number;
  fingerprintDeviceMemory?: number;
  fingerprintScreenWidth?: number;
  fingerprintScreenHeight?: number;
  fingerprintBrand: 'Chrome';
  browserLanguage?: string;
  proxyHost?: string;
  proxyPort?: number;
  proxyUsername?: string;
  proxyPassword?: string;
  proxyProtocol?: 'socks5' | 'http';
  proxySessionType?: 'hard' | null;
  userDataDir?: string;
  extraArgs?: string[];
}

export interface ProxyCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  protocol: 'socks5' | 'http';
}

export interface MirrorConfig {
  id: string;
  country: string;
  useRandomIdentity: boolean;
}

export type MirrorInputEventType = 'click' | 'scroll' | 'keydown' | 'keyup';

export interface MirrorInputEvent {
  type: MirrorInputEventType;
  x?: number;
  y?: number;
  button?: number;
  key?: string;
  deltaY?: number;
}

export interface BrowserEvent {
  type: 'profile-launched' | 'profile-stopped' | 'mirror-started' | 'mirror-stopped' | 'error';
  payload: Record<string, unknown>;
}

export interface SettingsPayload {
  evomiApiKey: string;
  mirrorMode?: 'default' | 'playwright';
  geoSpoofMode?: 'cloakbrowser' | 'custom';
  aiOllamaHost?: string;
  aiOllamaPort?: number;
  aiModelName?: string;
  aiOcrEnabled?: boolean;
}

export type AiAgentActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'fill'
  | 'wait'
  | 'screenshot'
  | 'readText'
  | 'captureDom';

export interface AiAgentAction {
  type: AiAgentActionType;
  url?: string;
  selector?: string;
  x?: number;
  y?: number;
  button?: 'left' | 'right';
  text?: string;
  timeoutMs?: number;
}

export interface AiAgentActionResult {
  action: AiAgentAction;
  status: 'success' | 'failure';
  result?: unknown;
  error?: string;
}

export interface AiAgentSessionHistoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface AiAgentSession {
  id: string;
  profileId: string;
  status: 'idle' | 'running' | 'stopped' | 'error';
  lastUpdated: number;
  history: AiAgentSessionHistoryEntry[];
}

export interface AiAgentResponse {
  success: boolean;
  message: string;
  actions: AiAgentActionResult[];
  rawOutput: string;
  reprompt?: string;
}

export interface AiAgentSettings {
  ollamaHost?: string;
  ollamaPort?: number;
  modelName?: string;
  enableOcr?: boolean;
}
