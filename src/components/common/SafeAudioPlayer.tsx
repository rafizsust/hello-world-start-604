import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX, Loader2 } from "lucide-react";
import { SimulatedAudioPlayer } from "@/components/listening/SimulatedAudioPlayer";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

interface SafeAudioPlayerProps {
  audioUrl?: string | null;
  fallbackText?: string;
  accentHint?: string; // 'US', 'GB', 'AU', etc.
  autoPlay?: boolean;
  onEnded?: () => void;
  onError?: (error: string) => void;
  className?: string;
  showControls?: boolean;
  /** Pre-loaded blob URL from useAudioPreloader */
  preloadedUrl?: string | null;
  /** Callback fired when TTS fallback is used */
  onFallbackUsed?: () => void;
}

/**
 * SafeAudioPlayer - Strict Audio Priority Logic with Network Resilience
 * 
 * PRIORITY 1: If preloadedUrl exists → use it (already in memory, works offline)
 * PRIORITY 2: If audioUrl exists AND loads successfully → use HTML5 Audio
 * PRIORITY 3: Fallback to SimulatedAudioPlayer (TTS) - works offline
 * 
 * Network resilience:
 * - Uses timeout for audio loading (5 seconds)
 * - Immediately falls back to TTS on network error
 * - No blocking HEAD requests that can hang
 */
export function SafeAudioPlayer({
  audioUrl,
  fallbackText,
  accentHint,
  autoPlay = false,
  onEnded,
  onError,
  className = "",
  showControls = true,
  preloadedUrl,
  onFallbackUsed,
}: SafeAudioPlayerProps) {
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [useTTSFallback, setUseTTSFallback] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const loadTimeoutRef = useRef<number | null>(null);

  // Determine the actual URL to use (preloaded takes priority)
  const effectiveUrl = preloadedUrl || audioUrl;

  // Network status: if we're offline and the audio isn't preloaded, fall back immediately
  const { isOnline } = useNetworkStatus();

  // Keep latest callbacks without retriggering the load effect on every render
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  const onFallbackUsedRef = useRef(onFallbackUsed);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onFallbackUsedRef.current = onFallbackUsed;
  }, [onFallbackUsed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  // Load and validate audio URL with timeout
  useEffect(() => {
    // Reset state when URL changes
    setLoadError(false);
    setIsLoading(true);
    setIsPlaying(false);
    setProgress(0);
    setUseTTSFallback(false);

    // Clear any existing timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }

    // No URL provided - go straight to TTS fallback
    if (!effectiveUrl) {
      console.log("[SafeAudioPlayer] No audioUrl provided, using TTS fallback");
      setUseTTSFallback(true);
      setIsLoading(false);
      // Defer callback to avoid state update during render
      setTimeout(() => onFallbackUsedRef.current?.(), 0);
      return;
    }

    // If offline and we don't have a preloaded blob URL, don't wait — fall back immediately.
    if (!isOnline && !preloadedUrl) {
      console.warn("[SafeAudioPlayer] Offline without preloaded audio, switching to TTS immediately");
      setUseTTSFallback(true);
      setIsLoading(false);
      setTimeout(() => onFallbackUsedRef.current?.(), 0);
      return;
    }

    // Create audio element and attempt to load
    const audio = new Audio();
    audioRef.current = audio;
    audio.preload = "auto";
    audio.volume = isMuted ? 0 : 1;

    // Set a timeout - if audio doesn't load in 2 seconds, fall back to TTS
    // Reduced from 5s to minimize waiting when network is unstable
    loadTimeoutRef.current = window.setTimeout(() => {
      console.warn("[SafeAudioPlayer] Audio load timeout (2s), switching to TTS");
      audio.src = "";
      setUseTTSFallback(true);
      setIsLoading(false);
      // Defer callback to avoid state update conflicts
      setTimeout(() => onFallbackUsedRef.current?.(), 0);
    }, 2000);

    audio.onloadedmetadata = () => {
      // Clear timeout on successful load
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }

      console.log("SafeAudioPlayer: Audio loaded successfully", { duration: audio.duration });
      setDuration(audio.duration);
      setIsLoading(false);

      if (autoPlay) {
        audio.play().catch((err) => {
          console.error("[SafeAudioPlayer] Autoplay failed, switching to TTS:", err);
          setUseTTSFallback(true);
          // Defer callback
          setTimeout(() => onFallbackUsedRef.current?.(), 0);
        });
      }
    };

    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);

    audio.onended = () => {
      setIsPlaying(false);
      setProgress(0);
      onEndedRef.current?.();
    };

    audio.onerror = (e) => {
      // Clear timeout on error
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }

      console.error("[SafeAudioPlayer] Audio failed, switching to TTS", e, audio.error);
      setUseTTSFallback(true);
      setLoadError(true);
      setIsLoading(false);
      onErrorRef.current?.("Audio failed to load");
      // Defer callback
      setTimeout(() => onFallbackUsedRef.current?.(), 0);
    };

    // Handle network errors during playback
    audio.onstalled = () => {
      console.warn("SafeAudioPlayer: Audio stalled (network issue)");
    };

    audio.onwaiting = () => {
      console.warn("SafeAudioPlayer: Audio waiting for data");
    };

    // Set src to trigger load - NO blocking HEAD request
    audio.src = effectiveUrl;

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
      audio.pause();
      audio.src = "";
    };
  }, [effectiveUrl, autoPlay, isOnline, preloadedUrl, isMuted]);

  // Update muted state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : 1;
    }
  }, [isMuted]);

  // Progress tracking
  useEffect(() => {
    if (isPlaying && audioRef.current && !loadError) {
      progressIntervalRef.current = window.setInterval(() => {
        const audio = audioRef.current;
        if (audio && audio.duration) {
          setProgress((audio.currentTime / audio.duration) * 100);
        }
      }, 100);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isPlaying, loadError]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;

    const newTime = (value[0] / 100) * audio.duration;
    audio.currentTime = newTime;
    setProgress(value[0]);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // ===== STRICT PRIORITY LOGIC =====

  // PRIORITY 2: Fallback to SimulatedAudioPlayer (TTS)
  // This happens when: no URL, URL failed to load, timeout, or network error
  if (useTTSFallback || loadError || !effectiveUrl) {
    if (!fallbackText) {
      // No fallback text available - show minimal error
      return (
        <div className={`flex items-center gap-2 text-destructive ${className}`}>
          <span className="text-sm">Audio unavailable</span>
        </div>
      );
    }

    // Render SimulatedAudioPlayer with TTS - pass autoPlay to start immediately
    return (
      <SimulatedAudioPlayer
        text={fallbackText}
        accentHint={accentHint as "US" | "GB" | "AU" | undefined}
        onComplete={onEnded}
        className={className}
        autoPlay={autoPlay}
      />
    );
  }

  // PRIORITY 1: Render HTML5 Audio player (R2 URL is valid)
  if (!showControls) {
    return null;
  }

  const currentTime = audioRef.current?.currentTime || 0;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Play/Pause Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePlay}
        disabled={isLoading}
        className="h-10 w-10 rounded-full"
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5" />
        )}
      </Button>

      {/* Progress Bar */}
      <div className="flex-1 flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-10 text-right">
          {formatTime(currentTime)}
        </span>
        <Slider
          value={[progress]}
          max={100}
          step={0.1}
          onValueChange={handleSeek}
          disabled={isLoading}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground w-10">
          {formatTime(duration)}
        </span>
      </div>

      {/* Volume Control */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsMuted(!isMuted)}
        className="h-8 w-8"
      >
        {isMuted ? (
          <VolumeX className="h-4 w-4" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

export default SafeAudioPlayer;
