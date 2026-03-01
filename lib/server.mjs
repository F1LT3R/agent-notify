import express from 'express';
import { execFile } from 'child_process';
import say from 'say';
import readline from 'readline';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let address = '0.0.0.0:8881'; // default
  let logLevel = 'info';
  let logLevelAudio = 'info';
  
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
    logLevelAudio
  };
}

const { host: HOST, port: PORT, logLevel: LOG_LEVEL, logLevelAudio: LOG_LEVEL_AUDIO } = parseArgs();

// Log level hierarchy (lowest to highest)
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, success: 4 };

function meetsThreshold(type, threshold) {
  const typeLevel = LOG_LEVELS[type];
  const thresholdLevel = LOG_LEVELS[threshold];
  if (typeLevel === undefined || thresholdLevel === undefined) return true;
  return typeLevel >= thresholdLevel;
}

// Agent sound file mappings
const agentSoundMap = {
  'question': './sounds/question.mp3',
  'permission': './sounds/permission.mp3',
  'done': './sounds/done.mp3',
  'error': './sounds/error.mp3',
  'status': './sounds/status.mp3',
  'waiting': './sounds/waiting.mp3',
  'review': './sounds/review.mp3',
  'message': './sounds/status.mp3'
};

// App sound file mappings
const appSoundMap = {
  'debug': null,
  'info': './sounds/status.mp3',
  'warn': './sounds/waiting.mp3',
  'error': './sounds/error.mp3',
  'success': './sounds/done.mp3'
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
  'debug': '\x1b[90m',       // Gray
  'info': '\x1b[36m',        // Cyan
  'warn': '\x1b[33m',        // Yellow
  'success': '\x1b[32m',      // Green
  'message': '\x1b[37m'       // White
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
let isPlaying = false;

// Notification queue
const notificationQueue = [];
let isProcessing = false;

// Message store
const messageStore = [];
let messageIdCounter = 0;
const MAX_MESSAGES = 500;
const FLUSH_INTERVAL = 50;
const MESSAGE_STORE_PATH = path.join(__dirname, '..', '.message-store.json');

// Mute toggle for agent messages
let muteMessages = false;

const playbackResolvers = new Map();

function storeMessage(entry) {
  const stored = {
    id: ++messageIdCounter,
    timestamp: new Date().toISOString(),
    playedAt: null,
    ...entry
  };
  messageStore.push(stored);
  if (messageStore.length > MAX_MESSAGES) messageStore.shift();
  if (messageStore.length % FLUSH_INTERVAL === 0) {
    saveMessageStore();
  }
  return stored;
}

function markPlayed(messageId) {
  const msg = messageStore.find(m => m.id === messageId);
  if (msg) msg.playedAt = new Date().toISOString();
  const resolve = playbackResolvers.get(messageId);
  if (resolve) {
    resolve();
    playbackResolvers.delete(messageId);
  }
}

function loadMessageStore() {
  try {
    const data = fs.readFileSync(MESSAGE_STORE_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    messageStore.push(...parsed.messages);
    messageIdCounter = parsed.latestId || 0;
    while (messageStore.length > MAX_MESSAGES) messageStore.shift();
    // Mark any unplayed messages as played — they're from a previous server
    // session and won't be replayed, so unblock any polling orchestrators.
    const now = new Date().toISOString();
    let marked = 0;
    for (const msg of messageStore) {
      if (!msg.playedAt) {
        msg.playedAt = now;
        marked++;
      }
    }
    if (marked > 0) {
      console.log(`📋 Marked ${marked} unplayed message(s) from previous session as played`);
      saveMessageStore();
    }
  } catch { /* file doesn't exist yet, start fresh */ }
}

function saveMessageStore() {
  try {
    fs.writeFileSync(MESSAGE_STORE_PATH, JSON.stringify({
      messages: messageStore,
      latestId: messageIdCounter
    }));
  } catch (err) {
    console.error('Failed to save message store:', err.message);
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

// Setup keyboard input
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

// Listen for key presses
process.stdin.on('keypress', (str, key) => {
  // Press spacebar to stop all audio and clear queue
  if (key && key.name === 'space') {
    stopAllAudio();
  }

  // Press 's' to skip current notification
  if (key && key.name === 's') {
    skipCurrent();
  }
  
  // Press 'm' to mute/unmute agent messages
  if (key && key.name === 'm') {
    muteMessages = !muteMessages;
    console.log(muteMessages ? '\n🔇 Agent messages muted (notifications still active)' : '\n🔊 Agent messages unmuted');
  }

  // Press Ctrl+C to exit
  if (key && key.ctrl && key.name === 'c') {
    console.log('\n👋 Shutting down...');
    saveMessageStore();
    process.exit();
  }
});

process.on('SIGTERM', () => {
  console.log('\n👋 Received SIGTERM, shutting down...');
  saveMessageStore();
  process.exit();
});

// Function to stop all audio and clear queue
function stopAllAudio() {
  if (!isPlaying && notificationQueue.length === 0) {
    return;
  }
  
  console.log('\n🔇 Stopping all audio and clearing queue...');
  
  // Stop afplay
  if (currentPlayer) {
    currentPlayer.kill();
    currentPlayer = null;
  }
  
  // Stop say
  say.stop();
  
  isPlaying = false;

  // Mark cleared queue items as played so no agent gets stuck waiting
  for (const n of notificationQueue) {
    if (n.messageId) markPlayed(n.messageId);
  }

  // Clear the entire queue
  notificationQueue.length = 0;
  isProcessing = false;

  console.log('✓ Audio stopped, queue cleared\n');
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

  // Stop say
  say.stop();

  isPlaying = false;
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

// Function to vocalize text using say package
function vocalizeText(text, voice) {
  isPlaying = true;

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        isPlaying = false;
        console.warn('⚠️  TTS timed out after 60s — resolving to unblock queue');
        resolve();
      }
    }, 60000);

    say.speak(text, voice || null, null, (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      isPlaying = false;

      if (err) {
        // Don't throw if it was manually stopped (killed flag or SIGTERM signal)
        if (err.killed || err.signal === 'SIGTERM' || (err.message && err.message.includes('SIGTERM'))) {
          resolve();
          return;
        }
        console.error(`Error vocalizing text: ${err.message}`);
        reject(err);
      } else {
        // Text vocalized silently
        resolve();
      }
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
  console.log(`${color}${header}${resetColor}`);
  console.log(`\x1b[2m"${message}"${resetColor}\n`);

  // Store message
  const stored = storeMessage({ source: 'agent', header, type, message, project, agentRole, agentNumber: agentNum, model, voice: selectedVoice, to });

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

  // Skip audio for muted agent messages
  if (muteMessages && type === 'message') {
    markPlayed(stored.id);
    return res.json({ success: true, queued: false, reason: 'Agent messages muted', id: stored.id });
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
  const { type, message, app: appName, voice, url } = req.query;

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
      error: `Unknown app log level: ${type}. Valid levels: debug, info, warn, error, success` 
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

  const header = logParts.join(' ');
  console.log(`${color}${header}${resetColor}`);
  console.log(`\x1b[2m"${message}"${resetColor}`);
  if (url) console.log(`\x1b[2m🔗 ${url}${resetColor}`);
  console.log();

  // Store message
  const stored = storeMessage({ source: 'app', header, type, message, app: appName, url });

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

  // Build TTS spoken string
  const ttsParts = [];
  ttsParts.push(type);
  ttsParts.push(appName);
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

// Message stream endpoint
app.get('/messages', (req, res) => {
  const sinceId = parseInt(req.query.since_id) || 0;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);

  let results = messageStore.filter(m => m.id > sinceId);

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

  results = results.slice(-limit);

  let playedId = 0;
  for (let i = messageStore.length - 1; i >= 0; i--) {
    if (messageStore[i].playedAt) {
      playedId = messageStore[i].id;
      break;
    }
  }

  res.json({ messages: results, latest_id: messageIdCounter, played_id: playedId });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Agent notification server is running' });
});

// Load persisted messages before starting
loadMessageStore();

// Start server
app.listen(PORT, HOST, () => {
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
});
