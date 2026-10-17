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
});
