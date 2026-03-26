#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: notify <type> <message> [--workspace-dir path] [--agent-role name] [--agent-number N] [--voice voice] [--model model] [--app name] [--project name] [--detail text] [--link url]');
  process.exit(1);
}

// First two positional arguments are type and message
const type = args[0];
const message = args[1];

// Parse optional flags from remaining arguments
const flagMap = {
  '--workspace-dir': 'workspaceDir',
  '--agent-role': 'agentRole',
  '--agent-number': 'agentNumber',
  '--voice': 'voice',
  '--model': 'model',
  '--app': 'app',
  '--project': 'project',
  '--detail': 'detail',
  '--link': 'url'
};

const optionalParams = {};
for (let i = 2; i < args.length; i++) {
  const paramName = flagMap[args[i]];
  if (paramName && i + 1 < args.length) {
    optionalParams[paramName] = args[i + 1];
    i++; // skip value
  }
}

// Build URL with query parameters
const BASE_URL = process.env.AGENT_NOTIFY_URL || 'http://localhost:8881';
const params = new URLSearchParams();
params.set('type', type);
params.set('message', message);

// Route to /notify/app if --app is present, otherwise /notify/agent
const endpoint = optionalParams.app ? '/notify/app' : '/notify/agent';

// Add optional parameters based on endpoint
for (const [key, value] of Object.entries(optionalParams)) {
  params.set(key, value);
}

const url = `${BASE_URL}${endpoint}?${params.toString()}`;

try {
  const response = await fetch(url);
  
  if (!response.ok) {
    console.error(`Error: Server returned ${response.status}`);
    process.exit(1);
  }
  
  // Success - just output type and message
  console.log(`${type}: "${message}"`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
