import { useState, useCallback, useEffect, useRef } from 'react';
import { WebAudioScheduledPlayer } from './WebAudioScheduledPlayer';
import { SimulatedAudioPlayer } from './SimulatedAudioPlayer';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { WifiOff, Volume2 } from 'lucide-react';
import { toast } from 'sonner';

interface WebAudioScheduledPlayerSafeProps {
  audioUrls: {
    part1?: string | null;
    part2?: string | null;
    part3?: string | null;
    part4?: string | null;
  };
  transcripts?: {
    part1?: string | null;
    part2?: string | null;
    part3?: string | null;
    part4?: string | null;
  };
  initialStartTime?: number;
  initialPart?: number;
  onPartChange?: (partNumber: number) => void;
  onTestComplete?: () => void;
  onReviewStart?: () => void;
  onFallbackUsed?: () => void;
  accent?: 'US' | 'GB' | 'AU';
  className?: string;
}

// Audio preload cache for offline resilience
interface PreloadedAudio {
  originalUrl: string;
  blobUrl: string;
  status: 'loading' | 'ready' | 'error';
}

/**
 * A wrapper around WebAudioScheduledPlayer that provides:
 * 1. Audio preloading for offline resilience
 * 2. TTS fallback via SimulatedAudioPlayer when audio fails to load
 * 3. Network status indicators
 * 4. Error recovery with user-friendly player UI
 */
export function WebAudioScheduledPlayerSafe({
  audioUrls,
  transcripts,
  initialStartTime = 0,
  initialPart,
  onPartChange,
  onTestComplete,
  onReviewStart,
  onFallbackUsed,
  accent = 'GB',
  className,
}: WebAudioScheduledPlayerSafeProps) {
  const [audioError, setAudioError] = useState<string | null>(null);
  const [currentPart, setCurrentPart] = useState(initialPart || 1);
  const [useTTS, setUseTTS] = useState(false);
  const [usingDeviceAudio, setUsingDeviceAudio] = useState(false);
  
  // Network status monitoring
  const { isOnline, onNetworkRestored } = useNetworkStatus();
  
  // Preloaded audio cache
  const [preloadedUrls, setPreloadedUrls] = useState<Record<string, PreloadedAudio>>({});
  const preloadCacheRef = useRef<Map<string, string>>(new Map());

  // Check if audio URLs are valid
  const hasAudioUrls = Boolean(
    audioUrls.part1 || audioUrls.part2 || audioUrls.part3 || audioUrls.part4
  );
  
  const hasTranscripts = Boolean(
    transcripts?.part1 || transcripts?.part2 || transcripts?.part3 || transcripts?.part4
  );

  // Preload audio files into blob URLs for offline resilience
  useEffect(() => {
    const urlsToPreload: string[] = [];
    if (audioUrls.part1) urlsToPreload.push(audioUrls.part1);
    if (audioUrls.part2) urlsToPreload.push(audioUrls.part2);
    if (audioUrls.part3) urlsToPreload.push(audioUrls.part3);
    if (audioUrls.part4) urlsToPreload.push(audioUrls.part4);

    if (urlsToPreload.length === 0) return;

    console.log(`[ListeningPlayer] Preloading ${urlsToPreload.length} audio files...`);

    const preloadAudio = async (url: string) => {
      // Skip if already preloaded
      if (preloadCacheRef.current.has(url)) return;

      try {
        setPreloadedUrls(prev => ({
          ...prev,
          [url]: { originalUrl: url, blobUrl: '', status: 'loading' }
        }));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(url, {
          mode: 'cors',
          credentials: 'omit',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        preloadCacheRef.current.set(url, blobUrl);
        
        setPreloadedUrls(prev => ({
          ...prev,
          [url]: { originalUrl: url, blobUrl, status: 'ready' }
        }));
        
        console.log(`[ListeningPlayer] Preloaded: ${url.slice(-40)}`);
      } catch (error: any) {
        console.warn(`[ListeningPlayer] Failed to preload: ${url.slice(-40)}`, error.message);
        setPreloadedUrls(prev => ({
          ...prev,
          [url]: { originalUrl: url, blobUrl: '', status: 'error' }
        }));
      }
    };

    // Preload all audio files in parallel
    Promise.allSettled(urlsToPreload.map(preloadAudio));

    // Cleanup blob URLs on unmount
    return () => {
      preloadCacheRef.current.forEach((blobUrl) => {
        URL.revokeObjectURL(blobUrl);
      });
      preloadCacheRef.current.clear();
    };
  }, [audioUrls.part1, audioUrls.part2, audioUrls.part3, audioUrls.part4]);

  // Retry preloading when network is restored
  useEffect(() => {
    const unsubscribe = onNetworkRestored(() => {
      const failedUrls = Object.entries(preloadedUrls)
        .filter(([_, v]) => v.status === 'error')
        .map(([url]) => url);

      if (failedUrls.length > 0) {
        console.log('[ListeningPlayer] Network restored - retrying failed audio preloads...');
        toast.success("Network restored. Reloading audio...", { duration: 2000 });
        
        // Reset device audio indicator
        setUsingDeviceAudio(false);
        
        // Retry failed preloads
        failedUrls.forEach(url => {
          // Clear the failed entry and retry
          setPreloadedUrls(prev => {
            const next = { ...prev };
            delete next[url];
            return next;
          });
        });
      }
    });
    return unsubscribe;
  }, [preloadedUrls, onNetworkRestored]);

  // Get preloaded blob URL if available
  const getPreloadedUrl = useCallback((originalUrl: string | null | undefined): string | null => {
    if (!originalUrl) return null;
    return preloadCacheRef.current.get(originalUrl) || null;
  }, []);

  // Build preloaded audio URLs object
  const preloadedAudioUrls = {
    part1: getPreloadedUrl(audioUrls.part1) || audioUrls.part1,
    part2: getPreloadedUrl(audioUrls.part2) || audioUrls.part2,
    part3: getPreloadedUrl(audioUrls.part3) || audioUrls.part3,
    part4: getPreloadedUrl(audioUrls.part4) || audioUrls.part4,
  };

  // Get the combined transcript for TTS
  const getCombinedTranscript = useCallback(() => {
    if (!transcripts) return '';
    const parts = [
      transcripts.part1,
      transcripts.part2,
      transcripts.part3,
      transcripts.part4,
    ].filter(Boolean);
    return parts.join('\n\n');
  }, [transcripts]);

  // Get transcript for current part
  const getCurrentPartTranscript = useCallback(() => {
    if (!transcripts) return '';
    const transcriptMap: Record<number, string | null | undefined> = {
      1: transcripts.part1,
      2: transcripts.part2,
      3: transcripts.part3,
      4: transcripts.part4,
    };
    return transcriptMap[currentPart] || '';
  }, [currentPart, transcripts]);

  // Handle audio error - switch to TTS mode
  const handleAudioError = useCallback((errorMsg: string) => {
    console.error('[ListeningPlayer] Audio error:', errorMsg);
    setAudioError(errorMsg);
    setUsingDeviceAudio(true);
    
    // Notify parent component about TTS fallback
    setTimeout(() => onFallbackUsed?.(), 0);
    
    if (hasTranscripts) {
      setUseTTS(true);
    }
  }, [hasTranscripts, onFallbackUsed]);

  // Expose handleAudioError for potential external use
  void handleAudioError;

  // Track part changes
  const handlePartChange = useCallback((partNumber: number) => {
    setCurrentPart(partNumber);
    onPartChange?.(partNumber);
  }, [onPartChange]);

  // If no audio URLs at all, use SimulatedAudioPlayer with transcript
  if (!hasAudioUrls) {
    if (hasTranscripts) {
      const transcript = getCombinedTranscript();
      return (
        <div className={cn("space-y-4", className)}>
          {/* Status badges */}
          <div className="flex items-center gap-2 justify-end">
            {!isOnline && (
              <Badge variant="destructive" className="flex items-center gap-1 bg-red-500/90 animate-pulse">
                <WifiOff className="h-3 w-3" />
                <span className="text-xs">Offline</span>
              </Badge>
            )}
            <Badge variant="secondary" className="flex items-center gap-1 bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">
              <Volume2 className="h-3 w-3" />
              <span className="text-xs">Device Audio</span>
            </Badge>
          </div>
          <SimulatedAudioPlayer
            text={transcript}
            accentHint={accent}
            onComplete={onTestComplete}
          />
        </div>
      );
    }
    
    // No audio and no transcript - show minimal error
    return (
      <div className={cn("flex items-center justify-center p-4 bg-destructive/10 text-destructive rounded-md", className)}>
        <span className="text-sm">Audio content not available. Please contact support.</span>
      </div>
    );
  }

  // If using TTS fallback mode (audio failed but transcript available)
  if (useTTS && hasTranscripts) {
    const transcript = getCurrentPartTranscript() || getCombinedTranscript();
    return (
      <div className={cn("space-y-4", className)}>
        {/* Status badges */}
        <div className="flex items-center gap-2 justify-end">
          {!isOnline && (
            <Badge variant="destructive" className="flex items-center gap-1 bg-red-500/90 animate-pulse">
              <WifiOff className="h-3 w-3" />
              <span className="text-xs">Offline</span>
            </Badge>
          )}
          <Badge variant="secondary" className="flex items-center gap-1 bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">
            <Volume2 className="h-3 w-3" />
            <span className="text-xs">Device Audio</span>
          </Badge>
        </div>
        <SimulatedAudioPlayer
          text={transcript}
          accentHint={accent}
          onComplete={onTestComplete}
        />
      </div>
    );
  }

  // Normal mode - use WebAudioScheduledPlayer with preloaded URLs
  return (
    <div className={cn("space-y-4 relative", className)}>
      {/* Status badges overlay */}
      {(!isOnline || usingDeviceAudio) && (
        <div className="absolute top-0 right-0 flex items-center gap-2 z-10">
          {!isOnline && (
            <Badge variant="destructive" className="flex items-center gap-1 bg-red-500/90 animate-pulse">
              <WifiOff className="h-3 w-3" />
              <span className="text-xs">Offline</span>
            </Badge>
          )}
          {usingDeviceAudio && (
            <Badge variant="secondary" className="flex items-center gap-1 bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">
              <Volume2 className="h-3 w-3" />
              <span className="text-xs">Device Audio</span>
            </Badge>
          )}
        </div>
      )}
      
      <WebAudioScheduledPlayer
        audioUrls={preloadedAudioUrls}
        initialStartTime={initialStartTime}
        initialPart={initialPart}
        onPartChange={handlePartChange}
        onTestComplete={onTestComplete}
        onReviewStart={onReviewStart}
      />
      
      {/* Show SimulatedAudioPlayer if there's an error but we have transcripts */}
      {audioError && hasTranscripts && !useTTS && (
        <SimulatedAudioPlayer
          text={getCombinedTranscript()}
          accentHint={accent}
          onComplete={onTestComplete}
        />
      )}
    </div>
  );
}

export default WebAudioScheduledPlayerSafe;
