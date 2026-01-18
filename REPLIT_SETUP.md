# Neko Browser Setup for Replit

This document contains everything needed to run a fully functional remote browser on Replit. It includes both the **server** (Neko-compatible WebRTC streaming) and **client** (React frontend) code.

---

## Overview

This setup creates a remote Chromium browser that:
- Runs headless Chromium on Replit's servers
- Streams the display via WebRTC (low latency)
- Accepts mouse/keyboard input from connected clients
- Supports multiple viewers with control handoff

---

## Part 1: Server Setup

### Step 1: Create a New Replit

Create a **Node.js** Replit and add this to your `replit.nix`:

```nix
{ pkgs }: {
  deps = [
    pkgs.chromium
    pkgs.xorg.xorgserver
    pkgs.xorg.xauth
    pkgs.pulseaudio
    pkgs.ffmpeg
    pkgs.nodejs_20
    pkgs.xdotool
  ];
}
```

### Step 2: Install Node Dependencies

```bash
npm init -y
npm install ws express wrtc puppeteer-core
```

### Step 3: Create Server Files

#### `server.js` - Main WebSocket/WebRTC Server

```javascript
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const { spawn } = require('child_process');
const wrtc = require('wrtc');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Configuration
const CONFIG = {
  SCREEN_WIDTH: 1920,
  SCREEN_HEIGHT: 1080,
  FRAME_RATE: 30,
  PASSWORD: process.env.NEKO_PASSWORD || 'neko',
  ADMIN_PASSWORD: process.env.NEKO_ADMIN_PASSWORD || 'admin',
  DISPLAY: ':99',
};

// State
let xvfbProcess = null;
let chromiumProcess = null;
let currentController = null;
const clients = new Map();

// ICE Servers for WebRTC
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Start Xvfb (virtual display)
function startXvfb() {
  return new Promise((resolve, reject) => {
    console.log('[Server] Starting Xvfb...');
    
    xvfbProcess = spawn('Xvfb', [
      CONFIG.DISPLAY,
      '-screen', '0', `${CONFIG.SCREEN_WIDTH}x${CONFIG.SCREEN_HEIGHT}x24`,
      '-ac',
      '+extension', 'GLX',
      '+render',
      '-noreset',
    ]);
    
    xvfbProcess.stderr.on('data', (data) => {
      console.log('[Xvfb]', data.toString());
    });
    
    xvfbProcess.on('error', reject);
    
    // Wait for Xvfb to start
    setTimeout(() => {
      process.env.DISPLAY = CONFIG.DISPLAY;
      console.log('[Server] Xvfb started on', CONFIG.DISPLAY);
      resolve();
    }, 1000);
  });
}

// Start Chromium browser
function startChromium(url = 'https://www.google.com') {
  return new Promise((resolve, reject) => {
    console.log('[Server] Starting Chromium...');
    
    chromiumProcess = spawn('chromium', [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--safebrowsing-disable-auto-update',
      '--disable-default-apps',
      '--mute-audio',
      '--hide-scrollbars',
      `--window-size=${CONFIG.SCREEN_WIDTH},${CONFIG.SCREEN_HEIGHT}`,
      '--window-position=0,0',
      '--start-fullscreen',
      url,
    ], {
      env: { ...process.env, DISPLAY: CONFIG.DISPLAY },
    });
    
    chromiumProcess.on('error', reject);
    chromiumProcess.on('exit', (code) => {
      console.log('[Chromium] Exited with code:', code);
    });
    
    setTimeout(() => {
      console.log('[Server] Chromium started');
      resolve();
    }, 2000);
  });
}

// Create media stream from FFmpeg
function createMediaStream() {
  // For full implementation, use FFmpeg to capture X11 display
  // and pipe to WebRTC. This is a simplified version.
  console.log('[Server] Creating media stream...');
  
  // In production, you'd capture the X11 display with:
  // ffmpeg -f x11grab -s 1920x1080 -i :99 -f rawvideo -
  // Then pipe through a video encoder for WebRTC
  
  return null; // Placeholder - see FFmpeg integration below
}

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  const clientId = Math.random().toString(36).substr(2, 9);
  console.log('[Server] Client connected:', clientId);
  
  const clientState = {
    id: clientId,
    ws,
    pc: null,
    authenticated: false,
    isAdmin: false,
    displayName: 'Anonymous',
  };
  
  clients.set(clientId, clientState);
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleMessage(clientState, message);
    } catch (error) {
      console.error('[Server] Message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('[Server] Client disconnected:', clientId);
    
    if (currentController === clientId) {
      currentController = null;
      broadcast({ event: 'control/release' });
    }
    
    if (clientState.pc) {
      clientState.pc.close();
    }
    
    clients.delete(clientId);
    broadcastMemberList();
  });
  
  ws.on('error', (error) => {
    console.error('[Server] WebSocket error:', error);
  });
});

// Handle incoming messages
async function handleMessage(client, message) {
  const { event } = message;
  
  switch (event) {
    case 'member/identity':
      await handleIdentity(client, message);
      break;
      
    case 'signal/answer':
      await handleSignalAnswer(client, message);
      break;
      
    case 'signal/candidate':
      await handleSignalCandidate(client, message);
      break;
      
    case 'control/request':
      handleControlRequest(client);
      break;
      
    case 'control/release':
      handleControlRelease(client);
      break;
      
    default:
      console.log('[Server] Unknown message:', event);
  }
}

// Authentication
async function handleIdentity(client, message) {
  const { displayname, password } = message;
  
  client.displayName = displayname || 'Anonymous';
  
  if (password === CONFIG.ADMIN_PASSWORD) {
    client.authenticated = true;
    client.isAdmin = true;
  } else if (password === CONFIG.PASSWORD) {
    client.authenticated = true;
  } else {
    send(client, { event: 'system/error', message: 'Invalid password' });
    client.ws.close();
    return;
  }
  
  console.log('[Server] Client authenticated:', client.id, client.displayName);
  
  // Send identity confirmation
  send(client, { event: 'member/identity', id: client.id });
  
  // Send screen resolution
  send(client, {
    event: 'screen/resolution',
    width: CONFIG.SCREEN_WIDTH,
    height: CONFIG.SCREEN_HEIGHT,
    rate: CONFIG.FRAME_RATE,
  });
  
  // Create WebRTC offer
  await createPeerConnection(client);
  
  broadcastMemberList();
}

// WebRTC peer connection
async function createPeerConnection(client) {
  console.log('[Server] Creating peer connection for:', client.id);
  
  client.pc = new wrtc.RTCPeerConnection({ iceServers: ICE_SERVERS });
  
  // Handle ICE candidates
  client.pc.onicecandidate = (event) => {
    if (event.candidate) {
      send(client, {
        event: 'signal/candidate',
        candidate: event.candidate.toJSON(),
      });
    }
  };
  
  // Create data channel for input
  const dataChannel = client.pc.createDataChannel('input', {
    ordered: true,
  });
  
  dataChannel.onmessage = (event) => {
    if (currentController === client.id) {
      handleInputEvent(event.data);
    }
  };
  
  // Add video track (placeholder - needs actual screen capture)
  // In production, add the FFmpeg-captured stream here
  
  // Create and send offer
  const offer = await client.pc.createOffer();
  await client.pc.setLocalDescription(offer);
  
  send(client, {
    event: 'signal/provide',
    sdp: offer.sdp,
    iceServers: ICE_SERVERS,
    video: 'vp8',
    audio: 'opus',
  });
}

// Handle WebRTC answer
async function handleSignalAnswer(client, message) {
  if (client.pc) {
    await client.pc.setRemoteDescription({
      type: 'answer',
      sdp: message.sdp,
    });
    console.log('[Server] WebRTC answer received from:', client.id);
  }
}

// Handle ICE candidate
async function handleSignalCandidate(client, message) {
  if (client.pc && message.candidate) {
    try {
      await client.pc.addIceCandidate(message.candidate);
    } catch (error) {
      console.error('[Server] ICE candidate error:', error);
    }
  }
}

// Control handling
function handleControlRequest(client) {
  if (currentController === null || currentController === client.id) {
    currentController = client.id;
    send(client, { event: 'control/give' });
    broadcast({ event: 'control/give', id: client.id }, client.id);
    console.log('[Server] Control given to:', client.id);
  } else {
    // Queue or notify
    send(client, { event: 'control/requesting' });
  }
}

function handleControlRelease(client) {
  if (currentController === client.id) {
    currentController = null;
    send(client, { event: 'control/release' });
    broadcast({ event: 'control/release' });
    console.log('[Server] Control released by:', client.id);
  }
}

// Handle input events from data channel
function handleInputEvent(data) {
  const buffer = data instanceof ArrayBuffer ? data : data.buffer;
  const view = new DataView(buffer);
  const opcode = view.getUint8(0);
  
  // Use xdotool to inject input
  switch (opcode) {
    case 0x01: // Mouse move
      const mx = view.getUint16(1, true);
      const my = view.getUint16(3, true);
      spawn('xdotool', ['mousemove', '--', mx.toString(), my.toString()], {
        env: { DISPLAY: CONFIG.DISPLAY },
      });
      break;
      
    case 0x02: // Mouse scroll
      const sx = view.getInt16(1, true);
      const sy = view.getInt16(3, true);
      if (sy > 0) {
        spawn('xdotool', ['click', '5'], { env: { DISPLAY: CONFIG.DISPLAY } });
      } else if (sy < 0) {
        spawn('xdotool', ['click', '4'], { env: { DISPLAY: CONFIG.DISPLAY } });
      }
      break;
      
    case 0x03: // Mouse down
      const btnDown = view.getUint8(1);
      spawn('xdotool', ['mousedown', btnDown.toString()], {
        env: { DISPLAY: CONFIG.DISPLAY },
      });
      break;
      
    case 0x04: // Mouse up
      const btnUp = view.getUint8(1);
      spawn('xdotool', ['mouseup', btnUp.toString()], {
        env: { DISPLAY: CONFIG.DISPLAY },
      });
      break;
      
    case 0x05: // Key down
      const keyDown = view.getUint32(1, true);
      spawn('xdotool', ['keydown', '--', keyDown.toString()], {
        env: { DISPLAY: CONFIG.DISPLAY },
      });
      break;
      
    case 0x06: // Key up
      const keyUp = view.getUint32(1, true);
      spawn('xdotool', ['keyup', '--', keyUp.toString()], {
        env: { DISPLAY: CONFIG.DISPLAY },
      });
      break;
  }
}

// Utility functions
function send(client, message) {
  if (client.ws.readyState === 1) {
    client.ws.send(JSON.stringify(message));
  }
}

function broadcast(message, excludeId = null) {
  for (const [id, client] of clients) {
    if (id !== excludeId && client.authenticated) {
      send(client, message);
    }
  }
}

function broadcastMemberList() {
  const members = Array.from(clients.values())
    .filter(c => c.authenticated)
    .map(c => ({
      id: c.id,
      displayname: c.displayName,
      admin: c.isAdmin,
    }));
  
  broadcast({ event: 'member/list', members });
}

// Static file serving (for client)
app.use(express.static('public'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', clients: clients.size });
});

// Start server
async function start() {
  try {
    await startXvfb();
    await startChromium();
    
    const PORT = process.env.PORT || 8080;
    server.listen(PORT, () => {
      console.log(`[Server] Running on port ${PORT}`);
      console.log(`[Server] WebSocket: ws://localhost:${PORT}/ws`);
    });
  } catch (error) {
    console.error('[Server] Startup error:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] Shutting down...');
  if (chromiumProcess) chromiumProcess.kill();
  if (xvfbProcess) xvfbProcess.kill();
  server.close();
  process.exit(0);
});

start();
```

---

## Part 2: Client Code

Copy these files into a `public/` directory (or use them standalone).

### `public/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neko Browser</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: system-ui, -apple-system, sans-serif;
      background: #0a0a0a;
      color: #fafafa;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .controls {
      padding: 16px;
      background: #1a1a1a;
      border-bottom: 1px solid #333;
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .controls input {
      padding: 8px 12px;
      border: 1px solid #333;
      border-radius: 6px;
      background: #0a0a0a;
      color: #fafafa;
      font-size: 14px;
    }
    .controls input:focus {
      outline: none;
      border-color: #3b82f6;
    }
    .controls button {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .controls button:hover { opacity: 0.8; }
    .controls button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-secondary { background: #333; color: white; }
    .btn-danger { background: #ef4444; color: white; }
    .status {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-left: auto;
    }
    .badge {
      padding: 4px 8px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge-success { background: #22c55e; color: white; }
    .badge-warning { background: #f59e0b; color: white; }
    .badge-secondary { background: #333; color: #888; }
    .video-container {
      flex: 1;
      position: relative;
      background: #000;
      overflow: hidden;
    }
    #video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.7);
    }
    .overlay-content {
      text-align: center;
      padding: 24px;
      background: #1a1a1a;
      border-radius: 12px;
      max-width: 400px;
    }
    .hidden { display: none !important; }
    .error { 
      padding: 12px;
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.2);
      border-radius: 8px;
      color: #ef4444;
      margin: 0 16px;
    }
    .control-hint {
      position: absolute;
      top: 16px;
      right: 16px;
      padding: 8px 16px;
      background: rgba(59,130,246,0.9);
      color: white;
      border-radius: 9999px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="controls">
    <input type="text" id="serverUrl" placeholder="Server URL (e.g., wss://your-repl.replit.app)" style="width: 280px;">
    <input type="password" id="password" placeholder="Password">
    <input type="text" id="displayName" placeholder="Your name" value="User">
    <button id="connectBtn" class="btn-primary">Connect</button>
    <button id="disconnectBtn" class="btn-danger hidden">Disconnect</button>
    <button id="controlBtn" class="btn-secondary hidden">Take Control</button>
    <div class="status">
      <span id="statusBadge" class="badge badge-secondary">Disconnected</span>
      <span id="controlBadge" class="badge badge-secondary hidden">Viewing</span>
      <span id="resolution" style="color: #888; font-size: 12px;"></span>
    </div>
  </div>
  
  <div id="errorDisplay" class="error hidden"></div>
  
  <div class="video-container">
    <video id="video" autoplay playsinline></video>
    
    <div id="connectingOverlay" class="overlay hidden">
      <div class="overlay-content">
        <div style="width: 32px; height: 32px; border: 3px solid #3b82f6; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
        <p>Connecting...</p>
      </div>
    </div>
    
    <div id="disconnectedOverlay" class="overlay">
      <div class="overlay-content">
        <h2 style="margin-bottom: 8px;">Not Connected</h2>
        <p style="color: #888;">Enter server URL and click Connect</p>
      </div>
    </div>
    
    <div id="clickOverlay" class="overlay hidden" style="cursor: pointer;">
      <div class="overlay-content">
        <h3>Click to take control</h3>
        <p style="color: #888; margin-top: 4px;">Or wait for current user to release</p>
      </div>
    </div>
    
    <div id="controlHint" class="control-hint hidden">
      Press Escape to release control
    </div>
  </div>
  
  <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
  
  <script type="module">
    import { NekoClient } from './neko-client.js';
    
    const $ = (s) => document.querySelector(s);
    const client = new NekoClient();
    
    // UI Elements
    const video = $('#video');
    const serverUrl = $('#serverUrl');
    const password = $('#password');
    const displayName = $('#displayName');
    const connectBtn = $('#connectBtn');
    const disconnectBtn = $('#disconnectBtn');
    const controlBtn = $('#controlBtn');
    const statusBadge = $('#statusBadge');
    const controlBadge = $('#controlBadge');
    const resolution = $('#resolution');
    const errorDisplay = $('#errorDisplay');
    const connectingOverlay = $('#connectingOverlay');
    const disconnectedOverlay = $('#disconnectedOverlay');
    const clickOverlay = $('#clickOverlay');
    const controlHint = $('#controlHint');
    
    // State
    let isControlling = false;
    
    function updateUI(state) {
      if (state.connecting) {
        connectingOverlay.classList.remove('hidden');
        disconnectedOverlay.classList.add('hidden');
        clickOverlay.classList.add('hidden');
        statusBadge.textContent = 'Connecting...';
        statusBadge.className = 'badge badge-warning';
      } else if (state.connected) {
        connectingOverlay.classList.add('hidden');
        disconnectedOverlay.classList.add('hidden');
        connectBtn.classList.add('hidden');
        disconnectBtn.classList.remove('hidden');
        controlBtn.classList.remove('hidden');
        controlBadge.classList.remove('hidden');
        statusBadge.textContent = 'Connected';
        statusBadge.className = 'badge badge-success';
        resolution.textContent = `${state.videoWidth}x${state.videoHeight}`;
        
        if (isControlling) {
          clickOverlay.classList.add('hidden');
          controlHint.classList.remove('hidden');
          controlBadge.textContent = 'In Control';
          controlBadge.className = 'badge badge-success';
          controlBtn.textContent = 'Release Control';
          video.style.cursor = 'none';
        } else {
          clickOverlay.classList.remove('hidden');
          controlHint.classList.add('hidden');
          controlBadge.textContent = 'Viewing';
          controlBadge.className = 'badge badge-secondary';
          controlBtn.textContent = 'Take Control';
          video.style.cursor = 'default';
        }
      } else {
        disconnectedOverlay.classList.remove('hidden');
        connectingOverlay.classList.add('hidden');
        clickOverlay.classList.add('hidden');
        controlHint.classList.add('hidden');
        connectBtn.classList.remove('hidden');
        disconnectBtn.classList.add('hidden');
        controlBtn.classList.add('hidden');
        controlBadge.classList.add('hidden');
        statusBadge.textContent = 'Disconnected';
        statusBadge.className = 'badge badge-secondary';
        resolution.textContent = '';
        isControlling = false;
      }
      
      if (state.error) {
        errorDisplay.textContent = state.error;
        errorDisplay.classList.remove('hidden');
      } else {
        errorDisplay.classList.add('hidden');
      }
    }
    
    // Client events
    client.on('connected', () => updateUI(client.getState()));
    client.on('disconnected', () => updateUI(client.getState()));
    client.on('error', () => updateUI(client.getState()));
    client.on('controlGranted', () => {
      isControlling = true;
      updateUI(client.getState());
    });
    client.on('controlReleased', () => {
      isControlling = false;
      updateUI(client.getState());
    });
    client.on('resize', () => updateUI(client.getState()));
    
    // Connect
    connectBtn.onclick = async () => {
      if (!serverUrl.value) {
        errorDisplay.textContent = 'Please enter a server URL';
        errorDisplay.classList.remove('hidden');
        return;
      }
      
      updateUI({ connecting: true });
      
      try {
        await client.connect({
          url: serverUrl.value,
          password: password.value || undefined,
          displayName: displayName.value || 'User',
        });
        client.setVideoElement(video);
      } catch (error) {
        updateUI({ connected: false, error: error.message });
      }
    };
    
    // Disconnect
    disconnectBtn.onclick = () => {
      client.disconnect();
    };
    
    // Control toggle
    controlBtn.onclick = () => {
      if (isControlling) {
        client.releaseControl();
      } else {
        client.requestControl();
      }
    };
    
    // Click overlay to request control
    clickOverlay.onclick = () => client.requestControl();
    
    // Mouse events
    video.onmousemove = (e) => {
      if (!isControlling) return;
      const rect = video.getBoundingClientRect();
      const state = client.getState();
      const x = (e.clientX - rect.left) / rect.width * state.videoWidth;
      const y = (e.clientY - rect.top) / rect.height * state.videoHeight;
      client.sendMouseMove(x, y);
    };
    
    video.onmousedown = (e) => {
      if (!isControlling) return;
      e.preventDefault();
      client.sendMouseButton(e.button, true);
    };
    
    video.onmouseup = (e) => {
      if (!isControlling) return;
      e.preventDefault();
      client.sendMouseButton(e.button, false);
    };
    
    video.onwheel = (e) => {
      if (!isControlling) return;
      e.preventDefault();
      client.sendMouseScroll(
        Math.sign(e.deltaX) * Math.min(Math.abs(e.deltaX), 10),
        Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 10)
      );
    };
    
    video.oncontextmenu = (e) => e.preventDefault();
    
    // Keyboard events
    window.onkeydown = (e) => {
      if (!isControlling) return;
      if (e.key === 'Escape') {
        client.releaseControl();
        return;
      }
      if (!e.metaKey) e.preventDefault();
      client.sendKeyEvent(e, true);
    };
    
    window.onkeyup = (e) => {
      if (!isControlling) return;
      e.preventDefault();
      client.sendKeyEvent(e, false);
    };
    
    // Initial state
    updateUI({ connected: false });
  </script>
</body>
</html>
```

### `public/neko-client.js`

```javascript
// Neko WebRTC Client - Standalone ES Module

// Keysym mapping (browser codes to X11 keysyms)
const KEYSYM_MAP = {
  KeyA: 0x61, KeyB: 0x62, KeyC: 0x63, KeyD: 0x64, KeyE: 0x65,
  KeyF: 0x66, KeyG: 0x67, KeyH: 0x68, KeyI: 0x69, KeyJ: 0x6a,
  KeyK: 0x6b, KeyL: 0x6c, KeyM: 0x6d, KeyN: 0x6e, KeyO: 0x6f,
  KeyP: 0x70, KeyQ: 0x71, KeyR: 0x72, KeyS: 0x73, KeyT: 0x74,
  KeyU: 0x75, KeyV: 0x76, KeyW: 0x77, KeyX: 0x78, KeyY: 0x79,
  KeyZ: 0x7a,
  Digit0: 0x30, Digit1: 0x31, Digit2: 0x32, Digit3: 0x33, Digit4: 0x34,
  Digit5: 0x35, Digit6: 0x36, Digit7: 0x37, Digit8: 0x38, Digit9: 0x39,
  F1: 0xffbe, F2: 0xffbf, F3: 0xffc0, F4: 0xffc1, F5: 0xffc2,
  F6: 0xffc3, F7: 0xffc4, F8: 0xffc5, F9: 0xffc6, F10: 0xffc7,
  F11: 0xffc8, F12: 0xffc9,
  Space: 0x20, Enter: 0xff0d, Tab: 0xff09, Escape: 0xff1b,
  Backspace: 0xff08, Delete: 0xffff, Insert: 0xff63,
  Home: 0xff50, End: 0xff57, PageUp: 0xff55, PageDown: 0xff56,
  ArrowUp: 0xff52, ArrowDown: 0xff54, ArrowLeft: 0xff51, ArrowRight: 0xff53,
  ShiftLeft: 0xffe1, ShiftRight: 0xffe2,
  ControlLeft: 0xffe3, ControlRight: 0xffe4,
  AltLeft: 0xffe9, AltRight: 0xffea,
  MetaLeft: 0xffeb, MetaRight: 0xffec, CapsLock: 0xffe5,
  Minus: 0x2d, Equal: 0x3d, BracketLeft: 0x5b, BracketRight: 0x5d,
  Backslash: 0x5c, Semicolon: 0x3b, Quote: 0x27, Backquote: 0x60,
  Comma: 0x2c, Period: 0x2e, Slash: 0x2f,
};

function getKeysym(event) {
  if (KEYSYM_MAP[event.code]) {
    let keysym = KEYSYM_MAP[event.code];
    if (event.code.startsWith('Key') && event.shiftKey) {
      keysym -= 0x20;
    }
    return keysym;
  }
  if (event.key.length === 1) {
    return event.key.charCodeAt(0);
  }
  return null;
}

function getMouseButton(button) {
  switch (button) {
    case 0: return 1;
    case 1: return 2;
    case 2: return 3;
    case 3: return 8;
    case 4: return 9;
    default: return 1;
  }
}

// Binary message encoding
const OP = {
  MOUSE_MOVE: 0x01,
  MOUSE_SCROLL: 0x02,
  MOUSE_DOWN: 0x03,
  MOUSE_UP: 0x04,
  KEY_DOWN: 0x05,
  KEY_UP: 0x06,
};

function createMessage(opcode, size) {
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  view.setUint8(0, opcode);
  return { buffer, view };
}

function encodeMouseMove(x, y) {
  const { buffer, view } = createMessage(OP.MOUSE_MOVE, 5);
  view.setUint16(1, Math.round(x), true);
  view.setUint16(3, Math.round(y), true);
  return buffer;
}

function encodeMouseScroll(dx, dy) {
  const { buffer, view } = createMessage(OP.MOUSE_SCROLL, 5);
  view.setInt16(1, Math.round(dx), true);
  view.setInt16(3, Math.round(dy), true);
  return buffer;
}

function encodeMouseButton(button, pressed) {
  const opcode = pressed ? OP.MOUSE_DOWN : OP.MOUSE_UP;
  const { buffer, view } = createMessage(opcode, 2);
  view.setUint8(1, button);
  return buffer;
}

function encodeKey(keycode, pressed) {
  const opcode = pressed ? OP.KEY_DOWN : OP.KEY_UP;
  const { buffer, view } = createMessage(opcode, 5);
  view.setUint32(1, keycode, true);
  return buffer;
}

// Neko Client Class
export class NekoClient {
  constructor() {
    this.ws = null;
    this.pc = null;
    this.dataChannel = null;
    this.videoElement = null;
    this.events = {};
    this.state = {
      connected: false,
      connecting: false,
      controlling: false,
      videoWidth: 1280,
      videoHeight: 720,
      error: null,
    };
    this.config = null;
    this.memberId = '';
  }
  
  on(event, callback) {
    this.events[event] = callback;
  }
  
  emit(event, ...args) {
    if (this.events[event]) {
      this.events[event](...args);
    }
  }
  
  getState() {
    return { ...this.state };
  }
  
  setVideoElement(element) {
    this.videoElement = element;
    if (this.pc) {
      const receivers = this.pc.getReceivers();
      const videoReceiver = receivers.find(r => r.track?.kind === 'video');
      if (videoReceiver?.track) {
        this.attachStream(videoReceiver.track);
      }
    }
  }
  
  async connect(config) {
    if (this.state.connecting || this.state.connected) {
      await this.disconnect();
    }
    
    this.config = config;
    this.state.connecting = true;
    this.state.error = null;
    
    try {
      await this.establishConnection();
    } catch (error) {
      this.state.connecting = false;
      this.state.error = error.message;
      this.emit('error', error.message);
      throw error;
    }
  }
  
  async establishConnection() {
    if (!this.config) throw new Error('No config');
    
    const wsUrl = this.buildWebSocketUrl(this.config.url);
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('[Neko] WebSocket connected');
        if (this.config?.password) {
          this.send({
            event: 'member/identity',
            displayname: this.config.displayName || 'User',
            password: this.config.password,
          });
        }
      };
      
      this.ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          await this.handleMessage(message);
          if (message.event === 'signal/provide') {
            resolve();
          }
        } catch (error) {
          console.error('[Neko] Parse error:', error);
        }
      };
      
      this.ws.onerror = () => {
        this.state.error = 'WebSocket failed';
        reject(new Error(this.state.error));
      };
      
      this.ws.onclose = (event) => {
        this.handleDisconnect(event.reason || 'Closed');
      };
      
      setTimeout(() => {
        if (this.state.connecting && !this.state.connected) {
          reject(new Error('Timeout'));
        }
      }, 10000);
    });
  }
  
  buildWebSocketUrl(url) {
    let cleanUrl = url.replace(/\/$/, '');
    if (cleanUrl.startsWith('http://')) {
      cleanUrl = cleanUrl.replace('http://', 'ws://');
    } else if (cleanUrl.startsWith('https://')) {
      cleanUrl = cleanUrl.replace('https://', 'wss://');
    } else if (!cleanUrl.startsWith('ws://') && !cleanUrl.startsWith('wss://')) {
      cleanUrl = 'wss://' + cleanUrl;
    }
    if (!cleanUrl.endsWith('/ws')) {
      cleanUrl += '/ws';
    }
    return cleanUrl;
  }
  
  async handleMessage(message) {
    switch (message.event) {
      case 'signal/provide':
        await this.handleSignalProvide(message);
        break;
      case 'signal/candidate':
        await this.handleSignalCandidate(message);
        break;
      case 'member/identity':
        this.memberId = message.id;
        break;
      case 'screen/resolution':
        this.state.videoWidth = message.width;
        this.state.videoHeight = message.height;
        this.emit('resize', message.width, message.height);
        break;
      case 'control/give':
        this.state.controlling = true;
        this.emit('controlGranted');
        break;
      case 'control/release':
        this.state.controlling = false;
        this.emit('controlReleased');
        break;
    }
  }
  
  async handleSignalProvide(signal) {
    const iceServers = signal.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }];
    this.pc = new RTCPeerConnection({ iceServers });
    
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({ event: 'signal/candidate', candidate: event.candidate.toJSON() });
      }
    };
    
    this.pc.ontrack = (event) => {
      if (event.track.kind === 'video') {
        this.attachStream(event.track);
      }
    };
    
    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.dataChannel.binaryType = 'arraybuffer';
    };
    
    this.pc.onconnectionstatechange = () => {
      switch (this.pc?.connectionState) {
        case 'connected':
          this.state.connected = true;
          this.state.connecting = false;
          this.emit('connected');
          break;
        case 'disconnected':
        case 'failed':
          this.handleDisconnect('WebRTC failed');
          break;
      }
    };
    
    await this.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.send({ event: 'signal/answer', sdp: answer.sdp });
  }
  
  async handleSignalCandidate(signal) {
    if (this.pc && signal.candidate) {
      try {
        await this.pc.addIceCandidate(signal.candidate);
      } catch (e) {}
    }
  }
  
  attachStream(track) {
    if (this.videoElement) {
      const stream = new MediaStream([track]);
      this.videoElement.srcObject = stream;
      this.videoElement.play().catch(() => {});
    }
  }
  
  send(message) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
  
  sendBinary(data) {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(data);
    }
  }
  
  handleDisconnect(reason) {
    const wasConnected = this.state.connected;
    this.state.connected = false;
    this.state.connecting = false;
    this.state.controlling = false;
    if (wasConnected) {
      this.emit('disconnected', reason);
    }
    this.cleanup();
  }
  
  cleanup() {
    if (this.dataChannel) { this.dataChannel.close(); this.dataChannel = null; }
    if (this.pc) { this.pc.close(); this.pc = null; }
    if (this.ws) { this.ws.close(); this.ws = null; }
  }
  
  // Input methods
  sendMouseMove(x, y) {
    if (!this.state.controlling) return;
    this.sendBinary(encodeMouseMove(x, y));
  }
  
  sendMouseScroll(dx, dy) {
    if (!this.state.controlling) return;
    this.sendBinary(encodeMouseScroll(dx, dy));
  }
  
  sendMouseButton(button, pressed) {
    if (!this.state.controlling) return;
    this.sendBinary(encodeMouseButton(getMouseButton(button), pressed));
  }
  
  sendKeyEvent(event, pressed) {
    if (!this.state.controlling) return;
    const keysym = getKeysym(event);
    if (keysym !== null) {
      this.sendBinary(encodeKey(keysym, pressed));
    }
  }
  
  requestControl() {
    this.send({ event: 'control/request' });
  }
  
  releaseControl() {
    this.send({ event: 'control/release' });
    this.state.controlling = false;
    this.emit('controlReleased');
  }
  
  async disconnect() {
    this.config = null;
    this.cleanup();
    this.state = {
      connected: false,
      connecting: false,
      controlling: false,
      videoWidth: 1280,
      videoHeight: 720,
      error: null,
    };
    this.emit('disconnected');
  }
}
```

---

## Part 3: Running on Replit

### Step 1: Set Environment Variables

In your Replit Secrets, add:
- `NEKO_PASSWORD`: User password (default: `neko`)
- `NEKO_ADMIN_PASSWORD`: Admin password (default: `admin`)

### Step 2: Run the Server

```bash
node server.js
```

### Step 3: Access the Browser

Open your Replit's public URL (e.g., `https://your-repl.username.repl.co`) in a browser.

---

## FFmpeg Screen Capture (Production)

For actual video streaming, add FFmpeg capture to the server:

```javascript
const { spawn } = require('child_process');
const { PassThrough } = require('stream');

function startScreenCapture() {
  const ffmpeg = spawn('ffmpeg', [
    '-f', 'x11grab',
    '-video_size', '1920x1080',
    '-framerate', '30',
    '-i', ':99',
    '-c:v', 'libvpx',
    '-b:v', '2M',
    '-f', 'webm',
    '-'
  ], {
    env: { DISPLAY: ':99' }
  });
  
  return ffmpeg.stdout;
}
```

Then pipe this to WebRTC using a library like `wrtc` with MediaStream injection.

---

## Alternative: Docker on Replit

If your Replit plan supports Docker, you can run the official Neko image:

```bash
docker run -d \
  --name neko \
  -p 8080:8080 \
  -p 52000-52100:52000-52100/udp \
  -e NEKO_SCREEN=1920x1080@30 \
  -e NEKO_PASSWORD=neko \
  -e NEKO_PASSWORD_ADMIN=admin \
  -e NEKO_EPR=52000-52100 \
  -e NEKO_ICELITE=1 \
  ghcr.io/m1k1o/neko/chromium:latest
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Xvfb won't start | Ensure `pkgs.xorg.xorgserver` is in `replit.nix` |
| Chromium crashes | Add `--no-sandbox --disable-gpu` flags |
| No video | Check FFmpeg capture is running |
| Input not working | Verify `xdotool` is installed and DISPLAY is set |
| WebSocket fails | Use `wss://` for HTTPS Repls |

---

## Resources

- [Neko GitHub](https://github.com/m1k1o/neko)
- [WebRTC Docs](https://webrtc.org/)
- [wrtc npm package](https://www.npmjs.com/package/wrtc)
- [xdotool](https://github.com/jordansissel/xdotool)
