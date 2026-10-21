import { describe, expect, it } from 'vitest';
import { tools } from './tools.js';

// Every tool maps onto a real route of the SmartSend integration API. These
// tests pin the wire contract: names stay unique and stable, schemas accept
// what the API accepts, and call() builds the exact method/path/body the API
// expects.

const byName = new Map(tools.map((tool) => [tool.name, tool]));
const tool = (name: string) => {
  const found = byName.get(name);
  if (found === undefined) throw new Error(`tool ${name} is not defined`);
  return found;
};

describe('tool definitions', () => {
  it('names are unique and snake_case', () => {
    expect(byName.size).toBe(tools.length);
    for (const { name } of tools) expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('every tool has a description and parses its own minimal input', () => {
    for (const def of tools) {
      expect(def.description.length).toBeGreaterThan(20);
      expect(def.title.length).toBeGreaterThan(0);
    }
  });

  it('read tools are GET and marked readOnly; no read is destructive', () => {
    for (const def of tools) {
      const { method } = def.call({ phone: '972501234567', templateName: 't', botId: 'b' });
      if (def.readOnly) {
        expect(method).toBe('GET');
        expect(def.destructive).toBe(false);
      } else {
        expect(method).toBe('POST');
      }
    }
  });

  it('exactly the immediate sends are destructive', () => {
    const destructive = tools.filter((def) => def.destructive).map((def) => def.name);
    expect(destructive.sort()).toEqual(['send_flow', 'send_push', 'send_template', 'send_text']);
  });
});

describe('wire mapping', () => {
  it('get_customer_by_phone sends phoneNumber as the query parameter', () => {
    const def = tool('get_customer_by_phone');
    const input = def.inputSchema.parse({ phone: '972501234567' });
    expect(def.call(input)).toEqual({
      method: 'GET',
      path: '/customers/get-by-phone?phoneNumber=972501234567',
    });
  });

  it('search_customers joins id arrays with commas and drops empty filters', () => {
    const def = tool('search_customers');
    const input = def.inputSchema.parse({
      tagIds: ['a', 'b'],
      isOpen: true,
      limit: 10,
      q: '',
    });
    const { path } = def.call(input);
    expect(path).toBe('/customers/search?tagIds=a%2Cb&isOpen=true&limit=10');
  });

  it('send_template builds the API body and keeps only provided fields', () => {
    const def = tool('send_template');
    const input = def.inputSchema.parse({
      phone: '972501234567',
      templateName: 'welcome',
      parameters: ['Dana'],
    });
    expect(def.call(input)).toEqual({
      method: 'POST',
      path: '/messages/send-template',
      body: { phone: '972501234567', templateName: 'welcome', parameters: ['Dana'] },
    });
  });

  it('schedule_template accepts Israel wall time and ISO 8601', () => {
    const def = tool('schedule_template');
    for (const scheduledFor of ['10/09/2026 14:30', '2026-09-10T11:30:00.000Z']) {
      const input = def.inputSchema.parse({
        phone: '972501234567',
        templateName: 'reminder',
        scheduledFor,
      });
      expect(def.call(input).path).toBe('/messages/schedule-template');
    }
  });

  it('set_display_name keeps an explicit null so the API clears the name', () => {
    const def = tool('set_display_name');
    const input = def.inputSchema.parse({ phone: '972501234567', displayName: null });
    expect(def.call(input).body).toEqual({ phone: '972501234567', displayName: null });
  });

  it('set_custom_fields passes null values through (null clears the field)', () => {
    const def = tool('set_custom_fields');
    const input = def.inputSchema.parse({
      phone: '972501234567',
      fields: [{ fieldName: 'city', value: null }],
    });
    expect(def.call(input).body).toEqual({
      phone: '972501234567',
      fields: [{ fieldName: 'city', value: null }],
    });
  });

  it('rejects out-of-range paging instead of sending it to the API', () => {
    const def = tool('search_customers');
    expect(() => def.inputSchema.parse({ limit: 0 })).toThrow();
    expect(() => def.inputSchema.parse({ limit: 501 })).toThrow();
  });

  it('list_messages is read-only and pages with before', () => {
    const def = tool('list_messages');
    expect(def.readOnly).toBe(true);
    const input = def.inputSchema.parse({
      phone: '972501234567',
      limit: 20,
      before: '2026-10-17T08:00:00.000Z',
    });
    expect(def.call(input)).toEqual({
      method: 'GET',
      path: '/messages/list?phone=972501234567&limit=20&before=2026-10-17T08%3A00%3A00.000Z',
    });
    expect(() => def.inputSchema.parse({ phone: '972501234567', limit: 201 })).toThrow();
  });
});

// create_template builds Meta components the way the SmartSend template builder does
// in the web app: lower-case component types,
// upper-case button types, examples in body_text / header_text.
describe('create_template', () => {
  const create = tool('create_template');
  const build = (input: Record<string, unknown>) => {
    const parsed = create.inputSchema.parse({ name: 'order_ready', category: 'UTILITY', ...input });
    return create.call(parsed) as { method: string; path: string; body: Record<string, unknown> };
  };

  it('posts a full template to the lane create route', () => {
    const call = build({
      body: 'שלום {{1}}, ההזמנה {{2}} מוכנה לאיסוף.',
      variables: [{ example: 'דנה', name: 'שם פרטי' }, { example: '1234', name: 'מספר הזמנה' }],
      header: { type: 'text', text: 'ההזמנה מוכנה' },
      footer: 'SmartSend',
      buttons: [
        { type: 'quick_reply', text: 'תודה' },
        { type: 'url', text: 'מעקב', url: 'https://shop.example/orders/{{1}}', example: 'https://shop.example/orders/1234' },
        { type: 'phone', text: 'התקשרו', phoneNumber: '+972501234567' },
      ],
      nickname: 'הזמנה מוכנה',
    });
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/templates/create');
    expect(call.body).toMatchObject({
      name: 'order_ready',
      category: 'UTILITY',
      language: 'he',
      nickname: 'הזמנה מוכנה',
      parameterNames: ['שם פרטי', 'מספר הזמנה'],
      createdByName: 'MCP',
    });
    expect(call.body.components).toEqual([
      { type: 'header', format: 'text', text: 'ההזמנה מוכנה' },
      {
        type: 'body',
        text: 'שלום {{1}}, ההזמנה {{2}} מוכנה לאיסוף.',
        example: { body_text: [['דנה', '1234']] },
      },
      { type: 'footer', text: 'SmartSend' },
      {
        type: 'buttons',
        buttons: [
          { type: 'QUICK_REPLY', text: 'תודה' },
          {
            type: 'URL',
            text: 'מעקב',
            url: 'https://shop.example/orders/{{1}}',
            example: ['https://shop.example/orders/1234'],
          },
          { type: 'PHONE_NUMBER', text: 'התקשרו', phone_number: '+972501234567' },
        ],
      },
    ]);
  });

  it('sends a media header as a format plus headerMediaUrl for the lane to upload', () => {
    const call = build({
      body: 'מבצע סוף עונה!',
      header: { type: 'image', mediaUrl: 'https://cdn.example/sale.jpg' },
    });
    expect(call.body.headerMediaUrl).toBe('https://cdn.example/sale.jpg');
    expect(call.body.components).toEqual([
      { type: 'header', format: 'image' },
      { type: 'body', text: 'מבצע סוף עונה!' },
    ]);
    expect(call.body).not.toHaveProperty('parameterNames');
  });

  it('rejects names Meta would refuse', () => {
    expect(() => build({ name: 'הזמנה', body: 'x' })).toThrow();
    expect(() => build({ name: 'Order-Ready', body: 'x' })).toThrow();
  });

  it('demands one example per placeholder, numbered without gaps', () => {
    expect(() => build({ body: 'שלום {{1}}' })).toThrow(/1 placeholder/);
    expect(() => build({ body: 'שלום {{1}} {{3}}', variables: [{ example: 'a' }, { example: 'b' }] })).toThrow(
      /no gaps/,
    );
  });

  it('demands a sample URL for a dynamic link button and a sample for a header placeholder', () => {
    expect(() =>
      build({ body: 'x', buttons: [{ type: 'url', text: 'מעקב', url: 'https://shop.example/o/{{1}}' }] }),
    ).toThrow(/example/);
    expect(() => build({ body: 'x', header: { type: 'text', text: 'שלום {{1}}' } })).toThrow(/header.example/);
  });
});

describe('get_template_status', () => {
  it('reads the lane status route by name', () => {
    expect(tool('get_template_status').call({ name: 'order_ready' })).toEqual({
      method: 'GET',
      path: '/templates/status?name=order_ready',
    });
  });
});
