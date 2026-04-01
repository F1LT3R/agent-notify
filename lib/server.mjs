#!/usr/bin/env node

import express from 'express';
import { execFile, spawn, spawnSync } from 'child_process';
import readline from 'readline';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'web')));

// SSE — push new messages to connected web clients
const sseClients = new Set();

app.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.flushHeaders();
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`);
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let address = '0.0.0.0:8881'; // default
  let logLevel = 'info';
  let logLevelAudio = 'info';
  let watchMode = false;
  let storePath = null;
  let yes = false;
  let clear = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--address' && i + 1 < args.length) {
      address = args[i + 1];
      i++;
    } else if (args[i] === '--log-level' && i + 1 < args.length) {
      logLevel = args[i + 1];
      i++;
    } else if (args[i] === '--log-level-audio' && i + 1 < args.length) {
      logLevelAudio = args[i + 1];
      i++;
    } else if (args[i] === '--store' && i + 1 < args.length) {
      storePath = args[i + 1];
      i++;
    } else if (args[i] === '--watch') {
      watchMode = true;
    } else if (args[i] === '--yes') {
      yes = true;
    } else if (args[i] === '--clear') {
      clear = true;
    }
  }

  // Parse host and port from address
  const [host, port] = address.includes(':')
    ? address.split(':')
    : ['0.0.0.0', address]; // if no colon, treat as port only

  return {
    host: host || '0.0.0.0',
    port: parseInt(port) || 8881,
    logLevel,
    logLevelAudio,
    watchMode,
    storePath,
    yes,
    clear
  };
}

const { host: HOST, port: PORT, logLevel: LOG_LEVEL, logLevelAudio: LOG_LEVEL_AUDIO, watchMode: WATCH_MODE, storePath: STORE_PATH, yes: YES, clear: CLEAR } = parseArgs();

// Log level hierarchy (lowest to highest)
const LOG_LEVELS = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, success: 5 };

function meetsThreshold(type, threshold) {
  const typeLevel = LOG_LEVELS[type];
  const thresholdLevel = LOG_LEVELS[threshold];
  if (typeLevel === undefined || thresholdLevel === undefined) return true;
  return typeLevel >= thresholdLevel;
}

// Resolve sound paths relative to the package root (one level up from lib/)
const soundDir = path.join(__dirname, '..', 'sounds');
const sound = (name) => path.join(soundDir, name);

// Agent sound file mappings
const agentSoundMap = {
  'question': sound('question.mp3'),
  'permission': sound('permission.mp3'),
  'done': sound('done.mp3'),
  'error': sound('error.mp3'),
  'status': sound('status.mp3'),
  'waiting': sound('waiting.mp3'),
  'review': sound('review.mp3'),
  'message': sound('status.mp3')
};

// App sound file mappings
const appSoundMap = {
  'trace': null,
  'debug': null,
  'info': sound('status.mp3'),
  'warn': sound('waiting.mp3'),
  'error': sound('error.mp3'),
  'success': sound('done.mp3')
};

// Agent emoji mappings
const agentEmojiMap = {
  'question': '❓',
  'permission': '🔐',
  'done': '✅',
  'error': '❌',
  'status': '📡',
  'waiting': '⏳',
  'review': '👁️',
  'message': '💬'
};

// App emoji mappings
const appEmojiMap = {
  'trace': '🔬',
  'debug': '🐛',
  'info': 'ℹ️',
  'warn': '⚠️',
  'error': '❌',
  'success': '✅'
};

// Color mappings for different notification types
const colorMap = {
  'question': '\x1b[33m',    // Yellow
  'permission': '\x1b[35m',  // Magenta
  'done': '\x1b[32m',        // Green
  'error': '\x1b[31m',       // Red
  'status': '\x1b[36m',      // Cyan
  'waiting': '\x1b[34m',     // Blue
  'review': '\x1b[95m',      // Bright Magenta
  'trace': '\x1b[90m',       // Gray
  'debug': '\x1b[90m',       // Gray
  'info': '\x1b[36m',        // Cyan
  'warn': '\x1b[33m',        // Yellow
  'success': '\x1b[32m',      // Green
  'message': '\x1b[30;106m',  // Black text on Bright Cyan background
  'system': '\x1b[90m',       // Gray
  'operator': '\x1b[97;45m'   // White on Magenta
};
const resetColor = '\x1b[0m'; // Reset to default

// Voice maps for multi-agent TTS differentiation
const roleVoiceMap = {
  'Orchestrator': null,          // System default (same as solo agent)
  'Coder': 'Nathan',            // en-US, enhanced, natural
  'Reviewer': 'Samantha',       // en-US, clear, analytical
  'Tester': 'Karen',            // en-AU, methodical
  'Designer': 'Zoe',            // en-US, bright, creative
  'Researcher': 'Serena',       // en-US, calm, thoughtful
  'Debugger': 'Lee',            // en-US, focused, precise
  'DevOps': 'Evan',             // en-US, confident, reliable
  'Writer': 'Matilda',          // en-US, articulate, clear
  'Planner': 'Catherine',       // en-AU, organized, strategic
  'Security': 'Ava',            // en-US, alert, vigilant
  'Refactorer': 'Siri 1',       // en-US, systematic, efficient
  'Analyst': 'Siri 2',          // en-US, analytical, detailed
  'Migrator': 'Siri 3'          // en-US, methodical, careful
};

const indexVoiceMap = {
  0: null,        // Orchestrator — system default
  1: 'Nathan',    // en-US, Coder
  2: 'Samantha',  // en-US, Reviewer
  3: 'Karen',     // en-AU, Tester
  4: 'Zoe',       // en-US, Designer
  5: 'Serena',    // en-US, Researcher
  6: 'Lee',       // en-US, Debugger
  7: 'Evan',      // en-US, DevOps
  8: 'Matilda',   // en-US, Writer
  9: 'Catherine', // en-AU, Planner
  10: 'Ava',      // en-US, Security
  11: 'Siri 1',   // en-US, Refactorer
  12: 'Siri 2',   // en-US, Analyst
  13: 'Siri 3'    // en-US, Migrator
};

function selectVoice(agentRole, agentNumber, voiceOverride) {
  if (voiceOverride) return voiceOverride;
  if (agentRole && agentRole in roleVoiceMap) return roleVoiceMap[agentRole];
  if (agentNumber !== undefined && agentNumber in indexVoiceMap) return indexVoiceMap[agentNumber];
  return null; // system default
}

// Track currently playing audio
let currentPlayer = null;
let ttsChild = null;
let isPlaying = false;

// Notification queue
const notificationQueue = [];
let isProcessing = false;

// Message store
const messageStore = [];
let messageIdCounter = 0;
const MEMORY_WINDOW = 10_000;
const STORE_DIR = STORE_PATH
  ? path.resolve(STORE_PATH)
  : process.env.AGENT_NOTIFY_STORE
    ? path.resolve(process.env.AGENT_NOTIFY_STORE)
    : path.join(
        __dirname, '..', '.agent-notify'
      );
const MESSAGE_STORE_PATH = path.join(
  STORE_DIR, 'messages.jsonl'
);
const META_PATH = path.join(
  STORE_DIR, 'messages.jsonl.meta'
);
let lastWrittenId = 0;

function osc8(filePath, displayText) {
  const url = `file://${filePath}`;
  return `\x1b]8;;${url}\x1b\\`
    + `${displayText || filePath}`
    + `\x1b]8;;\x1b\\`;
}

let stickyShown = false;

function printStickyLink() {
  const dir = path.basename(STORE_DIR);
  const file = path.basename(MESSAGE_STORE_PATH);
  console.log(
    `\x1b[2m💾 `
    + osc8(MESSAGE_STORE_PATH, `${dir}/${file}`)
    + resetColor
  );
  stickyShown = true;
}

function clearStickyLink() {
  if (!stickyShown) return;
  process.stdout.write('\x1b[1A\x1b[2K');
  stickyShown = false;
}

// Mute toggle for agent messages
let muted = false;

const playbackResolvers = new Map();

function hashMessage(msg) {
  return crypto.createHash('sha256')
    .update(
      `${msg.id}|${msg.timestamp}`
      + `|${msg.message}|${msg.type}`
    )
    .digest('hex')
    .slice(0, 16);
}

function ensureStoreDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

function appendMessage(msg) {
  if (msg.id <= lastWrittenId) {
    console.error(
      `\n⛔ REFUSING TO APPEND: last written `
      + `id is ${lastWrittenId} but new message `
      + `is id ${msg.id}. This would corrupt `
      + `the store.\n`
      + `   Use --store <path> or `
      + `$AGENT_NOTIFY_STORE for a separate `
      + `file.\n`
    );
    return;
  }
  ensureStoreDir();
  fs.appendFileSync(
    MESSAGE_STORE_PATH,
    JSON.stringify(msg) + '\n'
  );
  lastWrittenId = msg.id;
  updateMetaFile();
}

function updateMetaFile() {
  fs.writeFileSync(META_PATH, JSON.stringify({
    lastWrittenId,
    messageCount: messageStore.length,
    updatedAt: new Date().toISOString()
  }) + '\n');
}

function loadMetaFile() {
  if (!fs.existsSync(META_PATH)) return null;
  try {
    return JSON.parse(
      fs.readFileSync(META_PATH, 'utf-8')
    );
  } catch {
    return null;
  }
}

function storeMessage(entry) {
  const prev = messageStore.length > 0
    ? messageStore[messageStore.length - 1]
    : null;
  const stored = {
    id: ++messageIdCounter,
    timestamp: new Date().toISOString(),
    prevHash: prev ? hashMessage(prev) : null,
    ...entry
  };
  messageStore.push(stored);
  appendMessage(stored);
  broadcast(stored);
  return stored;
}

function markPlayed(messageId) {
  storeMessage({
    source: 'system',
    type: 'played',
    refId: messageId,
    message: ''
  });

  const resolve = playbackResolvers.get(messageId);
  if (resolve) {
    resolve();
    playbackResolvers.delete(messageId);
  }
}

function clearStoreConfirm() {
  if (YES) return Promise.resolve(true);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(
      `🗑️  Clear ${osc8(MESSAGE_STORE_PATH, path.basename(STORE_DIR) + '/' + path.basename(MESSAGE_STORE_PATH))}? [y/N] `,
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y');
      }
    );
  });
}

function loadMessageStore() {
  // Migration: old locations → new directory
  const OLD_JSON = path.join(
    __dirname, '..', '.message-store.json'
  );
  const OLD_JSONL = path.join(
    __dirname, '..', '.message-store.jsonl'
  );
  if (!fs.existsSync(MESSAGE_STORE_PATH)
      && fs.existsSync(OLD_JSONL)) {
    ensureStoreDir();
    fs.copyFileSync(OLD_JSONL, MESSAGE_STORE_PATH);
    console.log(
      `📋 Migrated store from `
      + `.message-store.jsonl → .agent-notify/`
    );
  } else if (!fs.existsSync(MESSAGE_STORE_PATH)
      && fs.existsSync(OLD_JSON)) {
    ensureStoreDir();
    const old = JSON.parse(
      fs.readFileSync(OLD_JSON, 'utf-8')
    );
    const lines = old.messages
      .map(m => JSON.stringify(m))
      .join('\n') + '\n';
    fs.writeFileSync(MESSAGE_STORE_PATH, lines);
    console.log(
      `📋 Migrated ${old.messages.length} messages `
      + `from .json → .agent-notify/`
    );
  }

  if (!fs.existsSync(MESSAGE_STORE_PATH)) {
    console.log(
      '📋 No store file found — starting fresh'
    );
    return;
  }

  let allLines;
  try {
    const data = fs.readFileSync(
      MESSAGE_STORE_PATH, 'utf-8'
    );
    allLines = data.split('\n').filter(Boolean);
  } catch (err) {
    console.error(
      `\n⛔ FATAL: Store file exists but failed `
      + `to read:\n`
      + `   ${MESSAGE_STORE_PATH}\n`
      + `   Error: ${err.message}\n`
      + `   Refusing to start. Fix the file or `
      + `use\n`
      + `   --store <path> for a separate store.\n`
    );
    process.exit(1);
  }

  const totalLines = allLines.length;
  const startIdx = Math.max(
    0, totalLines - MEMORY_WINDOW
  );
  const lines = allLines.slice(startIdx);

  if (startIdx > 0) {
    console.log(
      `📋 ${totalLines} lines on disk, `
      + `loading last ${lines.length} into memory`
    );
  }

  let preWindowMsg = null;
  if (startIdx > 0) {
    try {
      preWindowMsg = JSON.parse(
        allLines[startIdx - 1]
      );
    } catch (err) {
      console.error(
        `\n⛔ FATAL: Corrupt line ${startIdx} `
        + `in store:\n`
        + `   ${err.message}\n`
        + `   Refusing to start.\n`
      );
      process.exit(1);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    try {
      messageStore.push(JSON.parse(lines[i]));
    } catch (err) {
      const lineNum = startIdx + i + 1;
      console.error(
        `\n⛔ FATAL: Corrupt line ${lineNum} in `
        + `store:\n`
        + `   ${err.message}\n`
        + `   Line: ${lines[i].slice(0, 100)}...\n`
        + `   Refusing to start.\n`
      );
      process.exit(1);
    }
  }

  if (messageStore.length > 0) {
    messageIdCounter = messageStore[
      messageStore.length - 1
    ].id;
    lastWrittenId = messageIdCounter;
  }

  verifyChainOnLoad(preWindowMsg);

  // Startup backup
  if (messageStore.length > 0) {
    const ts = new Date().toISOString()
      .replace(/[:.]/g, '-');
    const safetyPath = path.join(
      STORE_DIR,
      `messages.pre-start.${ts}.jsonl`
    );
    fs.copyFileSync(MESSAGE_STORE_PATH, safetyPath);
    console.log(
      `🛡️  Startup backup: ${osc8(safetyPath, path.basename(safetyPath))}`
    );
  }

  // Meta file cross-check
  const meta = loadMetaFile();
  if (meta && messageStore.length > 0) {
    const lastId = messageStore[
      messageStore.length - 1
    ].id;
    if (meta.lastWrittenId !== lastId) {
      console.warn(
        `   ⚠️  Meta says lastWrittenId=`
        + `${meta.lastWrittenId} but store `
        + `ends at id=${lastId}`
      );
    }
  }

}

function emitUnplayedEvents() {
  const playedRefs = new Set();
  for (const msg of messageStore) {
    if (msg.type === 'played') {
      playedRefs.add(msg.refId);
    }
  }
  let emitted = 0;
  for (const msg of messageStore) {
    if (msg.type !== 'played'
        && msg.type !== 'system'
        && msg.source !== 'control'
        && !playedRefs.has(msg.id)) {
      storeMessage({
        source: 'system',
        type: 'played',
        refId: msg.id,
        message: ''
      });
      emitted++;
    }
  }
  if (emitted > 0) {
    console.log(
      `📋 Emitted ${emitted} played event(s) `
      + `for unplayed messages from previous session`
    );
  }
}

function verifyChainOnLoad(preWindowMsg) {
  console.log('🔗 Verifying chain integrity...');
  let verified = 0;
  let firstVerified = null;
  let unchainedStart = null;
  let unchainedEnd = null;
  let errors = 0;

  if (preWindowMsg && messageStore.length > 0) {
    const first = messageStore[0];
    if (first.prevHash) {
      if (first.id !== preWindowMsg.id + 1) {
        console.error(
          `   ⛔ ID gap between `
          + `${preWindowMsg.id} and ${first.id}`
        );
        errors++;
      } else if (
        first.prevHash !== hashMessage(preWindowMsg)
      ) {
        console.error(
          `   ⛔ Hash mismatch at id ${first.id} `
          + `(window boundary)`
        );
        errors++;
      } else {
        verified++;
        firstVerified = first.id;
      }
    } else {
      unchainedStart = preWindowMsg.id;
      unchainedEnd = first.id;
    }
  }

  for (let i = 1; i < messageStore.length; i++) {
    const prev = messageStore[i - 1];
    const curr = messageStore[i];

    if (!curr.prevHash) {
      if (!unchainedStart) {
        unchainedStart = prev.id;
      }
      unchainedEnd = curr.id;
      continue;
    }

    if (curr.id === prev.id) {
      console.error(
        `   ⛔ Duplicate id ${curr.id}`
      );
      errors++;
    } else if (curr.id < prev.id) {
      console.error(
        `   ⛔ ID regression: `
        + `${prev.id} → ${curr.id}`
      );
      errors++;
    } else if (curr.id !== prev.id + 1) {
      // ID gap — messages were deleted, can't
      // verify hash across the gap
      if (!unchainedStart) {
        unchainedStart = prev.id;
      }
      unchainedEnd = curr.id;
      continue;
    } else if (
      curr.prevHash !== hashMessage(prev)
    ) {
      console.error(
        `   ⛔ Hash mismatch at id ${curr.id}`
      );
      errors++;
    } else {
      verified++;
      if (!firstVerified) {
        firstVerified = curr.id;
      }
    }
  }

  if (unchainedStart !== null) {
    console.log(
      `   ⚠️  Messages ${unchainedStart}–`
      + `${unchainedEnd} lack prevHash `
      + `(pre-chain era)`
    );
  }

  if (errors > 0) {
    console.error(
      `\n⛔ FATAL: ${errors} integrity error(s) `
      + `found. Refusing to start.\n`
      + `   Restore from backup or inspect the `
      + `store file manually.\n`
    );
    process.exit(1);
  }

  if (verified > 0) {
    const lastId = messageStore[
      messageStore.length - 1
    ].id;
    console.log(
      `   ✓ ${verified} messages verified `
      + `(ids ${firstVerified}–${lastId})`
    );
    console.log('   ✓ Chain intact');
  } else if (messageStore.length <= 1) {
    console.log(
      '   ✓ Single message — no chain to verify'
    );
  } else {
    console.log(
      '   ⚠️  No chain data yet '
      + '(will start with next new message)'
    );
  }
}

function enqueueNotification(notification) {
  const position = notificationQueue.length + 1;
  notificationQueue.push(notification);
  if (!isProcessing) processQueue();
  return position;
}

async function processQueue() {
  if (notificationQueue.length === 0) {
    isProcessing = false;
    return;
  }
  isProcessing = true;
  const notification = notificationQueue.shift();

  try {
    const tasks = [];
    if (notification.soundFile) {
      tasks.push(playSound(notification.soundFile));
    }
    tasks.push(
      (async () => {
        await delay(500);
        return vocalizeText(notification.spokenText, notification.voice);
      })()
    );
    await Promise.all(tasks);
  } catch (error) {
    console.error('Error in audio playback:', error.message);
  }

  if (notification.messageId) markPlayed(notification.messageId);

  processQueue(); // process next
}

// Setup keyboard input — called after port is confirmed
function setupPrimaryKeyboard() {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }

  process.stdin.on('keypress', (str, key) => {
    if (key && key.name === 'space') {
      stopAllAudio();
    }
    if (key && key.name === 's') {
      skipCurrent();
    }
    if (key && key.name === 'm') {
      muted = !muted;
      const muteMsg = muted
        ? '🔇 Audio muted'
        : '🔊 Audio unmuted';
      console.log(muted
        ? '\n🔇 Audio muted (notifications still logged)'
        : '\n🔊 Audio unmuted');
      storeMessage({
        source: 'control', type: 'status',
        header: muteMsg, message: ''
      });
    }
    if (key && key.ctrl && key.name === 'c') {
      gracefulShutdown('Ctrl+C');
    }
  });
}

let isPrimaryServer = false;

function gracefulShutdown(signal) {
  console.log(
    `\n📡 ${signal} received, shutting down...`
  );
  if (isPrimaryServer) {
    const msg = storeMessage({
      source: 'system',
      type: 'system',
      header: '🔌 SYSTEM',
      message: 'agent-notify shutting down',
      voice: 'Zarvox'
    });
    // Wait for queue to finish before exiting
    const original = playbackResolvers;
    enqueueNotification({
      soundFile: sound('status.mp3'),
      spokenText: 'agent notify shutting down',
      voice: 'Zarvox',
      messageId: msg.id
    });
    const check = setInterval(() => {
      if (!isProcessing
          && notificationQueue.length === 0) {
        clearInterval(check);
        process.exit(0);
      }
    }, 100);
    return;
  }
  process.exit(0);
}

process.on('SIGTERM', () =>
  gracefulShutdown('SIGTERM')
);
process.on('SIGINT', () =>
  gracefulShutdown('SIGINT')
);

// Function to stop all audio and clear queue
function stopAllAudio() {
  if (!isPlaying && notificationQueue.length === 0) {
    isProcessing = false; // Reset even on early return to prevent stuck state
    return;
  }
  
  console.log('\n🔇 Stopping all audio and clearing queue...');
  
  // Stop afplay
  if (currentPlayer) {
    currentPlayer.kill();
    currentPlayer = null;
  }
  
  // Stop TTS
  if (ttsChild) { ttsChild.kill('SIGKILL'); ttsChild = null; }

  isPlaying = false;

  // Mark cleared queue items as played so no agent gets stuck waiting
  for (const n of notificationQueue) {
    if (n.messageId) markPlayed(n.messageId);
  }

  // Clear the entire queue
  notificationQueue.length = 0;
  isProcessing = false;

  console.log('✓ Audio stopped, queue cleared\n');
  storeMessage({ source: 'control', type: 'status', header: '🔇 Audio stopped, queue cleared', message: '' });
}

// Function to skip current notification (queue continues)
function skipCurrent() {
  if (!isPlaying) {
    return;
  }

  console.log('\n⏭️  Skipping current notification...');

  // Stop afplay
  if (currentPlayer) {
    currentPlayer.kill();
    currentPlayer = null;
  }

  // Stop TTS
  if (ttsChild) { ttsChild.kill('SIGKILL'); ttsChild = null; }

  isPlaying = false;
  storeMessage({ source: 'control', type: 'status', header: '⏭️ Skipped current notification', message: '' });
  // processQueue will pick up the next one
}

// Function to play sound using afplay command directly
function playSound(soundFile) {
  return new Promise((resolve, reject) => {
    const child = execFile('/usr/bin/afplay', [soundFile], (error) => {
      currentPlayer = null;
      if (error) {
        // Don't throw if it was manually killed
        if (error.killed || error.signal) {
          resolve();
          return;
        }
        console.error(`Error playing sound: ${error.message}`);
        reject(error);
      } else {
        resolve();
      }
    });
    currentPlayer = child;
    isPlaying = true;
  });
}

// Function to vocalize text using macOS say command directly
function vocalizeText(text, voice) {
  isPlaying = true;

  return new Promise((resolve) => {
    const args = voice ? ['-v', voice, text] : [text];
    ttsChild = spawn('say', args);

    ttsChild.on('exit', () => {
      ttsChild = null;
      isPlaying = false;
      resolve();
    });

    ttsChild.on('error', (err) => {
      ttsChild = null;
      isPlaying = false;
      console.error(`Error vocalizing text: ${err.message}`);
      resolve(); // resolve, not reject — don't break the queue
    });
  });
}

// Function to delay execution
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Agent notification endpoint
app.get('/notify/agent', async (req, res) => {
  const { type, message, workspaceDir, agentRole, agentNumber, voice, model, to } = req.query;
  const responseTo = req.query.response_to !== undefined ? parseInt(req.query.response_to, 10) : undefined;

  // Validate request
  if (!type || !message) {
    return res.status(400).json({
      error: 'Missing required parameters: type and message'
    });
  }

  // Check if sound exists for this type
  const soundFile = agentSoundMap[type];
  if (!soundFile) {
    return res.status(400).json({
      error: `Unknown notification type: ${type}. Valid types: question, permission, done, error, status, waiting, review, message`
    });
  }

  // Derive project name from workspaceDir
  const project = workspaceDir ? path.basename(workspaceDir) : null;

  // Parse agentNumber as integer if provided
  const agentNum = agentNumber !== undefined ? parseInt(agentNumber, 10) : undefined;

  // Select voice using fallback chain (before console log so we can display it)
  const selectedVoice = selectVoice(agentRole, agentNum, voice);

  // Build console log: emoji-led, type capitalized, message on indented newline
  const emoji = agentEmojiMap[type] || '📨';
  const color = colorMap[type] || '';
  const logParts = [`${emoji} ${type.toUpperCase()}`];
  if (project) logParts.push(`📂 ${project}`);
  if (agentRole || agentNum !== undefined) {
    const rolePart = agentRole || '';
    const numPart = agentNum !== undefined ? `#${agentNum}` : '';
    const agentStr = [rolePart, numPart].filter(Boolean).join(' ');
    logParts.push(`🤖 ${agentStr}`);
  }
  if (to) logParts.push(`→ ${to}`);
  if (model) logParts.push(`🧠 ${model}`);
  if (selectedVoice) logParts.push(`🗣️ ${selectedVoice}`);

  const header = logParts.join(' ');
  clearStickyLink();
  console.log(`${color}${header}${resetColor}`);
  console.log(`\x1b[2m"${message}"${resetColor}\n`);
  printStickyLink();

  // Store message
  const stored = storeMessage({ source: 'agent', header, type, message, project, agentRole, agentNumber: agentNum, model, voice: selectedVoice, to, responseTo });

  // Build TTS spoken string — matches screen reading order
  const ttsParts = [];
  ttsParts.push(type);
  if (workspaceDir) ttsParts.push(project);
  if (agentRole) ttsParts.push(agentRole);
  if (agentNum !== undefined) {
    ttsParts.push(`Agent ${agentNum === 0 ? 'Zero' : agentNum}`);
  }
  ttsParts.push(message);
  const spokenText = ttsParts.join('. ');

  // Skip audio when muted
  if (muted) {
    markPlayed(stored.id);
    return res.json({ success: true, queued: false, reason: 'Audio muted', id: stored.id });
  }

  // Enqueue notification for sequential playback
  const position = enqueueNotification({
    soundFile,
    spokenText,
    voice: selectedVoice,
    messageId: stored.id
  });

  // Return success immediately
  res.json({
    success: true,
    queued: true,
    position,
    id: stored.id
  });
});

// App notification endpoint
app.get('/notify/app', async (req, res) => {
  const { type, message, app: appName, voice, url, project, detail } = req.query;

  // Validate request
  if (!type || !message) {
    return res.status(400).json({
      error: 'Missing required parameters: type and message'
    });
  }

  if (!appName) {
    return res.status(400).json({
      error: 'Missing required parameter: app'
    });
  }

  // Validate type is a valid app log level
  if (!(type in appSoundMap)) {
    return res.status(400).json({
      error: `Unknown app log level: ${type}. Valid levels: trace, debug, info, warn, error, success`
    });
  }

  // Check console log level threshold — if below, completely ignore
  if (!meetsThreshold(type, LOG_LEVEL)) {
    return res.json({
      success: true,
      filtered: true,
      reason: `Below --log-level threshold (${LOG_LEVEL})`
    });
  }

  // Build console log
  const emoji = appEmojiMap[type] || '📨';
  const color = colorMap[type] || '';
  const logParts = [`${emoji} ${type.toUpperCase()}`];
  logParts.push(`📦 ${appName}`);
  if (project) logParts.push(`📂 ${project}`);
  if (detail) logParts.push(`⚙️ ${detail}`);

  const header = logParts.join(' ');
  clearStickyLink();
  console.log(`${color}${header}${resetColor}`);
  console.log(`\x1b[2m"${message}"${resetColor}`);
  if (url) console.log(`\x1b[2m🔗 ${url}${resetColor}`);
  console.log();
  printStickyLink();

  // Store message
  const stored = storeMessage({ source: 'app', header, type, message, project, detail, app: appName, url });

  // Check audio log level threshold — if below, log only (no audio)
  if (!meetsThreshold(type, LOG_LEVEL_AUDIO)) {
    markPlayed(stored.id);
    return res.json({
      success: true,
      queued: false,
      reason: `Below --log-level-audio threshold (${LOG_LEVEL_AUDIO})`,
      id: stored.id
    });
  }

  // Skip audio when muted
  if (muted) {
    markPlayed(stored.id);
    return res.json({ success: true, queued: false, reason: 'Audio muted', id: stored.id });
  }

  // Build TTS spoken string
  const ttsParts = [];
  ttsParts.push(type);
  ttsParts.push(appName);
  if (project) ttsParts.push(project);
  if (detail) ttsParts.push(detail);
  ttsParts.push(message);
  const spokenText = ttsParts.join('. ');

  const soundFile = appSoundMap[type];

  // Enqueue notification for sequential playback
  const position = enqueueNotification({
    soundFile,
    spokenText,
    voice: voice || 'Evan',
    messageId: stored.id
  });

  // Return success immediately
  res.json({
    success: true,
    queued: true,
    position,
    id: stored.id
  });
});

// Operator notification endpoint
app.post('/notify/operator', async (req, res) => {
  const { message, to, project, voice } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({
      error: 'Missing required parameter: message'
    });
  }

  // Build console log
  const color = colorMap['operator'] || '';
  const logParts = ['\uD83E\uDDD1\u200D\uD83D\uDCBB OPERATOR'];
  if (to) logParts.push(`\u2192 ${to}`);
  if (project) logParts.push(`\uD83D\uDCC2 ${project}`);

  const header = logParts.join(' ');
  clearStickyLink();
  console.log(`${color}${header}${resetColor}`);
  console.log(`\x1b[2m"${message.trim()}"${resetColor}\n`);
  printStickyLink();

  const selectedVoice = voice || 'Daniel';

  // Store message
  const stored = storeMessage({
    source: 'operator',
    type: 'operator',
    header,
    message: message.trim(),
    to: to || null,
    project: project || null,
    voice: selectedVoice
  });

  // Skip audio when muted
  if (muted) {
    markPlayed(stored.id);
    return res.json({
      success: true,
      queued: false,
      reason: 'Audio muted',
      id: stored.id
    });
  }

  // Build TTS spoken string
  const ttsParts = ['Operator'];
  if (to) ttsParts.push(`To ${to}`);
  ttsParts.push(message.trim());
  const spokenText = ttsParts.join('. ');

  const soundFile = sound('question.mp3');

  const position = enqueueNotification({
    soundFile,
    spokenText,
    voice: selectedVoice,
    messageId: stored.id
  });

  res.json({
    success: true,
    queued: true,
    position,
    id: stored.id
  });
});

// Message stream endpoint
app.get('/messages', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const sinceId = parseInt(req.query.since_id) || 0;
  const limit = Math.min(parseInt(req.query.limit) || 50, 2000);

  // Filter out played events from results (internal bookkeeping)
  let results = messageStore.filter(
    m => m.id > sinceId && m.type !== 'played'
  );

  // All stored fields are filterable
  const filters = ['type', 'to', 'project', 'source', 'agentRole', 'model', 'voice', 'app'];
  for (const key of filters) {
    if (req.query[key]) results = results.filter(m => m[key] === req.query[key]);
  }
  // agentNumber is numeric
  if (req.query.agentNumber !== undefined) {
    const num = parseInt(req.query.agentNumber, 10);
    if (!isNaN(num)) {
      results = results.filter(m => m.agentNumber === num);
    }
  }
  // response_to is numeric
  if (req.query.response_to !== undefined) {
    const rt = parseInt(req.query.response_to, 10);
    if (!isNaN(rt)) results = results.filter(m => m.responseTo === rt);
  }

  results = results.slice(-limit);

  // Derive last_played_id from played events
  let playedId = 0;
  for (const msg of messageStore) {
    if (msg.type === 'played'
        && msg.refId > playedId) {
      playedId = msg.refId;
    }
  }

  res.json({ messages: results, latest_id: messageIdCounter, last_played_id: playedId, muted: muted });
});

// Lightweight status endpoint (counters only, no message bodies)
app.get('/messages/status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const sinceId = parseInt(req.query.since_id) || 0;

  // Derive last_played_id from played events
  let playedId = 0;
  const playedRefs = new Set();
  for (const msg of messageStore) {
    if (msg.type === 'played'
        && msg.refId > playedId) {
      playedId = msg.refId;
    }
    if (msg.type === 'played') {
      playedRefs.add(msg.refId);
    }
  }

  // Build deduplicated agents array from recent agent messages
  // Identity key: project + agentRole + agentNumber
  const agentMap = new Map();
  for (const msg of messageStore) {
    if (msg.id <= sinceId || msg.source !== 'agent') continue;
    const key = `${msg.project || ''}|${msg.agentRole || ''}|${msg.agentNumber ?? ''}`;
    agentMap.set(key, msg);
  }
  const agents = [];
  for (const msg of agentMap.values()) {
    agents.push({
      project: msg.project || null,
      agentRole: msg.agentRole || null,
      agentNumber: msg.agentNumber ?? null,
      model: msg.model || null,
      voice: msg.voice || null,
      to: msg.to || null,
      latestId: msg.id,
      played: playedRefs.has(msg.id)
    });
  }

  res.json({
    latest_id: messageIdCounter,
    last_played_id: playedId,
    muted: muted,
    has_new: messageIdCounter > sinceId,
    queue_length: notificationQueue.length,
    agents
  });
});

// Bus mode: count all responses to a message
app.get('/responses/available/for/id/:id', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'id required' });

  let n = 0;
  for (const msg of messageStore) {
    if (msg.responseTo === id && msg.id > id) n++;
  }
  res.json({ n });
});

// Conversational mode: count only heard responses
app.get(
  '/responses/observed/for/id/:id',
  (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400)
        .json({ error: 'id required' });
    }

    // Find reply message IDs
    const replyIds = new Set();
    for (const msg of messageStore) {
      if (msg.responseTo === id && msg.id > id) {
        replyIds.add(msg.id);
      }
    }

    // Count replies that have been played
    let n = 0;
    for (const msg of messageStore) {
      if (msg.type === 'played'
          && replyIds.has(msg.refId)) {
        n++;
      }
    }
    res.json({ n });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Agent notification server is running' });
});

// Remote control endpoints (used by watch mode)
app.post('/controls/stop', (req, res) => {
  stopAllAudio();
  res.json({ success: true, action: 'stop' });
});

app.post('/controls/skip', (req, res) => {
  skipCurrent();
  res.json({ success: true, action: 'skip' });
});

app.post('/controls/mute', (req, res) => {
  muted = !muted;
  const muteMsg = muted ? '🔇 Audio muted' : '🔊 Audio unmuted';
  console.log(muted ? '\n🔇 Audio muted (notifications still logged)' : '\n🔊 Audio unmuted');
  storeMessage({ source: 'control', type: 'status', header: muteMsg, message: '' });
  res.json({ success: true, action: 'mute', muted: muted });
});

// Watch mode — display-only client that polls the primary server
async function startWatchMode() {
  const baseUrl = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  console.log('👁️  Watch Mode — display only, no audio');
  console.log(`📡 Watching ${baseUrl}/messages`);
  console.log(`💾 Store: ${osc8(STORE_DIR)}`);
  console.log('\n⌨️  Keyboard Controls (remote):');
  console.log('   - Press [SPACE] to stop all audio and clear queue');
  console.log('   - Press [S] to skip current notification');
  console.log('   - Press [M] to mute/unmute agent messages');
  console.log('   - Press [Ctrl+C] to exit\n');

  // Setup keyboard input for remote control
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.on('keypress', async (str, key) => {
    if (key && key.name === 'space') {
      try { await fetch(`${baseUrl}/controls/stop`, { method: 'POST' }); }
      catch { /* server unreachable */ }
    }
    if (key && key.name === 's') {
      try { await fetch(`${baseUrl}/controls/skip`, { method: 'POST' }); }
      catch { /* server unreachable */ }
    }
    if (key && key.name === 'm') {
      try { await fetch(`${baseUrl}/controls/mute`, { method: 'POST' }); }
      catch { /* server unreachable */ }
    }
    if (key && key.ctrl && key.name === 'c') {
      console.log('\n👋 Exiting watch mode...');
      process.exit();
    }
  });

  let sinceId = 0;
  let lastMuted = null;

  // Initial fetch — show last 4 messages
  try {
    const res = await fetch(
      `${baseUrl}/messages?since_id=0&limit=200`
    );
    const data = await res.json();
    sinceId = data.latest_id || 0;
    lastMuted = data.muted;

    const recent = (data.messages || [])
      .filter(m => m.type !== 'system')
      .slice(-4);
    if (recent.length > 0) {
      const sep = '─'.repeat(50);
      console.log(
        `\n📜 Last ${recent.length} messages:`
      );
      console.log(
        `\x1b[2m${sep}${resetColor}\n`
      );
      for (const msg of recent) {
        const color = colorMap[msg.type] || '';
        const header = msg.header
          || `🔌 ${msg.type.toUpperCase()}`;
        console.log(
          `${color}${header}${resetColor}`
        );
        if (msg.message) {
          console.log(
            `\x1b[2m"${msg.message}"${resetColor}`
          );
        }
        console.log();
      }
      const lastTs = recent[
        recent.length - 1
      ].timestamp;
      console.log(
        `Last message received at ${lastTs}`
      );
      console.log(
        `\x1b[2m${sep}${resetColor}\n`
      );
    }
    printStickyLink();
  } catch (e) {
    console.error(
      `❌ Cannot connect to ${baseUrl}`
      + ` — is the server running?`
    );
    process.exit(1);
  }

  // Poll loop
  setInterval(async () => {
    try {
      const res = await fetch(`${baseUrl}/messages?since_id=${sinceId}`);
      const data = await res.json();
      if (data.messages.length > 0) {
        clearStickyLink();
      }
      for (const msg of data.messages) {
        const color = colorMap[msg.type] || '';
        console.log(`${color}${msg.header}${resetColor}`);
        if (msg.message) console.log(`\x1b[2m"${msg.message}"${resetColor}`);
        if (msg.url) console.log(`\x1b[2m🔗 ${msg.url}${resetColor}`);
        console.log();
      }
      if (data.messages.length > 0) {
        printStickyLink();
      }
      if (data.latest_id) sinceId = data.latest_id;
      // Sync mute state — show change if it happened without a control message
      if (lastMuted !== null && data.muted !== lastMuted && data.messages.length === 0) {
        console.log(data.muted ? '🔇 Audio muted' : '🔊 Audio unmuted');
        console.log();
      }
      lastMuted = data.muted;
    } catch (e) {
      // Silent — primary server may have restarted
    }
  }, 1000);
}

// Handle --clear before anything else (server only)
async function handleClear() {
  if (!fs.existsSync(MESSAGE_STORE_PATH)) {
    console.log('🗑️  Nothing to clear');
    return;
  }
  const ts = new Date().toISOString()
    .replace(/[:.]/g, '-');
  const backupName =
    `messages.pre-clear.${ts}.jsonl`;
  const backup = path.join(STORE_DIR, backupName);
  console.log(
    `🛡️  Backup → ${osc8(STORE_DIR, path.basename(STORE_DIR) + '/' + backupName)}`
  );
  const confirmed = await clearStoreConfirm();
  if (!confirmed) {
    console.log('Aborted.');
    process.exit(0);
  }
  fs.copyFileSync(MESSAGE_STORE_PATH, backup);
  console.log('🛡️  Backup saved');
  for (const f of [
    MESSAGE_STORE_PATH, META_PATH
  ]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  console.log('🗑️  Store cleared');
}

// Startup sequence — runs inside listen callback
async function startSequence() {
  if (CLEAR) await handleClear();
  loadMessageStore();
}

function renderRecentMessages() {
  if (messageStore.length === 0) return;
  const realMessages = messageStore.filter(
    m => m.type !== 'played'
      && m.type !== 'system'
  );
  const recent = realMessages.slice(-4);
  if (recent.length === 0) return;
  const sep = '─'.repeat(50);
  console.log(
    `\n📜 Last ${recent.length} messages `
    + `before shutdown:`
  );
  console.log(`\x1b[2m${sep}${resetColor}\n`);
  for (const msg of recent) {
    const color = colorMap[msg.type] || '';
    const header = msg.header
      || `🔌 ${msg.type.toUpperCase()}`;
    console.log(
      `${color}${header}${resetColor}`
    );
    if (msg.message) {
      console.log(
        `\x1b[2m"${msg.message}"${resetColor}`
      );
    }
    console.log();
  }
  const lastTs = recent[
    recent.length - 1
  ].timestamp;
  console.log(
    `Last message received at ${lastTs}`
  );
  console.log(
    `\x1b[2m${sep}${resetColor}\n`
  );
}

// CLI confirmation prompt (store banner + y/N)
async function startupConfirm() {
  console.log(
    `💾 Store: ${osc8(STORE_DIR)}`
  );
  console.log(
    `   ${messageStore.length} messages in memory, `
    + `latestId: ${messageIdCounter}`
  );

  if (YES) {
    setupPrimaryKeyboard();
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(
      '   Accept store and start server? [y/N] ',
      (answer) => {
      rl.close();
      if (answer.toLowerCase() !== 'y') {
        console.log('Aborted.');
        process.exit(0);
      }
      setupPrimaryKeyboard();
      resolve();
    });
  });
}

// Start server (or watch mode)
if (WATCH_MODE) {
  startWatchMode();
} else {
  const server = app.listen(PORT, HOST);
  let portConfirmed = false;
  server.on('listening', async () => {
    portConfirmed = true;
    // Port confirmed — load store, then confirm
    await startSequence();
    await startupConfirm();
    isPrimaryServer = true;
    emitUnplayedEvents();
    const startupMsg = storeMessage({
      source: 'system',
      type: 'system',
      header: '🔌 SYSTEM',
      message: 'agent-notify started',
      voice: 'Zarvox'
    });
    enqueueNotification({
      soundFile: sound('status.mp3'),
      spokenText: 'agent notify started',
      voice: 'Zarvox',
      messageId: startupMsg.id
    });

    console.log('🚀 Agent Notification Server Started');
    console.log(`📡 Listening on http://${HOST}:${PORT}`);
    console.log(`🔊 Sound files directory: ${path.resolve('./sounds')}`);
    console.log('\n🤖 Agent endpoint: /notify/agent');
    console.log('   Types: question, permission, done, error, status, waiting, review, message');
    console.log('\n📦 App endpoint: /notify/app');
    console.log('   Levels: debug, info, warn, error, success');
    console.log(`   --log-level: ${LOG_LEVEL} (console threshold)`);
    console.log(`   --log-level-audio: ${LOG_LEVEL_AUDIO} (audio threshold)`);
    console.log('\n🔄 Notification queue: sequential playback, no overlap');
    console.log(`\n💾 Message store: ${messageStore.length} messages loaded`);
    console.log('   GET /messages — query the message stream');
    console.log('\n⌨️  Keyboard Controls:');
    console.log('   - Press [SPACE] to stop all audio and clear queue');
    console.log('   - Press [S] to skip current notification');
    console.log('   - Press [M] to mute/unmute agent messages');
    console.log('   - Press [Ctrl+C] to exit');
    console.log('\n✨ Ready to receive notifications!\n');
    renderRecentMessages();
    printStickyLink();
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  Port ${PORT} already in use — switching to watch mode\n`);
      startWatchMode();
    } else {
      throw err;
    }
  });
}
