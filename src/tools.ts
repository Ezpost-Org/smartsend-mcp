// The tool surface exposed to a model - a 1:1 mapping onto the SmartSend
// integration API (the same endpoints the Make custom app uses), so the two
// surfaces can never drift apart: both speak the same semantics.
//
// Sending is this product's purpose - the API exists to message customers.
// Tools that put a message on a real person's phone are marked destructive
// so MCP clients can ask before running them; everything else is tagged
// read-only or left as a plain write.
//
// Deliberately not exposed:
//   - /messages/send-template-base64 and /uploads/sign - multipart file
//     uploads do not fit MCP text tools; pass a public headerMediaUrl instead
//   - /conversations/labels/set-bulk and /conversations/set-custom-field -
//     both are covered by the tag tools and set_custom_fields
//   - /rpc-options and /rpc/flag-colors - Make UI plumbing; the flag enum is
//     inlined in set_flag

import { z } from 'zod';

/** Input has passed the tool's own zod schema before `call` sees it. */
export type ToolInput = Record<string, unknown>;

export type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  /** True when the tool immediately reaches a real person's device. */
  destructive: boolean;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  /** Builds the HTTP call from already-validated input. */
  call: (input: ToolInput) => { method: string; path: string; body?: unknown };
};

const phone = z
  .string()
  .min(3)
  .describe('Customer phone in international format, e.g. 972501234567.');

const query = (params: Record<string, unknown>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.set(key, value.map(String).join(','));
      continue;
    }
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

/** Drop undefined values so bodies stay minimal and exactOptional-safe. */
const body = (input: ToolInput): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
};

export const tools: ToolDefinition[] = [
  // ----------------------------------------------------------------- reads
  {
    name: 'get_organization',
    title: 'Get the connected organization',
    description:
      'Verify the API key and return the connected SmartSend organization (id, name, and whether a WhatsApp number is connected). Start here to confirm which workspace you are operating on.',
    readOnly: true,
    destructive: false,
    inputSchema: z.object({}),
    call: () => ({ method: 'GET', path: '/validate' }),
  },
  {
    name: 'list_tags',
    title: 'List tags',
    description:
      'List the organization\'s conversation tags (id + name). Tag ids are what add_tag and remove_tag expect, and what search_customers filters by.',
    readOnly: true,
    destructive: false,
    inputSchema: z.object({}),
    call: () => ({ method: 'GET', path: '/rpc/tags' }),
  },
  {
    name: 'list_lists',
    title: 'List recipient lists',
    description:
      'List the organization\'s recipient lists (id + name). List ids are what the list tools and search_customers expect.',
    readOnly: true,
    destructive: false,
    inputSchema: z.object({}),
    call: () => ({ method: 'GET', path: '/rpc/lists' }),
  },
  {
    name: 'list_bots',
    title: 'List bots',
    description: 'List the organization\'s chat bots (id + name). Bot ids are what send_flow expects.',
    readOnly: true,
    destructive: false,
    inputSchema: z.object({}),
    call: () => ({ method: 'GET', path: '/rpc/bots' }),
  },
  {
    name: 'list_templates',
    title: 'List WhatsApp templates',
    description:
      'List the organization\'s approved WhatsApp templates. The returned names are what send_template and schedule_template expect; call get_template_params to see which parameters a template needs.',
    readOnly: true,
    destructive: false,
    inputSchema: z.object({}),
    call: () => ({ method: 'GET', path: '/rpc/templates' }),
  },
  {
    name: 'get_template_params',
    title: 'Get a template\'s parameters',
    description:
      'Describe the dynamic parameters a WhatsApp template needs (body placeholders, header media, URL button variables) before sending it with send_template or schedule_template.',
    readOnly: true,
    destructive: false,
    inputSchema: z.object({
      templateName: z.string().min(1).describe('Template name from list_templates.'),
      languageCode: z.string().optional().describe('Defaults to the template\'s own language.'),
    }),
    call: (input) => ({ method: 'GET', path: `/rpc/template-params${query(input)}` }),
  },
  {
    name: 'get_bot_template_params',
    title: 'Get a bot\'s template parameters',
    description:
      'Describe the template parameters a bot\'s opening step needs, if any, before triggering it with send_flow.',
    readOnly: true,
    destructive: false,
    inputSchema: z.object({
      botId: z.string().min(1).describe('Bot id from list_bots.'),
    }),
    call: (input) => ({ method: 'GET', path: `/rpc/bot-template-params${query(input)}` }),
  },
  {
    name: 'list_custom_fields',
    title: 'List custom fields',
    description:
      'List the organization\'s custom contact fields (id + name). Optionally scope to one recipient list. Field ids/names are what set_custom_fields expects.',
    readOnly: true,
    destructive: false,
    inputSchema: z.object({
      listId: z.string().optional().describe('Only fields of this recipient list.'),
    }),
    call: (input) => ({ method: 'GET', path: `/rpc/custom-fields${query(input)}` }),
  },
  {
    name: 'list_users',
    title: 'List agents',
    description:
      'List the organization\'s agents/users (id + name). User ids are what assign_conversation and send_push expect.',
    readOnly: true,
    destructive: false,
    inputSchema: z.object({}),
    call: () => ({ method: 'GET', path: '/rpc/users' }),
  },
  {
    name: 'get_customer_by_phone',
    title: 'Get a customer by phone',
    description:
      'Look up a single customer/conversation by phone number, including tags, lists, custom fields and conversation state.',
    readOnly: true,
    destructive: false,
    inputSchema: z.object({
      phone: phone.describe('Phone to look up, international format, e.g. 972501234567.'),
    }),
    call: (input) => ({
      method: 'GET',
      path: `/customers/get-by-phone${query({ phoneNumber: input.phone })}`,
    }),
  },
  {
    name: 'search_customers',
    title: 'Search customers',
    description:
      'Search the organization\'s customers/conversations. Filter by free text (name or phone), tags, lists, open/flagged/unread state, assignee, platform, activity dates, or a custom field value. Returns a page of customers; use limit/offset to page.',
    readOnly: true,
    destructive: false,
    inputSchema: z.object({
      q: z.string().optional().describe('Free text: customer name or phone fragment.'),
      tagIds: z.array(z.string()).optional().describe('Only customers having ALL of these tag ids.'),
      listIds: z.array(z.string()).optional().describe('Only members of these recipient lists.'),
      platform: z.enum(['whatsapp', 'messenger', 'instagram']).optional(),
      isOpen: z.boolean().optional().describe('true = conversation currently open.'),
      isPinned: z.boolean().optional(),
      isFlagged: z.boolean().optional(),
      flagColor: z.enum(['red', 'orange', 'green']).optional(),
      hasUnread: z.boolean().optional(),
      assignedUserId: z.string().optional().describe('Only conversations assigned to this agent.'),
      unassignedOnly: z.boolean().optional(),
      hasVisibleMessage: z.boolean().optional().describe('true = conversations that have at least one visible message.'),
      lastClientMessageAfter: z.string().optional().describe('ISO date, e.g. 2026-10-01.'),
      lastClientMessageBefore: z.string().optional().describe('ISO date.'),
      lastActivityAfter: z.string().optional().describe('ISO date.'),
      lastActivityBefore: z.string().optional().describe('ISO date.'),
      createdAfter: z.string().optional().describe('ISO date.'),
      createdBefore: z.string().optional().describe('ISO date.'),
      customFieldName: z.string().optional().describe('Filter by this custom field (use with customFieldValue).'),
      customFieldValue: z.string().optional(),
      sortBy: z.enum(['lastActivity', 'lastClientMessage', 'created']).optional(),
      limit: z.number().int().min(1).max(500).optional().describe('How many to return (default 100).'),
      offset: z.number().int().min(0).optional().describe('Skip this many, for paging.'),
    }),
    call: (input) => ({ method: 'GET', path: `/customers/search${query(input)}` }),
  },
  {
    name: 'list_messages',
    title: 'Read conversation messages',
    description:
      'Read a customer\'s WhatsApp chat history by phone. Returns the most recent messages in chronological order, each marked inbound (from the customer) or outbound (sent by an agent, a bot or the API), with text, media references and timestamps. When hasMore is true, pass the returned nextBefore as "before" to page further back. Returns found:false when the phone has no conversation.',
    readOnly: true,
    destructive: false,
    inputSchema: z.object({
      phone,
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('How many recent messages to return (default 50).'),
      before: z
        .string()
        .optional()
        .describe('ISO datetime; only messages strictly older than this. Use nextBefore from the previous page.'),
    }),
    call: (input) => ({ method: 'GET', path: `/messages/list${query(input)}` }),
  },

  // ------------------------------------------------------------- messaging
  {
    name: 'send_text',
    title: 'Send a text message',
    description:
      'Send a free-text WhatsApp message to a customer IMMEDIATELY. This reaches a real person\'s phone. WhatsApp only delivers free text inside an open 24-hour service window; outside it, use send_template instead.',
    readOnly: false,
    destructive: true,
    inputSchema: z.object({
      phone,
      message: z.string().min(1).describe('The message text to send.'),
      avoidBlacklist: z.boolean().optional().describe('Skip silently if the phone is blacklisted.'),
    }),
    call: (input) => ({ method: 'POST', path: '/messages/send-text', body: body(input) }),
  },
  {
    name: 'send_template',
    title: 'Send a template message',
    description:
      'Send an approved WhatsApp template to a customer IMMEDIATELY. This reaches a real person\'s phone. Use list_templates for names and get_template_params for the parameters the template needs.',
    readOnly: false,
    destructive: true,
    inputSchema: z.object({
      phone,
      templateName: z.string().min(1).describe('Template name from list_templates.'),
      languageCode: z.string().optional().describe('Defaults to the template\'s own language.'),
      parameters: z
        .array(z.string())
        .optional()
        .describe('Body placeholder values, in order ({{1}}, {{2}}, ...).'),
      headerMediaUrl: z
        .string()
        .optional()
        .describe('Public URL for the header image/video/document, when the template has a media header.'),
      urlButtonParams: z
        .array(z.string())
        .optional()
        .describe('Values for dynamic URL buttons, in button order.'),
      avoidBlacklist: z.boolean().optional().describe('Skip silently if the phone is blacklisted.'),
    }),
    call: (input) => ({ method: 'POST', path: '/messages/send-template', body: body(input) }),
  },
  {
    name: 'schedule_template',
    title: 'Schedule a template message',
    description:
      'Schedule an approved WhatsApp template for a future time. Accepts "dd/mm/yyyy HH:mm" interpreted as Israel wall time (DST-aware), or ISO 8601 with an explicit timezone. The message shows as scheduled in the SmartSend chat and can be cancelled with clear_scheduled before it fires.',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({
      phone,
      templateName: z.string().min(1).describe('Template name from list_templates.'),
      scheduledFor: z
        .string()
        .min(1)
        .describe('"dd/mm/yyyy HH:mm" (Israel time), e.g. "10/09/2026 14:30", or ISO 8601 with timezone. Must be in the future.'),
      languageCode: z.string().optional(),
      parameters: z.array(z.string()).optional().describe('Body placeholder values, in order.'),
      headerMediaUrl: z.string().optional().describe('Public URL for a media header.'),
      urlButtonParams: z.array(z.string()).optional(),
      cancelIfReplied: z
        .boolean()
        .optional()
        .describe('Auto-cancel if the customer replies before the send time.'),
      avoidBlacklist: z.boolean().optional(),
    }),
    call: (input) => ({ method: 'POST', path: '/messages/schedule-template', body: body(input) }),
  },
  {
    name: 'clear_scheduled',
    title: 'Clear scheduled messages',
    description:
      'Cancel every pending API-scheduled message for this phone (messages scheduled by agents in the chat are never touched). Returns how many were cleared; an unknown phone clears 0.',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({ phone }),
    call: (input) => ({ method: 'POST', path: '/messages/clear-scheduled', body: body(input) }),
  },
  {
    name: 'send_flow',
    title: 'Trigger a bot flow',
    description:
      'Start a chat bot flow for a customer IMMEDIATELY - the bot\'s opening message reaches a real person\'s phone. Use list_bots for ids; if the bot opens with a template that needs parameters, get_bot_template_params describes them.',
    readOnly: false,
    destructive: true,
    inputSchema: z.object({
      phone,
      botId: z.string().min(1).describe('Bot id from list_bots.'),
      buttonText: z
        .string()
        .optional()
        .describe('Simulated button/quick-reply text, for bots that branch on it.'),
      templateParams: z
        .record(z.string(), z.array(z.string()))
        .optional()
        .describe('Template parameter values for the bot\'s opening template, keyed as returned by get_bot_template_params.'),
      avoidBlacklist: z.boolean().optional(),
    }),
    call: (input) => ({ method: 'POST', path: '/flows/send', body: body(input) }),
  },
  {
    name: 'send_push',
    title: 'Send a push notification to agents',
    description:
      'Send a push notification to the organization\'s own agents in the SmartSend app (never to customers). Target one agent (recipientType "user" + userId), everyone ("organization"), or whoever a conversation belongs to ("phone" + phone).',
    readOnly: false,
    destructive: true,
    inputSchema: z.object({
      recipientType: z.enum(['user', 'organization', 'phone']),
      userId: z.string().optional().describe('Required when recipientType is "user"; id from list_users.'),
      phone: z.string().optional().describe('Required when recipientType is "phone".'),
      title: z.string().min(1),
      body: z.string().min(1),
      sound: z.enum(['default', 'cash']).optional(),
      respectPreferences: z
        .boolean()
        .optional()
        .describe('Honor each agent\'s notification preferences (default true).'),
    }),
    call: (input) => ({ method: 'POST', path: '/notifications/push', body: body(input) }),
  },

  // ---------------------------------------------------------- conversation
  {
    name: 'resolve_conversation',
    title: 'Find or create a conversation',
    description:
      'Find the conversation for a phone number, creating it if it does not exist yet. Returns the conversation and whether it was just created.',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({ phone }),
    call: (input) => ({ method: 'POST', path: '/conversations/resolve', body: body(input) }),
  },
  {
    name: 'add_tag',
    title: 'Add a tag',
    description: 'Add a tag to a customer\'s conversation. Tag ids come from list_tags.',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({
      phone,
      tagId: z.string().min(1).describe('Tag id from list_tags.'),
    }),
    call: (input) => ({ method: 'POST', path: '/conversations/tags/add', body: body(input) }),
  },
  {
    name: 'remove_tag',
    title: 'Remove a tag',
    description: 'Remove one tag from a customer\'s conversation.',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({
      phone,
      tagId: z.string().min(1).describe('Tag id from list_tags.'),
    }),
    call: (input) => ({ method: 'POST', path: '/conversations/tags/remove', body: body(input) }),
  },
  {
    name: 'clear_tags',
    title: 'Clear all tags',
    description: 'Remove ALL tags from a customer\'s conversation.',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({ phone }),
    call: (input) => ({ method: 'POST', path: '/conversations/tags/clear', body: body(input) }),
  },
  {
    name: 'set_flag',
    title: 'Flag a conversation',
    description: 'Set or clear the colored flag on a customer\'s conversation ("none" clears it).',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({
      phone,
      color: z.enum(['red', 'orange', 'green', 'none']),
    }),
    call: (input) => ({ method: 'POST', path: '/conversations/flag', body: body(input) }),
  },
  {
    name: 'set_display_name',
    title: 'Set a display name',
    description: 'Set the customer\'s display name in SmartSend (null clears it back to the WhatsApp profile name).',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({
      phone,
      displayName: z.string().nullable().describe('The new name, or null to clear.'),
    }),
    call: (input) => ({
      method: 'POST',
      path: '/conversations/display-name',
      // displayName: null is meaningful (clear), so keep it in the body.
      body: { phone: input.phone, displayName: input.displayName ?? null },
    }),
  },
  {
    name: 'assign_conversation',
    title: 'Assign a conversation',
    description:
      'Assign a customer\'s conversation to an agent. User ids come from list_users. By default the agent is added to the existing assignees; replaceExisting replaces them.',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({
      phone,
      userId: z.string().min(1).describe('Agent id from list_users.'),
      replaceExisting: z.boolean().optional().describe('Replace current assignees instead of adding.'),
    }),
    call: (input) => ({ method: 'POST', path: '/conversations/assign', body: body(input) }),
  },
  {
    name: 'add_note',
    title: 'Add an internal note',
    description:
      'Add an internal note to a customer\'s conversation. Notes are visible to agents only - the customer never sees them.',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({
      phone,
      content: z.string().min(1),
      agentName: z.string().optional().describe('Shown as the note\'s author.'),
    }),
    call: (input) => ({ method: 'POST', path: '/conversations/notes', body: body(input) }),
  },
  {
    name: 'set_custom_fields',
    title: 'Set custom fields',
    description:
      'Set one or more custom field values on a customer. Identify each field by fieldId or fieldName (see list_custom_fields); a null value clears the field.',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({
      phone,
      fields: z
        .array(
          z.object({
            fieldId: z.string().optional(),
            fieldName: z.string().optional(),
            value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
          }),
        )
        .min(1)
        .describe('Each entry needs fieldId or fieldName, plus the value (null clears).'),
    }),
    call: (input) => ({ method: 'POST', path: '/conversations/set-custom-fields', body: body(input) }),
  },

  // ------------------------------------------------------------------ lists
  {
    name: 'create_list',
    title: 'Create a recipient list',
    description:
      'Create a recipient list (campaign audience). If a list with this name already exists it is returned instead of duplicated.',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      tagIds: z.array(z.string()).optional().describe('Auto-fill the list from these tags.'),
    }),
    call: (input) => ({ method: 'POST', path: '/lists/create', body: body(input) }),
  },
  {
    name: 'add_list_recipient',
    title: 'Add a recipient to a list',
    description:
      'Add a phone number to a recipient list, optionally with a name and custom field values. List ids come from list_lists or create_list.',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({
      listId: z.string().min(1).describe('List id from list_lists.'),
      phone,
      name: z.string().optional().describe('Recipient display name.'),
      customFields: z
        .record(z.string(), z.string())
        .optional()
        .describe('Custom field values for this recipient, keyed by field name.'),
    }),
    call: (input) => ({ method: 'POST', path: '/lists/add-recipient', body: body(input) }),
  },
  {
    name: 'remove_list_recipient',
    title: 'Remove a recipient from a list',
    description: 'Remove a phone number from a recipient list.',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({
      listId: z.string().min(1).describe('List id from list_lists.'),
      phone,
    }),
    call: (input) => ({ method: 'POST', path: '/lists/remove-recipient', body: body(input) }),
  },

  // -------------------------------------------------------------- blacklist
  {
    name: 'add_to_blacklist',
    title: 'Blacklist a phone',
    description:
      'Add a phone number to the organization\'s blacklist. Sends that opt into avoidBlacklist will skip it from now on.',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({
      phone,
      reason: z.string().optional(),
    }),
    call: (input) => ({ method: 'POST', path: '/blacklist/add', body: body(input) }),
  },
  {
    name: 'remove_from_blacklist',
    title: 'Remove a phone from the blacklist',
    description: 'Remove a phone number from the organization\'s blacklist.',
    readOnly: false,
    destructive: false,
    inputSchema: z.object({ phone }),
    call: (input) => ({ method: 'POST', path: '/blacklist/remove', body: body(input) }),
  },
];
