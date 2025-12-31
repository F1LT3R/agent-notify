import express from 'express';
import Afplay from 'afplay';
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
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--address' && i + 1 < args.length) {
      address = args[i + 1];
      break;
    }
  }
  
  // Parse host and port from address
  const [host, port] = address.includes(':') 
    ? address.split(':') 
    : ['0.0.0.0', address]; // if no colon, treat as port only
    
  return {
    host: host || '0.0.0.0',
    port: parseInt(port) || 8881
  };
}

const { host: HOST, port: PORT } = parseArgs();

// Sound file mappings
const soundMap = {
  'question': './sounds/question.mp3',
  'permission': './sounds/permission.mp3',
  'done': './sounds/done.mp3',
  'error': './sounds/error.mp3',
  'status': './sounds/status.mp3',
  'waiting': './sounds/waiting.mp3'
};

// Emoji mappings for different notification types
const emojiMap = {
  'question': '❓',
  'permission': '🔐',
  'done': '✅',
  'error': '❌',
  'status': '📡',
  'waiting': '⏳'
};

// Color mappings for different notification types
const colorMap = {
  'question': '\x1b[33m',    // Yellow
  'permission': '\x1b[35m',  // Magenta
  'done': '\x1b[32m',        // Green
  'error': '\x1b[31m',       // Red
  'status': '\x1b[36m',      // Cyan
  'waiting': '\x1b[34m'      // Blue
};
const resetColor = '\x1b[0m'; // Reset to default


// Track currently playing audio
let currentPlayer = null;
let isPlaying = false;

// Setup keyboard input
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

// Listen for key presses
process.stdin.on('keypress', (str, key) => {
  // Press 's' or spacebar to stop
  if (key && (key.name === 's' || key.name === 'space')) {
    stopAllAudio();
  }
  
  // Press Ctrl+C to exit
  if (key && key.ctrl && key.name === 'c') {
    console.log('\n👋 Shutting down...');
    process.exit();
  }
});

// Function to stop all audio
function stopAllAudio() {
  if (!isPlaying) {
    return;
  }
  
  console.log('\n🔇 Stopping all audio...');
  
  // Stop afplay
  if (currentPlayer) {
    currentPlayer.kill();
    currentPlayer = null;
  }
  
  // Stop say
  say.stop();
  
  isPlaying = false;
  console.log('✓ Audio stopped\n');
}

// Function to play sound using afplay package
function playSound(soundFile) {
  const player = new Afplay();
  currentPlayer = player;
  isPlaying = true;
  
  return player.play(soundFile)
    .then(() => {
      // Sound played silently
      currentPlayer = null;
    })
    .catch((error) => {
      currentPlayer = null;
      // Don't throw if it was manually stopped
      if (error.killed) {
        return;
      }
      console.error(`Error playing sound: ${error.message}`);
      throw error;
    });
}

// Function to vocalize text using say package
function vocalizeText(text) {
  isPlaying = true;
  
  return new Promise((resolve, reject) => {
    say.speak(text, null, null, (err) => {
      isPlaying = false;
      
      if (err) {
        // Don't throw if it was manually stopped
        if (err.killed) {
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
app.get('/agent-notify', async (req, res) => {
  const { type, message } = req.query;

  const emoji = emojiMap[type] || '📨';
  const color = colorMap[type] || '';
  const paddedType = type.toUpperCase().padEnd(10); // Pad to 10 characters for alignment
  console.log(`${color}${emoji} ${paddedType}: "${message}"${resetColor}`);

  // Validate request
  if (!type || !message) {
    return res.status(400).json({ 
      error: 'Missing required parameters: type and message' 
    });
  }

  // Check if sound exists for this type
  const soundFile = soundMap[type];
  if (!soundFile) {
    return res.status(400).json({ 
      error: `Unknown notification type: ${type}. Valid types: question, permission, done, error, status, waiting` 
    });
  }

  // Return success immediately
  res.json({ 
    success: true, 
    message: 'Notification received and processing' 
  });

  // Play audio asynchronously - overlapping
  (async () => {
    try {
      // Start both: notification sound immediately, then speech after a short delay
      await Promise.all([
        playSound(soundFile),
        (async () => {
          await delay(500); // Wait 500ms, then start speaking while sound is still playing
          return vocalizeText(message);
        })()
      ]);
    } catch (error) {
      console.error('Error in audio playback:', error.message);
    }
  })();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Agent notification server is running' });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log('🚀 Agent Notification Server Started');
  console.log(`📡 Listening on http://${HOST}:${PORT}/agent-notify`);
  console.log(`🔊 Sound files directory: ${path.resolve('./sounds')}`);
  console.log('\n📋 Available notification types:');
  console.log('   - question   → plays question.mp3');
  console.log('   - permission → plays permission.mp3');
  console.log('   - done       → plays done.mp3');
  console.log('   - error      → plays error.mp3');
  console.log('   - status     → plays status.mp3');
  console.log('   - waiting    → plays waiting.mp3');
  console.log('\n⌨️  Keyboard Controls:');
  console.log('   - Press [S] or [SPACE] to stop all audio');
  console.log('   - Press [Ctrl+C] to exit');
  console.log('\n✨ Ready to receive agent notifications!\n');
});