# SmartSend MCP server

An [MCP](https://modelcontextprotocol.io) server for the
[SmartSend](https://smartsend.co.il) REST API. Connect it to Claude (or any
MCP client) and let a model operate your SmartSend workspace: look up and
search customers, manage tags, lists and custom fields, send and schedule
WhatsApp template messages, trigger bots, and more — 32 tools in total.

One API key = one organization. Every tool is scoped by the key; there is no
way to reach another organization's data.

## Getting an API key

In SmartSend: **Settings → Integrations → API keys → Create key**. It looks
like `ss_live_...` and is shown once.

## Add as a Claude connector (claude.ai, Claude Desktop, Claude mobile)

1. **Settings → Connectors → Add custom connector**
2. Name `SmartSend`, URL `https://smartsend-server.otherwise.co.il/mcp`, leave
   *Advanced settings* empty → **Add**.
3. Click **Connect**. A SmartSend approval page opens: paste your `ss_live_...`
   key and approve. You're sent back to Claude, connected.
4. In a chat, open the tools menu (**+**) → **Connectors** and switch SmartSend on.

On Team/Enterprise plans an Owner adds the connector once for the
organization; each member then clicks **Connect** and approves with their own
key.

Under the hood this is standard MCP authorization (OAuth 2.1 + PKCE with
dynamic client registration). The tokens Claude receives wrap your key, so
deleting the key in SmartSend disconnects every connector that used it.

## Use the hosted endpoint from other clients

Any MCP client with Streamable HTTP can send the key directly:

```
URL:    https://smartsend-server.otherwise.co.il/mcp
Header: Authorization: Bearer ss_live_...
```

Claude Code:

```bash
claude mcp add --transport http smartsend https://smartsend-server.otherwise.co.il/mcp --header "Authorization: Bearer ss_live_..."
```

(Or leave out `--header` and run `/mcp` inside Claude Code to approve in the
browser, same as claude.ai.) Do not put the key in the URL: the MCP spec
forbids credentials in query strings.

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
