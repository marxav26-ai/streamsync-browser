// Neko Protocol - Binary message encoding for input events
// Based on Neko's protocol specification

// Op codes for different message types
export const OP = {
  // Mouse operations
  MOUSE_MOVE: 0x01,
  MOUSE_SCROLL: 0x02,
  MOUSE_DOWN: 0x03,
  MOUSE_UP: 0x04,
  
  // Keyboard operations
  KEY_DOWN: 0x05,
  KEY_UP: 0x06,
  
  // Control operations
  CONTROL_REQUEST: 0x10,
  CONTROL_RELEASE: 0x11,
  
  // Screen operations
  SCREEN_SET: 0x20,
} as const;

// Create a DataView for binary message encoding
function createMessage(opcode: number, size: number): { buffer: ArrayBuffer; view: DataView } {
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  view.setUint8(0, opcode);
  return { buffer, view };
}

// Mouse move message: [opcode(1), x(2), y(2)]
export function encodeMouseMove(x: number, y: number): ArrayBuffer {
  const { buffer, view } = createMessage(OP.MOUSE_MOVE, 5);
  view.setUint16(1, Math.round(x), true);
  view.setUint16(3, Math.round(y), true);
  return buffer;
}

// Mouse scroll message: [opcode(1), x(2), y(2)]
export function encodeMouseScroll(deltaX: number, deltaY: number): ArrayBuffer {
  const { buffer, view } = createMessage(OP.MOUSE_SCROLL, 5);
  view.setInt16(1, Math.round(deltaX), true);
  view.setInt16(3, Math.round(deltaY), true);
  return buffer;
}

// Mouse button message: [opcode(1), button(1)]
export function encodeMouseButton(button: number, pressed: boolean): ArrayBuffer {
  const opcode = pressed ? OP.MOUSE_DOWN : OP.MOUSE_UP;
  const { buffer, view } = createMessage(opcode, 2);
  view.setUint8(1, button);
  return buffer;
}

// Keyboard message: [opcode(1), keycode(4)]
export function encodeKey(keycode: number, pressed: boolean): ArrayBuffer {
  const opcode = pressed ? OP.KEY_DOWN : OP.KEY_UP;
  const { buffer, view } = createMessage(opcode, 5);
  view.setUint32(1, keycode, true);
  return buffer;
}

// Map browser key codes to X11 keysyms
// This is a simplified mapping - full mapping would include all keys
export const KEYSYM_MAP: Record<string, number> = {
  // Letters
  KeyA: 0x61, KeyB: 0x62, KeyC: 0x63, KeyD: 0x64, KeyE: 0x65,
  KeyF: 0x66, KeyG: 0x67, KeyH: 0x68, KeyI: 0x69, KeyJ: 0x6a,
  KeyK: 0x6b, KeyL: 0x6c, KeyM: 0x6d, KeyN: 0x6e, KeyO: 0x6f,
  KeyP: 0x70, KeyQ: 0x71, KeyR: 0x72, KeyS: 0x73, KeyT: 0x74,
  KeyU: 0x75, KeyV: 0x76, KeyW: 0x77, KeyX: 0x78, KeyY: 0x79,
  KeyZ: 0x7a,
  
  // Numbers
  Digit0: 0x30, Digit1: 0x31, Digit2: 0x32, Digit3: 0x33, Digit4: 0x34,
  Digit5: 0x35, Digit6: 0x36, Digit7: 0x37, Digit8: 0x38, Digit9: 0x39,
  
  // Function keys
  F1: 0xffbe, F2: 0xffbf, F3: 0xffc0, F4: 0xffc1, F5: 0xffc2,
  F6: 0xffc3, F7: 0xffc4, F8: 0xffc5, F9: 0xffc6, F10: 0xffc7,
  F11: 0xffc8, F12: 0xffc9,
  
  // Special keys
  Space: 0x20,
  Enter: 0xff0d,
  Tab: 0xff09,
  Escape: 0xff1b,
  Backspace: 0xff08,
  Delete: 0xffff,
  Insert: 0xff63,
  Home: 0xff50,
  End: 0xff57,
  PageUp: 0xff55,
  PageDown: 0xff56,
  
  // Arrow keys
  ArrowUp: 0xff52,
  ArrowDown: 0xff54,
  ArrowLeft: 0xff51,
  ArrowRight: 0xff53,
  
  // Modifiers
  ShiftLeft: 0xffe1,
  ShiftRight: 0xffe2,
  ControlLeft: 0xffe3,
  ControlRight: 0xffe4,
  AltLeft: 0xffe9,
  AltRight: 0xffea,
  MetaLeft: 0xffeb,
  MetaRight: 0xffec,
  CapsLock: 0xffe5,
  
  // Punctuation
  Minus: 0x2d,
  Equal: 0x3d,
  BracketLeft: 0x5b,
  BracketRight: 0x5d,
  Backslash: 0x5c,
  Semicolon: 0x3b,
  Quote: 0x27,
  Backquote: 0x60,
  Comma: 0x2c,
  Period: 0x2e,
  Slash: 0x2f,
};

// Get keysym from browser event
export function getKeysym(event: KeyboardEvent): number | null {
  // Check for direct mapping
  if (KEYSYM_MAP[event.code]) {
    let keysym = KEYSYM_MAP[event.code];
    
    // Handle shift for letters
    if (event.code.startsWith('Key') && event.shiftKey) {
      keysym -= 0x20; // Convert to uppercase
    }
    
    return keysym;
  }
  
  // Fallback to key character code
  if (event.key.length === 1) {
    return event.key.charCodeAt(0);
  }
  
  return null;
}

// Map browser mouse button to X11 button
export function getMouseButton(button: number): number {
  switch (button) {
    case 0: return 1; // Left
    case 1: return 2; // Middle
    case 2: return 3; // Right
    case 3: return 8; // Back
    case 4: return 9; // Forward
    default: return 1;
  }
}
