import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSmartSendClient, SmartSendApiError } from './client.js';

const jsonResponse = (status: number, payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createSmartSendClient', () => {
  it('sends the API key in x-organization-id and unwraps the data envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { success: true, message: 'ok', data: { organizationName: 'Studio' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createSmartSendClient({ apiKey: 'ss_live_abc', baseUrl: 'https://api.test/make/' });
    const data = await client.request('GET', '/validate');

    expect(data).toEqual({ organizationName: 'Studio' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/make/validate');
    expect((init.headers as Record<string, string>)['x-organization-id']).toBe('ss_live_abc');
    expect(init.body).toBeUndefined();
  });

  it('surfaces the lane message verbatim on success:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(404, { success: false, message: 'template not found: welcome' }),
      ),
    );

    const client = createSmartSendClient({ apiKey: 'k' });
    await expect(client.request('POST', '/messages/send-template', {})).rejects.toThrow(
      'template not found: welcome',
    );
  });

  it('wraps non-JSON answers with the status and a snippet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 })),
    );

    const client = createSmartSendClient({ apiKey: 'k' });
    const error = await client.request('GET', '/validate').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SmartSendApiError);
    expect((error as SmartSendApiError).status).toBe(502);
    expect((error as SmartSendApiError).message).toContain('502');
  });

  it('reports network failures as reachability, not parsing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const client = createSmartSendClient({ apiKey: 'k' });
    await expect(client.request('GET', '/validate')).rejects.toThrow(
      'Could not reach the SmartSend API: ECONNREFUSED',
    );
  });
});
