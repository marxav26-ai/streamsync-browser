// Neko WebRTC Client Types

export interface NekoConfig {
  url: string;
  password?: string;
  displayName?: string;
}

export interface NekoState {
  connected: boolean;
  connecting: boolean;
  controlling: boolean;
  videoWidth: number;
  videoHeight: number;
  error: string | null;
}

export interface NekoEvents {
  onConnected?: () => void;
  onDisconnected?: (reason?: string) => void;
  onError?: (error: string) => void;
  onControlGranted?: () => void;
  onControlReleased?: () => void;
  onResize?: (width: number, height: number) => void;
}

// WebSocket message types based on Neko protocol
export type NekoMessageType =
  | 'signal/provide'
  | 'signal/answer'
  | 'signal/candidate'
  | 'member/identity'
  | 'member/list'
  | 'member/connected'
  | 'member/disconnected'
  | 'control/request'
  | 'control/release'
  | 'control/give'
  | 'control/requesting'
  | 'control/clipboard'
  | 'screen/resolution'
  | 'screen/set'
  | 'admin/lock'
  | 'admin/unlock'
  | 'admin/control'
  | 'admin/release';

export interface NekoMessage {
  event: NekoMessageType;
  [key: string]: unknown;
}

export interface SignalProvide {
  event: 'signal/provide';
  sdp: string;
  iceServers: RTCIceServer[];
  video: string;
  audio: string;
}

export interface SignalCandidate {
  event: 'signal/candidate';
  candidate: RTCIceCandidateInit;
}

export interface MemberIdentity {
  event: 'member/identity';
  id: string;
}

export interface ScreenResolution {
  event: 'screen/resolution';
  width: number;
  height: number;
  rate: number;
}

// Input event types
export interface MousePosition {
  x: number;
  y: number;
}

export interface KeyEvent {
  key: number;
  pressed: boolean;
}
