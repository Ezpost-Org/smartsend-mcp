#!/usr/bin/env node
// SmartSend MCP server (stdio).
//
// Exposes your SmartSend organization's integration API as tools a model can
// call: customers, tags, lists, templates, sends and scheduling. One API key
// = one organization, so every tool is already scoped; there is no way to
// reach another organization's data.
//
//   SMARTSEND_API_KEY   required, the ss_live_... key from
//                       Settings -> API keys in SmartSend
//   SMARTSEND_API_URL   optional, defaults to production

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSmartSendClient, SmartSendApiError } from './client.js';
import { tools, type ToolInput } from './tools.js';

const apiKey = process.env.SMARTSEND_API_KEY;
if (apiKey === undefined || apiKey === '') {
  console.error(
    'SMARTSEND_API_KEY is not set. Create a key in SmartSend under Settings -> API keys and pass it as SMARTSEND_API_KEY.',
  );
  process.exit(1);
}

const client = createSmartSendClient({
  apiKey,
  ...(process.env.SMARTSEND_API_URL !== undefined && process.env.SMARTSEND_API_URL !== ''
    ? { baseUrl: process.env.SMARTSEND_API_URL }
    : {}),
});

const server = new McpServer({
  name: 'smartsend',
  title: 'SmartSend',
  version: '0.1.0',
  icons: [
    {
      src: 'https://app.smartsend.co.il/icon.png',
      mimeType: 'image/png',
      sizes: ['385x384'],
    },
  ],
  websiteUrl: 'https://app.smartsend.co.il',
});

for (const tool of tools) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema.shape,
      annotations: {
        readOnlyHint: tool.readOnly,
        // "Destructive" here means the call immediately reaches a real
        // person's phone (send_text/send_template/send_flow/send_push), so
        // MCP clients that gate on it ask the user first.
        destructiveHint: tool.destructive,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const { method, path, body } = tool.call(input as ToolInput);
        const data = await client.request(method, path, body);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        // The API's own message already says what to do next; surfacing it
        // verbatim is what lets a model correct itself without a round trip.
        const message =
          error instanceof SmartSendApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Unknown error';
        return { isError: true, content: [{ type: 'text' as const, text: message }] };
      }
    },
  );
}

async function main(): Promise<void> {
  // Fail loudly at startup rather than on the first tool call: a bad key is a
  // setup problem, and the model should never have to diagnose it.
  try {
    const org = await client.validate();
    console.error(
      `smartsend-mcp: connected to ${org.organizationName}${org.whatsappConnected ? '' : ' (no WhatsApp number connected)'}`,
    );
  } catch (error) {
    console.error(
      `smartsend-mcp: could not verify the API key. ${error instanceof Error ? error.message : ''}`,
    );
    process.exit(1);
  }

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error('smartsend-mcp: fatal', error);
  process.exit(1);
});
