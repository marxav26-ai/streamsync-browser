import { NekoBrowser } from '@/components/neko';

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-4 border-b border-border">
        <h1 className="text-xl font-bold text-foreground">Neko Browser Client</h1>
        <p className="text-sm text-muted-foreground">
          Remote browser streaming via WebRTC
        </p>
      </header>
      
      <main className="flex-1 min-h-0">
        <NekoBrowser className="h-full" />
      </main>
    </div>
  );
};

export default Index;
