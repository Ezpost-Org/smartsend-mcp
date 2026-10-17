# SmartSend MCP server

An [MCP](https://modelcontextprotocol.io) server for the
[SmartSend](https://smartsend.co.il) REST API. Connect it to Claude (or any
MCP client) and let a model operate your SmartSend workspace: look up and
search customers, manage tags, lists and custom fields, send and schedule
WhatsApp template messages, trigger bots, and more — 31 tools in total.

One API key = one organization. Every tool is scoped by the key; there is no
way to reach another organization's data.

## Getting an API key

In SmartSend: **Settings → API keys** → create a key. It looks like
`ss_live_...`.

## Use the hosted endpoint (nothing to install)

Point any MCP client (Streamable HTTP transport) at:

```
URL:    https://gateway.smartsend.co.il/mcp
Header: Authorization: Bearer ss_live_...
```

Claude Code:

```bash
claude mcp add --transport http smartsend https://gateway.smartsend.co.il/mcp --header "Authorization: Bearer ss_live_..."
```

### Add as a Claude connector (claude.ai / Claude Desktop)

1. **Settings → Connectors → Add custom connector**
2. URL: `https://gateway.smartsend.co.il/mcp`
3. Under **Request headers**, add a header named `Authorization` with the value
   `Bearer ss_live_...` (the word `Bearer`, a space, then your key).

Request-header authentication is currently an Anthropic beta — if you don't
see the *Request headers* section in the dialog, your Claude organization
doesn't have it yet; connect through Claude Code (above) in the meantime. On
Team/Enterprise plans the connector is added by the workspace Owner, then each
member enables it. Do not put the key in the URL — the MCP spec forbids
credentials in query strings.

## Or run it locally (stdio)

Requires Node.js 20+.

```bash
git clone https://github.com/Ezpost-Org/smartsend-mcp.git
cd smartsend-mcp
npm install && npm run build
```

Claude Code:

```bash
claude mcp add smartsend --env SMARTSEND_API_KEY=ss_live_... -- node /path/to/smartsend-mcp/dist/index.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "smartsend": {
      "command": "node",
      "args": ["/path/to/smartsend-mcp/dist/index.js"],
      "env": { "SMARTSEND_API_KEY": "ss_live_..." }
    }
  }
}
```

The server validates the key at startup and prints the organization it
connected to. `SMARTSEND_API_URL` overrides the API base URL (rarely needed).

## Tools

**Read** — `get_organization`, `list_tags`, `list_lists`, `list_bots`,
`list_templates`, `get_template_params`, `get_bot_template_params`,
`list_custom_fields`, `list_users`, `get_customer_by_phone`,
`search_customers`, `list_messages` (chat history, paged)

**Messaging** — `send_text`, `send_template`, `schedule_template`
(`dd/mm/yyyy HH:mm` Israel time or ISO 8601), `clear_scheduled`, `send_flow`,
`send_push`

**Conversation** — `resolve_conversation`, `add_tag`, `remove_tag`,
`clear_tags`, `set_flag`, `set_display_name`, `assign_conversation`,
`add_note`, `set_custom_fields`

**Lists** — `create_list`, `add_list_recipient`, `remove_list_recipient`

**Blacklist** — `add_to_blacklist`, `remove_from_blacklist`

`send_text`, `send_template`, `send_flow` and `send_push` are annotated
`destructiveHint: true` — they immediately reach a real person's device, so
MCP clients that honor the hint will ask before running them.

## Notes

- Phone numbers are international format, e.g. `972501234567`.
- WhatsApp only delivers free text (`send_text`) inside an open 24-hour
  service window; outside it, send an approved template (`send_template`).
- Media sends take a public `headerMediaUrl`; file uploads are not exposed
  over MCP.
- API errors are returned verbatim (e.g. `template not found: welcome`), so
  the model can usually correct itself.

## Development

```bash
npm install
npm test        # wire-contract and client tests
npm run build
```

MIT © SmartSend
