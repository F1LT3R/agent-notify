#!/usr/bin/env node
import { exec } from 'child_process';

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: notify <type> <message>');
  process.exit(1);
}

const [type, message] = args;

// URL encode the message
const encodedMessage = encodeURIComponent(message);

const curlCommand = `curl -s "http://192.168.0.6:8881/agent-notify?type=${type}&message=${encodedMessage}"`;

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