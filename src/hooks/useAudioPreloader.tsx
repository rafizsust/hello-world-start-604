import { useState, useRef, useCallback, useEffect } from "react";

interface PreloadedAudio {
  url: string;
  blob: Blob;
  objectUrl: string;
  status: "loading" | "ready" | "error";
}

interface UseAudioPreloaderReturn {
  preloadAudio: (url: string) => Promise<void>;
  preloadMultiple: (urls: string[]) => Promise<void>;
  getPreloadedUrl: (originalUrl: string) => string | null;
  isPreloaded: (url: string) => boolean;
  isPreloading: (url: string) => boolean;
  clearCache: () => void;
}

/**
 * Hook to preload audio files into memory for offline playback
 * Creates blob URLs from fetched audio that work even when offline
 * Includes retry logic with exponential backoff on network restoration
 */
export function useAudioPreloader(): UseAudioPreloaderReturn {
  const cacheRef = useRef<Map<string, PreloadedAudio>>(new Map());
  const retryAttemptsRef = useRef<Map<string, number>>(new Map());
  const retryTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [, forceUpdate] = useState(0);

  // Cleanup blob URLs and timeouts on unmount
  useEffect(() => {
    return () => {
      cacheRef.current.forEach((audio) => {
        URL.revokeObjectURL(audio.objectUrl);
      });
      cacheRef.current.clear();
      retryTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      retryTimeoutsRef.current.clear();
    };
  }, []);

  // Retry with exponential backoff
  const scheduleRetry = useCallback((url: string, attempt: number) => {
    const maxAttempts = 5;
    if (attempt >= maxAttempts) {
      console.warn(`Max retry attempts reached for: ${url.slice(-40)}`);
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
    console.log(`Scheduling retry ${attempt + 1}/${maxAttempts} for audio in ${delay}ms`);

    const timeoutId = setTimeout(() => {
      retryTimeoutsRef.current.delete(url);
      // Only retry if still in error state and online
      const cached = cacheRef.current.get(url);
      if (cached?.status === "error" && navigator.onLine) {
        cacheRef.current.delete(url); // Clear so preloadAudio can retry
        retryAttemptsRef.current.set(url, attempt + 1);
        preloadAudioInternal(url);
      }
    }, delay);

    retryTimeoutsRef.current.set(url, timeoutId);
  }, []);

  const preloadAudioInternal = useCallback(async (url: string): Promise<void> => {
    // Skip if already cached or loading
    const existing = cacheRef.current.get(url);
    if (existing && existing.status !== "error") {
      return;
    }

    // Mark as loading
    cacheRef.current.set(url, {
      url,
      blob: new Blob(),
      objectUrl: "",
      status: "loading",
    });
    forceUpdate((n) => n + 1);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(url, {
        mode: "cors",
        credentials: "omit",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      cacheRef.current.set(url, {
        url,
        blob,
        objectUrl,
        status: "ready",
      });
      
      // Clear retry attempts on success
      retryAttemptsRef.current.delete(url);
      console.log(`Audio preloaded: ${url.slice(-40)}`);
      forceUpdate((n) => n + 1);
    } catch (error: any) {
      const isNetworkError = error.name === "AbortError" || 
        error.message?.includes("network") || 
        error.message?.includes("Failed to fetch") ||
        !navigator.onLine;

      console.warn(`Failed to preload audio: ${url.slice(-40)}`, error.message);
      
      cacheRef.current.set(url, {
        url,
        blob: new Blob(),
        objectUrl: "",
        status: "error",
      });
      forceUpdate((n) => n + 1);

      // Schedule retry with exponential backoff for network errors
      if (isNetworkError) {
        const currentAttempt = retryAttemptsRef.current.get(url) || 0;
        scheduleRetry(url, currentAttempt);
      }
    }
  }, [scheduleRetry]);

  const preloadAudio = useCallback(async (url: string): Promise<void> => {
    retryAttemptsRef.current.set(url, 0);
    return preloadAudioInternal(url);
  }, [preloadAudioInternal]);

  const preloadMultiple = useCallback(
    async (urls: string[]): Promise<void> => {
      const validUrls = urls.filter((url) => url && !cacheRef.current.has(url));
      await Promise.allSettled(validUrls.map((url) => preloadAudio(url)));
    },
    [preloadAudio]
  );

  const getPreloadedUrl = useCallback((originalUrl: string): string | null => {
    const cached = cacheRef.current.get(originalUrl);
    if (cached?.status === "ready" && cached.objectUrl) {
      return cached.objectUrl;
    }
    return null;
  }, []);

  const isPreloaded = useCallback((url: string): boolean => {
    const cached = cacheRef.current.get(url);
    return cached?.status === "ready";
  }, []);

  const isPreloading = useCallback((url: string): boolean => {
    const cached = cacheRef.current.get(url);
    return cached?.status === "loading";
  }, []);

  const clearCache = useCallback(() => {
    cacheRef.current.forEach((audio) => {
      URL.revokeObjectURL(audio.objectUrl);
    });
    cacheRef.current.clear();
    forceUpdate((n) => n + 1);
  }, []);

  return {
    preloadAudio,
    preloadMultiple,
    getPreloadedUrl,
    isPreloaded,
    isPreloading,
    clearCache,
  };
}

export default useAudioPreloader;
