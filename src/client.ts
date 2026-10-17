// Thin client over the Make/REST integration lane (/api/integrations/make).
//
// The lane answers with a {success, message, data} envelope and prose error
// messages ("template not found: X"), which is exactly what a model needs to
// recover on its own - so failures are passed through as text rather than
// being reshaped into codes.

// No /api prefix here: the smartsend-server ingress rewrites /(.*) to /api/$1,
// so the app-side /api/integrations/make is reached as /integrations/make.
const DEFAULT_BASE = 'https://smartsend-server.otherwise.co.il/integrations/make';

export type MakeEnvelope = {
  success: boolean;
  message?: string;
  data?: unknown;
};

export class SmartSendApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SmartSendApiError';
  }
}

export type ValidateResult = {
  organizationId: string;
  organizationName: string;
  whatsappConnected: boolean;
};

export type SmartSendClient = {
  request(method: string, path: string, body?: unknown): Promise<unknown>;
  validate(): Promise<ValidateResult>;
};

export function createSmartSendClient(config: {
  apiKey: string;
  baseUrl?: string;
}): SmartSendClient {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');

  const request = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          // The lane authenticates with this header; it carries an ss_live_
          // API key (Settings -> API keys in SmartSend).
          'x-organization-id': config.apiKey,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      throw new SmartSendApiError(
        `Could not reach the SmartSend API: ${error instanceof Error ? error.message : 'network error'}`,
        0,
      );
    }

    const text = await response.text();
    let payload: MakeEnvelope;
    try {
      payload = JSON.parse(text) as MakeEnvelope;
    } catch {
      throw new SmartSendApiError(
        `The SmartSend API returned an unexpected response (${response.status}): ${text.slice(0, 200)}`,
        response.status,
      );
    }

    if (!response.ok || payload.success === false) {
      throw new SmartSendApiError(
        payload.message ?? `Request failed (${response.status})`,
        response.status,
      );
    }
    return payload.data;
  };

  const validate = async (): Promise<ValidateResult> => {
    const data = (await request('GET', '/validate')) as Partial<ValidateResult> | undefined;
    return {
      organizationId: data?.organizationId ?? '',
      organizationName: data?.organizationName ?? 'unknown organization',
      whatsappConnected: data?.whatsappConnected ?? false,
    };
  };

  return { request, validate };
}
