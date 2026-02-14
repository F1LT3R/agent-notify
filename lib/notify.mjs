#!/usr/bin/env node
import { exec } from 'child_process';

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: notify <type> <message> [--workspace-dir path] [--agent-role name] [--agent-number N] [--voice voice] [--role role] [--model model]');
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
  '--role': 'role',
  '--model': 'model'
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
const params = new URLSearchParams();
params.set('type', type);
params.set('message', message);
for (const [key, value] of Object.entries(optionalParams)) {
  params.set(key, value);
}

const curlCommand = `curl -s "http://192.168.0.6:8881/agent-notify?${params.toString()}"`;

exec(curlCommand, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
  if (stderr) {
    console.error(stderr);
    process.exit(1);
  }
  
  // Success - just output type and message
  console.log(`${type}: "${message}"`);
});