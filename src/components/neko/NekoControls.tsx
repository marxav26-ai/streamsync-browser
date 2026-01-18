// Neko Controls Component - Connection and control management

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Monitor, MonitorOff, Settings, X } from 'lucide-react';
import type { UseNekoReturn } from '@/hooks/use-neko';

interface NekoControlsProps {
  neko: UseNekoReturn;
}

export function NekoControls({ neko }: NekoControlsProps) {
  const [serverUrl, setServerUrl] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('User');
  const [showSettings, setShowSettings] = useState(false);
  
  const handleConnect = async () => {
    if (!serverUrl) return;
    
    try {
      await neko.connect({
        url: serverUrl,
        password: password || undefined,
        displayName: displayName || 'User',
      });
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };
  
  const handleDisconnect = async () => {
    await neko.disconnect();
  };
  
  return (
    <div className="space-y-4">
      {/* Status Bar */}
      <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
        <div className="flex items-center gap-3">
          {neko.state.connected ? (
            <Badge variant="default" className="bg-primary">
              <Wifi className="w-3 h-3 mr-1" />
              Connected
            </Badge>
          ) : neko.state.connecting ? (
            <Badge variant="secondary">
              <div className="w-3 h-3 mr-1 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Connecting
            </Badge>
          ) : (
            <Badge variant="outline">
              <WifiOff className="w-3 h-3 mr-1" />
              Disconnected
            </Badge>
          )}
          
          {neko.state.connected && (
            neko.state.controlling ? (
              <Badge variant="default">
                <Monitor className="w-3 h-3 mr-1" />
                In Control
              </Badge>
            ) : (
              <Badge variant="outline">
                <MonitorOff className="w-3 h-3 mr-1" />
                Viewing
              </Badge>
            )
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {neko.state.connected && (
            <span className="text-sm text-muted-foreground">
              {neko.state.videoWidth}x{neko.state.videoHeight}
            </span>
          )}
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(!showSettings)}
          >
            {showSettings ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      
      {/* Error Display */}
      {neko.state.error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">{neko.state.error}</p>
        </div>
      )}
      
      {/* Settings Panel */}
      {showSettings && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Connection Settings</CardTitle>
            <CardDescription>
              Configure your Neko server connection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="server-url">Server URL</Label>
              <Input
                id="server-url"
                type="text"
                placeholder="https://your-neko-server.com"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                disabled={neko.state.connected || neko.state.connecting}
              />
              <p className="text-xs text-muted-foreground">
                The URL of your Neko server (e.g., https://neko.example.com)
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password (optional)</Label>
              <Input
                id="password"
                type="password"
                placeholder="Server password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={neko.state.connected || neko.state.connecting}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="display-name">Display Name</Label>
              <Input
                id="display-name"
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={neko.state.connected || neko.state.connecting}
              />
            </div>
            
            <div className="flex gap-2">
              {!neko.state.connected ? (
                <Button 
                  onClick={handleConnect}
                  disabled={!serverUrl || neko.state.connecting}
                  className="flex-1"
                >
                  {neko.state.connecting ? 'Connecting...' : 'Connect'}
                </Button>
              ) : (
                <>
                  <Button 
                    onClick={handleDisconnect}
                    variant="destructive"
                    className="flex-1"
                  >
                    Disconnect
                  </Button>
                  
                  {neko.state.controlling ? (
                    <Button 
                      onClick={() => neko.releaseControl()}
                      variant="outline"
                      className="flex-1"
                    >
                      Release Control
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => neko.requestControl()}
                      variant="outline"
                      className="flex-1"
                    >
                      Request Control
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
