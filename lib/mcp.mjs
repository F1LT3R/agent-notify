#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

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
              enum: ["question", "permission", "done", "error", "status", "waiting", "review"]
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
            role: {
              type: "string",
              description: "Specific task role for logging — e.g., 'test-runner', 'code-reviewer'. Shown in console log only, not spoken."
            },
            model: {
              type: "string",
              description: "Model identifier for logging — e.g., 'fast', 'opus'. Shown in console log only, not spoken."
            }
          },
          required: ["type", "message"]
        }
      }
    ]
  };
});


server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "notify") {
    const { type, message, workspaceDir, agentRole, agentNumber, voice, role, model } = request.params.arguments;
    
    // Build URL with all provided params
    const params = new URLSearchParams();
    params.set('type', type);
    params.set('message', message);
    if (workspaceDir !== undefined) params.set('workspaceDir', workspaceDir);
    if (agentRole !== undefined) params.set('agentRole', agentRole);
    if (agentNumber !== undefined) params.set('agentNumber', String(agentNumber));
    if (voice !== undefined) params.set('voice', voice);
    if (role !== undefined) params.set('role', role);
    if (model !== undefined) params.set('model', model);
    
    const url = `http://192.168.0.6:8881/agent-notify?${params.toString()}`;
    
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
            text: `${parts.join(' ')}: "${message}"`
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
  
  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
