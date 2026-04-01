#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = process.env.AGENT_NOTIFY_URL || 'http://localhost:8881';

const server = new Server(
  {
    name: "agent-notify",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "notify",
        description: "Send an audio notification with text-to-speech to alert the user",
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              description: "Notification type",
              enum: ["question", "permission", "done", "error", "status", "waiting", "review", "message"]
            },
            message: {
              type: "string",
              description: "Message to vocalize"
            },
            workspaceDir: {
              type: "string",
              description: "The Workspace Path from <user_info>. Used to identify which project this notification is from. Example: '/Users/user/repos/my-app'"
            },
            agentRole: {
              type: "string",
              description: "Agent role name assigned by orchestrator — e.g., 'Coder', 'Reviewer'. The orchestrator itself should use 'Orchestrator'. Solo agents can omit this."
            },
            agentNumber: {
              type: "integer",
              description: "Agent number assigned by orchestrator. Orchestrator = 0, subagents = 1, 2, 3, etc. Solo agents can omit this."
            },
            voice: {
              type: "string",
              description: "Override the TTS voice for this notification. If omitted, the server selects a voice based on agentRole or agentNumber."
            },
            model: {
              type: "string",
              description: "Your exact model identifier as shown in system info — e.g., 'claude-4.6-opus-high', 'gpt-4o-2025-03'. Include version and variant. Shown in console log only, not spoken."
            },
            to: {
              type: "string",
              description: "Agent role or name this message is directed to (e.g., 'Reviewer', 'Coder'). Used for agent-to-agent conversations. All agents can still see the message in the stream."
            },
            response_to: {
              type: "integer",
              description: "Message ID this is a reply to. Enables lightweight response polling via /responses/available and /responses/observed."
            }
          },
          required: ["type", "message", "model"]
        }
      },
      {
        name: "get_messages",
        description: "Pull recent notifications from the agent-notify message stream. Use since_id to poll incrementally for new messages.",
        inputSchema: {
          type: "object",
          properties: {
            since_id: {
              type: "number",
              description: "Return only messages with id greater than this. Pass 0 for initial fetch, then use latest_id from the response for subsequent polls."
            },
            limit: {
              type: "number",
              description: "Max messages to return (default 50, max 200)"
            },
            type: {
              type: "string",
              description: "Filter by notification type",
              enum: ["question", "permission", "done", "error", "status", "waiting", "review", "message", "debug", "info", "warn", "success"]
            },
            to: {
              type: "string",
              description: "Filter messages directed to this agent role/name"
            },
            project: {
              type: "string",
              description: "Filter by project name (derived from workspaceDir)"
            },
            source: {
              type: "string",
              description: "Filter by message source",
              enum: ["agent", "app", "operator"]
            },
            agentRole: {
              type: "string",
              description: "Filter by agent role (e.g., 'Coder', 'Reviewer')"
            },
            agentNumber: {
              type: "number",
              description: "Filter by agent number"
            },
            model: {
              type: "string",
              description: "Filter by model identifier"
            },
            voice: {
              type: "string",
              description: "Filter by TTS voice name"
            },
            app: {
              type: "string",
              description: "Filter by app name (for app notifications)"
            },
            response_to: {
              type: "integer",
              description: "Filter to messages that are replies to this message ID"
            }
          }
        }
      },
      {
        name: "check_message_status",
        description: "Lightweight status check for turn-taking and polling. Returns counters (latest_id, last_played_id, has_new, queue_length) plus an agents array showing which agents have posted since since_id, with their latestId and played status. Use this instead of get_messages when you only need to check playback status or recent agent activity.",
        inputSchema: {
          type: "object",
          properties: {
            since_id: {
              type: "number",
              description: "Check for messages newer than this ID. Returns has_new: true if latest_id > since_id."
            }
          }
        }
      },
      {
        name: "check_responses_available",
        description: "Check if any responses have been sent to a specific message. Returns a count. Use for bus-mode polling where you only need to know if a reply exists, regardless of whether the human has heard it.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "The message ID to check for responses to (the id returned by notify)"
            }
          },
          required: ["id"]
        }
      },
      {
        name: "check_responses_observed",
        description: "Check if any responses to a specific message have been heard by the human (audio played). Returns a count. Use for conversational-mode polling where you need to wait for the human to actually hear the reply before proceeding.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "The message ID to check for observed responses to (the id returned by notify)"
            }
          },
          required: ["id"]
        }
      }
    ]
  };
});


server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "notify") {
    const { type, message, workspaceDir, agentRole, agentNumber, voice, model, to, response_to } = request.params.arguments;

    // Build URL with all provided params
    const params = new URLSearchParams();
    params.set('type', type);
    params.set('message', message);
    if (workspaceDir !== undefined) params.set('workspaceDir', workspaceDir);
    if (agentRole !== undefined) params.set('agentRole', agentRole);
    if (agentNumber !== undefined) params.set('agentNumber', String(agentNumber));
    if (voice !== undefined) params.set('voice', voice);
    if (model !== undefined) params.set('model', model);
    if (to !== undefined) params.set('to', to);
    if (response_to !== undefined) params.set('response_to', String(response_to));

    const url = `${BASE_URL}/notify/agent?${params.toString()}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      // Build response text with available context
      const parts = [type.toUpperCase()];
      if (workspaceDir) {
        const project = workspaceDir.split('/').pop();
        parts.unshift(`[${project}]`);
      }
      if (agentRole) parts.splice(parts.length - 1, 0, agentRole);

      return {
        content: [
          {
            type: "text",
            text: `${parts.join(' ')}: "${message}" (id: ${data.id})`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error sending notification: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  if (request.params.name === "get_messages") {
    const args = request.params.arguments || {};
    const params = new URLSearchParams();

    const fields = ['since_id', 'limit', 'type', 'to', 'project', 'source', 'agentRole', 'agentNumber', 'model', 'voice', 'app', 'response_to'];
    for (const key of fields) {
      if (args[key] !== undefined) params.set(key, String(args[key]));
    }

    const url = `${BASE_URL}/messages?${params.toString()}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching messages: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  if (request.params.name === "check_message_status") {
    const args = request.params.arguments || {};
    const params = new URLSearchParams();

    if (args.since_id !== undefined) params.set('since_id', String(args.since_id));

    const url = `${BASE_URL}/messages/status?${params.toString()}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      return {
        content: [{ type: "text", text: JSON.stringify(data) }]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error checking message status: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  if (request.params.name === "check_responses_available") {
    const { id } = request.params.arguments;
    const url = `${BASE_URL}/responses/available/for/id/${id}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }

  if (request.params.name === "check_responses_observed") {
    const { id } = request.params.arguments;
    const url = `${BASE_URL}/responses/observed/for/id/${id}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
