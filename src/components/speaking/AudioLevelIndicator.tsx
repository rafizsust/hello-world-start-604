import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface AudioLevelIndicatorProps {
  stream: MediaStream | null;
  isActive: boolean;
  className?: string;
  variant?: 'bars' | 'circle';
}

export function AudioLevelIndicator({ 
  stream, 
  isActive, 
  className,
  variant = 'bars' 
}: AudioLevelIndicatorProps) {
  const [audioLevel, setAudioLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream || !isActive) {
      setAudioLevel(0);
      return;
    }

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 256;
      analyzer.smoothingTimeConstant = 0.8;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyzer);

      audioContextRef.current = audioContext;
      analyzerRef.current = analyzer;

      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!analyzerRef.current) return;

        analyzerRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average volume level
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const normalizedLevel = Math.min(1, average / 128);
        
        setAudioLevel(normalizedLevel);
        animationRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn('AudioLevelIndicator: Failed to create audio context:', err);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [stream, isActive]);

  if (!isActive) return null;

  if (variant === 'circle') {
    return (
      <div className={cn("relative flex items-center justify-center", className)}>
        {/* Outer pulsing ring based on audio level */}
        <div 
          className="absolute inset-0 rounded-full bg-destructive/20 transition-transform duration-75"
          style={{ 
            transform: `scale(${1 + audioLevel * 0.3})`,
            opacity: 0.5 + audioLevel * 0.5 
          }}
        />
        {/* Inner level ring */}
        <div 
          className="absolute inset-2 rounded-full border-4 border-destructive transition-opacity duration-75"
          style={{ opacity: 0.3 + audioLevel * 0.7 }}
        />
      </div>
    );
  }

  // Default bars variant
  const barCount = 5;
  const bars = Array.from({ length: barCount }, (_, i) => {
    const threshold = (i + 1) / barCount;
    const isActive = audioLevel >= threshold * 0.8;
    const height = 8 + (i * 4); // Progressive height: 8, 12, 16, 20, 24
    
    return (
      <div
        key={i}
        className={cn(
          "w-1.5 rounded-full transition-all duration-75",
          isActive ? "bg-destructive" : "bg-muted-foreground/30"
        )}
        style={{ 
          height: `${height}px`,
          transform: isActive ? `scaleY(${0.6 + audioLevel * 0.4})` : 'scaleY(0.4)'
        }}
      />
    );
  });

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {bars}
    </div>
  );
}
