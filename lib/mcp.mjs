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
    const { type, message } = request.params.arguments;
    
    const encodedMessage = encodeURIComponent(message);
    const url = `http://192.168.0.6:8881/agent-notify?type=${type}&message=${encodedMessage}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      return {
        content: [
          {
            type: "text",
            text: `${type.toUpperCase()}: "${message}"`
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
