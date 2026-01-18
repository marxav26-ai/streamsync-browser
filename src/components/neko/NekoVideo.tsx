// Neko Video Component - Handles video display and input events

import { useRef, useEffect, useCallback } from 'react';
import type { UseNekoReturn } from '@/hooks/use-neko';

interface NekoVideoProps {
  neko: UseNekoReturn;
  className?: string;
}

export function NekoVideo({ neko, className = '' }: NekoVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Set video element on mount
  useEffect(() => {
    if (videoRef.current) {
      neko.setVideoElement(videoRef.current);
    }
  }, [neko]);
  
  // Calculate mouse position relative to video
  const getMousePosition = useCallback((event: React.MouseEvent): { x: number; y: number } | null => {
    if (!videoRef.current) return null;
    
    const rect = videoRef.current.getBoundingClientRect();
    const scaleX = neko.state.videoWidth / rect.width;
    const scaleY = neko.state.videoHeight / rect.height;
    
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    
    return { x, y };
  }, [neko.state.videoWidth, neko.state.videoHeight]);
  
  // Mouse event handlers
  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    const pos = getMousePosition(event);
    if (pos) {
      neko.sendMouseMove(pos.x, pos.y);
    }
  }, [getMousePosition, neko]);
  
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const pos = getMousePosition(event);
    if (pos) {
      neko.sendMouseMove(pos.x, pos.y);
      neko.sendMouseButton(event.button, true);
    }
  }, [getMousePosition, neko]);
  
  const handleMouseUp = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    neko.sendMouseButton(event.button, false);
  }, [neko]);
  
  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    // Normalize scroll delta
    const deltaX = Math.sign(event.deltaX) * Math.min(Math.abs(event.deltaX), 10);
    const deltaY = Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY), 10);
    neko.sendMouseScroll(deltaX, deltaY);
  }, [neko]);
  
  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
  }, []);
  
  // Keyboard event handlers
  useEffect(() => {
    if (!neko.state.controlling) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Prevent default for most keys to avoid browser shortcuts
      if (!event.metaKey || event.key === 'v') {
        event.preventDefault();
      }
      neko.sendKeyEvent(event, true);
    };
    
    const handleKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      neko.sendKeyEvent(event, false);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [neko, neko.state.controlling]);
  
  return (
    <div 
      ref={containerRef}
      className={`relative bg-muted ${className}`}
      tabIndex={0}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        muted={false}
        onMouseMove={neko.state.controlling ? handleMouseMove : undefined}
        onMouseDown={neko.state.controlling ? handleMouseDown : undefined}
        onMouseUp={neko.state.controlling ? handleMouseUp : undefined}
        onWheel={neko.state.controlling ? handleWheel : undefined}
        onContextMenu={handleContextMenu}
        style={{ cursor: neko.state.controlling ? 'none' : 'default' }}
      />
      
      {/* Overlay for non-controlling state */}
      {neko.state.connected && !neko.state.controlling && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-background/50 cursor-pointer"
          onClick={() => neko.requestControl()}
        >
          <div className="bg-card px-6 py-4 rounded-lg shadow-lg text-center">
            <p className="text-card-foreground font-medium">Click to take control</p>
            <p className="text-muted-foreground text-sm mt-1">Or wait for current user to release</p>
          </div>
        </div>
      )}
      
      {/* Loading state */}
      {neko.state.connecting && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-foreground mt-4">Connecting...</p>
          </div>
        </div>
      )}
      
      {/* Disconnected state */}
      {!neko.state.connected && !neko.state.connecting && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-muted-foreground">Not connected</p>
        </div>
      )}
    </div>
  );
}
