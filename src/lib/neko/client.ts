// Neko WebRTC Client
// Handles WebSocket signaling and WebRTC connection to Neko server

import type { NekoConfig, NekoState, NekoEvents, SignalProvide, SignalCandidate, ScreenResolution } from './types';
import { encodeMouseMove, encodeMouseScroll, encodeMouseButton, encodeKey, getKeysym, getMouseButton } from './protocol';

export class NekoClient {
  private config: NekoConfig | null = null;
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private events: NekoEvents = {};
  
  private state: NekoState = {
    connected: false,
    connecting: false,
    controlling: false,
    videoWidth: 1280,
    videoHeight: 720,
    error: null,
  };
  
  private memberId: string = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  constructor(events?: NekoEvents) {
    this.events = events || {};
  }
  
  // Get current state
  getState(): NekoState {
    return { ...this.state };
  }
  
  // Set video element for stream output
  setVideoElement(element: HTMLVideoElement) {
    this.videoElement = element;
    
    // If we already have a stream, attach it
    if (this.pc) {
      const receivers = this.pc.getReceivers();
      const videoReceiver = receivers.find(r => r.track?.kind === 'video');
      if (videoReceiver?.track) {
        this.attachStream(videoReceiver.track);
      }
    }
  }
  
  // Connect to Neko server
  async connect(config: NekoConfig): Promise<void> {
    if (this.state.connecting || this.state.connected) {
      await this.disconnect();
    }
    
    this.config = config;
    this.state.connecting = true;
    this.state.error = null;
    this.reconnectAttempts = 0;
    
    try {
      await this.establishConnection();
    } catch (error) {
      this.state.connecting = false;
      this.state.error = error instanceof Error ? error.message : 'Connection failed';
      this.events.onError?.(this.state.error);
      throw error;
    }
  }
  
  private async establishConnection(): Promise<void> {
    if (!this.config) throw new Error('No config provided');
    
    // Parse URL and create WebSocket connection
    const wsUrl = this.buildWebSocketUrl(this.config.url);
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('[Neko] WebSocket connected');
        // Send authentication if password provided
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
          console.error('[Neko] Message parse error:', error);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('[Neko] WebSocket error:', error);
        this.state.error = 'WebSocket connection failed';
        reject(new Error(this.state.error));
      };
      
      this.ws.onclose = (event) => {
        console.log('[Neko] WebSocket closed:', event.code, event.reason);
        this.handleDisconnect(event.reason || 'Connection closed');
      };
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.state.connecting && !this.state.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }
  
  private buildWebSocketUrl(url: string): string {
    // Remove trailing slash
    let cleanUrl = url.replace(/\/$/, '');
    
    // Convert http(s) to ws(s)
    if (cleanUrl.startsWith('http://')) {
      cleanUrl = cleanUrl.replace('http://', 'ws://');
    } else if (cleanUrl.startsWith('https://')) {
      cleanUrl = cleanUrl.replace('https://', 'wss://');
    } else if (!cleanUrl.startsWith('ws://') && !cleanUrl.startsWith('wss://')) {
      // Default to wss if no protocol
      cleanUrl = 'wss://' + cleanUrl;
    }
    
    // Append /ws path for Neko
    if (!cleanUrl.endsWith('/ws')) {
      cleanUrl += '/ws';
    }
    
    return cleanUrl;
  }
  
  private async handleMessage(message: Record<string, unknown>): Promise<void> {
    const event = message.event as string;
    
    switch (event) {
      case 'signal/provide':
        await this.handleSignalProvide(message as unknown as SignalProvide);
        break;
        
      case 'signal/candidate':
        await this.handleSignalCandidate(message as unknown as SignalCandidate);
        break;
        
      case 'member/identity':
        this.memberId = message.id as string;
        console.log('[Neko] Member ID:', this.memberId);
        break;
        
      case 'screen/resolution':
        this.handleScreenResolution(message as unknown as ScreenResolution);
        break;
        
      case 'control/give':
        this.state.controlling = true;
        this.events.onControlGranted?.();
        break;
        
      case 'control/release':
        this.state.controlling = false;
        this.events.onControlReleased?.();
        break;
        
      default:
        console.log('[Neko] Unhandled message:', event);
    }
  }
  
  private async handleSignalProvide(signal: SignalProvide): Promise<void> {
    console.log('[Neko] Received SDP offer');
    
    // Create peer connection with provided ICE servers
    const iceServers = signal.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }];
    
    this.pc = new RTCPeerConnection({ iceServers });
    
    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({
          event: 'signal/candidate',
          candidate: event.candidate.toJSON(),
        });
      }
    };
    
    // Handle incoming tracks (video/audio)
    this.pc.ontrack = (event) => {
      console.log('[Neko] Received track:', event.track.kind);
      if (event.track.kind === 'video') {
        this.attachStream(event.track);
      }
    };
    
    // Handle data channel
    this.pc.ondatachannel = (event) => {
      console.log('[Neko] Data channel received');
      this.dataChannel = event.channel;
      this.setupDataChannel();
    };
    
    // Handle connection state
    this.pc.onconnectionstatechange = () => {
      console.log('[Neko] Connection state:', this.pc?.connectionState);
      
      switch (this.pc?.connectionState) {
        case 'connected':
          this.state.connected = true;
          this.state.connecting = false;
          this.events.onConnected?.();
          break;
        case 'disconnected':
        case 'failed':
          this.handleDisconnect('WebRTC connection failed');
          break;
      }
    };
    
    // Set remote description (offer)
    await this.pc.setRemoteDescription({
      type: 'offer',
      sdp: signal.sdp,
    });
    
    // Create and send answer
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    
    this.send({
      event: 'signal/answer',
      sdp: answer.sdp,
    });
  }
  
  private async handleSignalCandidate(signal: SignalCandidate): Promise<void> {
    if (this.pc && signal.candidate) {
      try {
        await this.pc.addIceCandidate(signal.candidate);
      } catch (error) {
        console.error('[Neko] Failed to add ICE candidate:', error);
      }
    }
  }
  
  private handleScreenResolution(resolution: ScreenResolution): void {
    this.state.videoWidth = resolution.width;
    this.state.videoHeight = resolution.height;
    this.events.onResize?.(resolution.width, resolution.height);
  }
  
  private attachStream(track: MediaStreamTrack): void {
    if (this.videoElement) {
      const stream = new MediaStream([track]);
      this.videoElement.srcObject = stream;
      this.videoElement.play().catch(console.error);
    }
  }
  
  private setupDataChannel(): void {
    if (!this.dataChannel) return;
    
    this.dataChannel.binaryType = 'arraybuffer';
    
    this.dataChannel.onopen = () => {
      console.log('[Neko] Data channel open');
    };
    
    this.dataChannel.onclose = () => {
      console.log('[Neko] Data channel closed');
    };
    
    this.dataChannel.onerror = (error) => {
      console.error('[Neko] Data channel error:', error);
    };
  }
  
  private send(message: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
  
  private sendBinary(data: ArrayBuffer): void {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(data);
    }
  }
  
  private handleDisconnect(reason: string): void {
    const wasConnected = this.state.connected;
    
    this.state.connected = false;
    this.state.connecting = false;
    this.state.controlling = false;
    
    if (wasConnected) {
      this.events.onDisconnected?.(reason);
    }
    
    // Cleanup
    this.cleanup();
    
    // Auto-reconnect if we were connected
    if (wasConnected && this.config && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[Neko] Reconnecting (attempt ${this.reconnectAttempts})...`);
      setTimeout(() => {
        this.establishConnection().catch(console.error);
      }, 2000 * this.reconnectAttempts);
    }
  }
  
  private cleanup(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  // Public methods for input
  
  sendMouseMove(x: number, y: number): void {
    if (!this.state.controlling) return;
    this.sendBinary(encodeMouseMove(x, y));
  }
  
  sendMouseScroll(deltaX: number, deltaY: number): void {
    if (!this.state.controlling) return;
    this.sendBinary(encodeMouseScroll(deltaX, deltaY));
  }
  
  sendMouseButton(button: number, pressed: boolean): void {
    if (!this.state.controlling) return;
    const mappedButton = getMouseButton(button);
    this.sendBinary(encodeMouseButton(mappedButton, pressed));
  }
  
  sendKeyEvent(event: KeyboardEvent, pressed: boolean): void {
    if (!this.state.controlling) return;
    const keysym = getKeysym(event);
    if (keysym !== null) {
      this.sendBinary(encodeKey(keysym, pressed));
    }
  }
  
  // Request control
  requestControl(): void {
    this.send({ event: 'control/request' });
  }
  
  // Release control
  releaseControl(): void {
    this.send({ event: 'control/release' });
    this.state.controlling = false;
  }
  
  // Disconnect
  async disconnect(): Promise<void> {
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
  }
}
