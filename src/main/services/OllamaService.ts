import type { AiAgentSettings } from '../../shared/types';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaModelInfo {
  name: string;
  description?: string;
}

export class OllamaService {
  private readonly host: string;
  private readonly port: number;
  private readonly model: string;

  constructor(settings: AiAgentSettings = {}) {
    this.host = settings.ollamaHost?.trim() || '127.0.0.1';
    this.port = settings.ollamaPort ?? 11434;
    this.model = settings.modelName?.trim() || 'llama2';
  }

  private get baseUrl() {
    return `http://${this.host}:${this.port}`;
  }

  async createChatCompletion(messages: OllamaMessage[]) {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const controller = new AbortController();
    const timeoutMs = 60000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
        }),
        signal: controller.signal,
      });
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${timeoutMs / 1000} seconds.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Ollama request failed (${response.status}): ${text}`);
    }

    let body: any;
    try {
      body = JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid Ollama response: ${error instanceof Error ? error.message : String(error)} - ${text}`);
    }

    const firstChoice = body?.choices?.[0] ?? {};
    const content = firstChoice?.message?.content ?? firstChoice?.output?.[0]?.content ?? firstChoice?.output ?? '';
    return String(content ?? '').trim();
  }

  async listModels() {
    const url = `${this.baseUrl}/v1/models`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Ollama request failed (${response.status}): ${text}`);
    }

    let body: any;
    try {
      body = JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid Ollama response: ${error instanceof Error ? error.message : String(error)} - ${text}`);
    }

    let models: any[] = [];
    if (Array.isArray(body)) {
      models = body;
    } else if (Array.isArray(body?.models)) {
      models = body.models;
    } else if (Array.isArray(body?.data)) {
      models = body.data;
    }

    if (!Array.isArray(models)) {
      throw new Error('Unexpected Ollama models response format.');
    }

    return models
      .map((item: any) => String(item?.id ?? item?.name ?? item).trim())
      .filter((name: string) => name.length > 0);
  }
}
