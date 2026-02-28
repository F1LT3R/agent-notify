import express from 'express';
import { execFile } from 'child_process';
import say from 'say';
import readline from 'readline';
import path from 'path';
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
  'review': './sounds/review.mp3'
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
  'review': '👁️'
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
  'success': '\x1b[32m'      // Green
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
  
  // Press Ctrl+C to exit
  if (key && key.ctrl && key.name === 'c') {
    console.log('\n👋 Shutting down...');
    process.exit();
  }
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
    say.speak(text, voice || null, null, (err) => {
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
  const { type, message, workspaceDir, agentRole, agentNumber, voice, model } = req.query;

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
      error: `Unknown notification type: ${type}. Valid types: question, permission, done, error, status, waiting, review` 
    });
  }

  // Derive project name from workspaceDir
  const project = workspaceDir ? path.basename(workspaceDir) : null;

  // Parse agentNumber as integer if provided
  const agentNum = agentNumber !== undefined ? parseInt(agentNumber, 10) : undefined;

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
  if (model) logParts.push(`🧠 ${model}`);
  console.log(`${color}${logParts.join(' ')}${resetColor}`);
  console.log(`\x1b[2m"${message}"${resetColor}\n`);

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

  // Select voice using fallback chain
  const selectedVoice = selectVoice(agentRole, agentNum, voice);

  // Enqueue notification for sequential playback
  const position = enqueueNotification({
    soundFile,
    spokenText,
    voice: selectedVoice
  });

  // Return success immediately
  res.json({ 
    success: true, 
    queued: true,
    position
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
  console.log(`${color}${logParts.join(' ')}${resetColor}`);
  console.log(`\x1b[2m"${message}"${resetColor}`);
  if (url) console.log(`\x1b[2m🔗 ${url}${resetColor}`);
  console.log();

  // Check audio log level threshold — if below, log only (no audio)
  if (!meetsThreshold(type, LOG_LEVEL_AUDIO)) {
    return res.json({ 
      success: true, 
      queued: false,
      reason: `Below --log-level-audio threshold (${LOG_LEVEL_AUDIO})`
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
    voice: voice || 'Evan'  // Default to Lee (American) for apps
  });

  // Return success immediately
  res.json({ 
    success: true, 
    queued: true,
    position
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Agent notification server is running' });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log('🚀 Agent Notification Server Started');
  console.log(`📡 Listening on http://${HOST}:${PORT}`);
  console.log(`🔊 Sound files directory: ${path.resolve('./sounds')}`);
  console.log('\n🤖 Agent endpoint: /notify/agent');
  console.log('   Types: question, permission, done, error, status, waiting, review');
  console.log('\n📦 App endpoint: /notify/app');
  console.log('   Levels: debug, info, warn, error, success');
  console.log(`   --log-level: ${LOG_LEVEL} (console threshold)`);
  console.log(`   --log-level-audio: ${LOG_LEVEL_AUDIO} (audio threshold)`);
  console.log('\n🔄 Notification queue: sequential playback, no overlap');
  console.log('\n⌨️  Keyboard Controls:');
  console.log('   - Press [SPACE] to stop all audio and clear queue');
  console.log('   - Press [S] to skip current notification');
  console.log('   - Press [Ctrl+C] to exit');
  console.log('\n✨ Ready to receive notifications!\n');
});
