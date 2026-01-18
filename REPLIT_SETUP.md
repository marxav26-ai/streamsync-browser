# Neko Server Setup for Replit

This project contains a fully functional **Neko WebRTC client**. To use it, you need to run a Neko server. This guide explains how to set up Neko on Replit.

## What is Neko?

[Neko](https://github.com/m1k1o/neko) is a self-hosted virtual browser that runs in Docker and streams via WebRTC. It gives you a full Chromium browser with:
- Full JavaScript execution
- Low-latency video streaming (WebRTC)
- Keyboard and mouse input
- Multi-user support

## Quick Start on Replit

### Option 1: Using Replit's Nix Environment

Create a new Replit with Nix and add this to your `replit.nix`:

```nix
{ pkgs }: {
  deps = [
    pkgs.chromium
    pkgs.pulseaudio
    pkgs.xvfb-run
    pkgs.ffmpeg
    pkgs.nodejs_20
  ];
}
```

Then create a simple Node.js server that:
1. Starts Xvfb (virtual display)
2. Launches Chromium
3. Captures the screen with FFmpeg
4. Serves via WebRTC

### Option 2: Using Docker on Replit (Recommended)

If your Replit plan supports Docker:

```bash
# Pull the Neko image
docker pull ghcr.io/m1k1o/neko/chromium:latest

# Run Neko
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

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEKO_SCREEN` | Resolution and framerate | `1920x1080@30` |
| `NEKO_PASSWORD` | User password | `neko` |
| `NEKO_PASSWORD_ADMIN` | Admin password | `admin` |
| `NEKO_EPR` | UDP port range for WebRTC | `52000-52100` |
| `NEKO_ICELITE` | Use ICE Lite (recommended for NAT) | `1` |
| `NEKO_NAT1TO1` | Your public IP (if behind NAT) | - |

## Connecting from the Client

1. Get your Replit's public URL (e.g., `https://your-repl.username.repl.co`)
2. Enter this URL in the Neko client's "Server URL" field
3. Enter the password you configured
4. Click "Connect"

## Alternative: Minimal WebRTC Server

If Docker isn't available, here's a minimal Node.js implementation:

```javascript
// server.js - Minimal Neko-compatible server
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');

// Start virtual display
const xvfb = spawn('Xvfb', [':99', '-screen', '0', '1920x1080x24']);
process.env.DISPLAY = ':99';

// Start Chromium
const chromium = spawn('chromium', [
  '--no-sandbox',
  '--disable-gpu',
  '--start-maximized',
  'https://google.com'
]);

// WebSocket signaling server
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  // Handle Neko protocol messages
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    // Implement signaling logic here
  });
});
```

## Troubleshooting

### Connection Issues

1. **WebSocket fails**: Ensure your Replit URL uses `wss://` (secure WebSocket)
2. **No video**: Check that Xvfb and Chromium are running
3. **Input not working**: Verify you have control (click the video overlay)

### Performance Tips

1. Lower resolution for better performance: `NEKO_SCREEN=1280x720@30`
2. Use VP8 codec for wider compatibility
3. Enable ICE Lite if behind NAT: `NEKO_ICELITE=1`

## Full Neko Docker Compose

For a complete setup, use this `docker-compose.yml`:

```yaml
version: "3.8"
services:
  neko:
    image: ghcr.io/m1k1o/neko/chromium:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
      - "52000-52100:52000-52100/udp"
    environment:
      NEKO_SCREEN: "1920x1080@30"
      NEKO_PASSWORD: "neko"
      NEKO_PASSWORD_ADMIN: "admin"
      NEKO_EPR: "52000-52100"
      NEKO_ICELITE: "1"
    shm_size: "2gb"
    cap_add:
      - SYS_ADMIN
```

## Security Notes

- Change default passwords before deploying
- Use HTTPS/WSS in production
- Consider adding authentication to your Replit
- The Neko server runs a full browser - treat it as a security boundary

## Resources

- [Neko GitHub](https://github.com/m1k1o/neko)
- [Neko Documentation](https://neko.m1k1o.net/)
- [WebRTC Docs](https://webrtc.org/)
