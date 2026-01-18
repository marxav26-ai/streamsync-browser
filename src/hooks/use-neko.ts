// React hook for Neko client

import { useState, useCallback, useRef, useEffect } from 'react';
import { NekoClient } from '@/lib/neko/client';
import type { NekoConfig, NekoState } from '@/lib/neko/types';

export interface UseNekoReturn {
  state: NekoState;
  connect: (config: NekoConfig) => Promise<void>;
  disconnect: () => Promise<void>;
  requestControl: () => void;
  releaseControl: () => void;
  setVideoElement: (element: HTMLVideoElement | null) => void;
  sendMouseMove: (x: number, y: number) => void;
  sendMouseScroll: (deltaX: number, deltaY: number) => void;
  sendMouseButton: (button: number, pressed: boolean) => void;
  sendKeyEvent: (event: KeyboardEvent, pressed: boolean) => void;
}

export function useNeko(): UseNekoReturn {
  const clientRef = useRef<NekoClient | null>(null);
  const [state, setState] = useState<NekoState>({
    connected: false,
    connecting: false,
    controlling: false,
    videoWidth: 1280,
    videoHeight: 720,
    error: null,
  });
  
  // Initialize client on mount
  useEffect(() => {
    clientRef.current = new NekoClient({
      onConnected: () => {
        setState(prev => ({ ...prev, connected: true, connecting: false }));
      },
      onDisconnected: (reason) => {
        setState(prev => ({ 
          ...prev, 
          connected: false, 
          connecting: false,
          controlling: false,
          error: reason || null 
        }));
      },
      onError: (error) => {
        setState(prev => ({ ...prev, error, connecting: false }));
      },
      onControlGranted: () => {
        setState(prev => ({ ...prev, controlling: true }));
      },
      onControlReleased: () => {
        setState(prev => ({ ...prev, controlling: false }));
      },
      onResize: (width, height) => {
        setState(prev => ({ ...prev, videoWidth: width, videoHeight: height }));
      },
    });
    
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);
  
  const connect = useCallback(async (config: NekoConfig) => {
    if (!clientRef.current) return;
    
    setState(prev => ({ ...prev, connecting: true, error: null }));
    
    try {
      await clientRef.current.connect(config);
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        connecting: false, 
        error: error instanceof Error ? error.message : 'Connection failed' 
      }));
      throw error;
    }
  }, []);
  
  const disconnect = useCallback(async () => {
    if (!clientRef.current) return;
    await clientRef.current.disconnect();
    setState({
      connected: false,
      connecting: false,
      controlling: false,
      videoWidth: 1280,
      videoHeight: 720,
      error: null,
    });
  }, []);
  
  const requestControl = useCallback(() => {
    clientRef.current?.requestControl();
  }, []);
  
  const releaseControl = useCallback(() => {
    clientRef.current?.releaseControl();
    setState(prev => ({ ...prev, controlling: false }));
  }, []);
  
  const setVideoElement = useCallback((element: HTMLVideoElement | null) => {
    if (element) {
      clientRef.current?.setVideoElement(element);
    }
  }, []);
  
  const sendMouseMove = useCallback((x: number, y: number) => {
    clientRef.current?.sendMouseMove(x, y);
  }, []);
  
  const sendMouseScroll = useCallback((deltaX: number, deltaY: number) => {
    clientRef.current?.sendMouseScroll(deltaX, deltaY);
  }, []);
  
  const sendMouseButton = useCallback((button: number, pressed: boolean) => {
    clientRef.current?.sendMouseButton(button, pressed);
  }, []);
  
  const sendKeyEvent = useCallback((event: KeyboardEvent, pressed: boolean) => {
    clientRef.current?.sendKeyEvent(event, pressed);
  }, []);
  
  return {
    state,
    connect,
    disconnect,
    requestControl,
    releaseControl,
    setVideoElement,
    sendMouseMove,
    sendMouseScroll,
    sendMouseButton,
    sendKeyEvent,
  };
}
