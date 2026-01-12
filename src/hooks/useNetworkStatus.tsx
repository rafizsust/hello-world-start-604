import { useCallback, useSyncExternalStore } from "react";

interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean;
  lastOnlineAt: Date | null;
  lastOfflineAt: Date | null;
}

type NetworkListener = () => void;

// Global state for network status - ensures all components share same state
let networkState = {
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  wasOffline: false,
  lastOnlineAt: null as Date | null,
  lastOfflineAt: null as Date | null,
};

// Subscribers for useSyncExternalStore pattern
const subscribers = new Set<() => void>();

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot(): NetworkStatus {
  return networkState;
}

function notifySubscribers() {
  subscribers.forEach((cb) => cb());
}

// Global listeners for network restoration callbacks
const restorationListeners = new Set<NetworkListener>();

// Setup global event listeners (only once)
if (typeof window !== "undefined") {
  const handleOnline = () => {
    console.log("[NetworkStatus] Network restored");
    networkState = {
      isOnline: true,
      wasOffline: true,
      lastOnlineAt: new Date(),
      lastOfflineAt: networkState.lastOfflineAt,
    };
    notifySubscribers();

    // Notify all restoration listeners
    restorationListeners.forEach((callback) => {
      try {
        callback();
      } catch (e) {
        console.error("Network restore callback error:", e);
      }
    });
  };

  const handleOffline = () => {
    console.log("[NetworkStatus] Network lost");
    networkState = {
      isOnline: false,
      wasOffline: networkState.wasOffline,
      lastOnlineAt: networkState.lastOnlineAt,
      lastOfflineAt: new Date(),
    };
    notifySubscribers();
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
}

/**
 * Hook to monitor network connectivity status with recovery detection
 * Uses useSyncExternalStore for reliable state updates across all components
 */
export function useNetworkStatus(): NetworkStatus & {
  onNetworkRestored: (callback: NetworkListener) => () => void;
  retryFailedAudio: () => void;
} {
  // Use useSyncExternalStore for reliable, synchronous updates
  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Register a callback to be called when network is restored
  const onNetworkRestored = useCallback((callback: NetworkListener) => {
    restorationListeners.add(callback);
    return () => {
      restorationListeners.delete(callback);
    };
  }, []);

  // Manual trigger for retrying (dispatches custom event)
  const retryFailedAudio = useCallback(() => {
    window.dispatchEvent(new CustomEvent("network-retry-audio"));
  }, []);

  return { ...status, onNetworkRestored, retryFailedAudio };
}

export default useNetworkStatus;
