// Neko Browser - Full browser interface component

import { useNeko } from '@/hooks/use-neko';
import { NekoVideo } from './NekoVideo';
import { NekoControls } from './NekoControls';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface NekoBrowserProps {
  className?: string;
}

export function NekoBrowser({ className = '' }: NekoBrowserProps) {
  const neko = useNeko();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  }, []);
  
  // Listen for fullscreen changes
  const handleFullscreenChange = useCallback(() => {
    setIsFullscreen(!!document.fullscreenElement);
  }, []);
  
  // Add fullscreen listener
  useState(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  });
  
  return (
    <div 
      ref={containerRef}
      className={`flex flex-col bg-background ${className} ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
    >
      {/* Controls */}
      <div className="p-4 border-b border-border">
        <NekoControls neko={neko} />
      </div>
      
      {/* Video Container */}
      <div className="flex-1 relative min-h-0">
        <NekoVideo 
          neko={neko} 
          className="absolute inset-0"
        />
        
        {/* Fullscreen Button */}
        <Button
          variant="secondary"
          size="icon"
          className="absolute bottom-4 right-4 opacity-70 hover:opacity-100"
          onClick={toggleFullscreen}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </Button>
        
        {/* Control indicator */}
        {neko.state.controlling && (
          <div className="absolute top-4 right-4 px-3 py-1 bg-primary/90 text-primary-foreground text-sm rounded-full">
            Press Escape to release control
          </div>
        )}
      </div>
    </div>
  );
}
