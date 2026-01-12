import { useEffect, useRef, useCallback } from 'react';
import { WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { toast } from 'sonner';

interface OfflineBannerProps {
  /**
   * Called when network is restored and component wants to trigger auto-submit.
   * Should return a promise that resolves when submission is complete.
   */
  onAutoSubmit?: () => Promise<void>;
  /**
   * Whether there are pending answers that would be lost if connection fails.
   */
  hasPendingAnswers?: boolean;
  /**
   * Optional CSS class to apply to the banner container.
   */
  className?: string;
}

/**
 * A banner that appears when the user goes offline during a test.
 * Shows a warning, and can automatically trigger submission when back online.
 */
export function OfflineBanner({ 
  onAutoSubmit, 
  hasPendingAnswers = false,
  className,
}: OfflineBannerProps) {
  const { isOnline, wasOffline, onNetworkRestored } = useNetworkStatus();
  const isSubmittingRef = useRef(false);
  const hasShownOfflineToast = useRef(false);
  
  // Show toast when going offline
  useEffect(() => {
    if (!isOnline && !hasShownOfflineToast.current) {
      hasShownOfflineToast.current = true;
      toast.warning('You are offline', {
        description: 'Your answers are being saved locally. They will be submitted when you reconnect.',
        duration: 5000,
        id: 'offline-warning',
      });
    } else if (isOnline) {
      hasShownOfflineToast.current = false;
    }
  }, [isOnline]);

  // Handle network restoration with auto-submit
  const handleNetworkRestored = useCallback(async () => {
    if (isSubmittingRef.current) return;
    
    toast.dismiss('offline-warning');
    toast.success('Back online!', {
      description: hasPendingAnswers && onAutoSubmit 
        ? 'Attempting to submit your answers...' 
        : 'Connection restored.',
      duration: 3000,
      id: 'online-restored',
    });

    // Auto-submit if callback provided and there are pending answers
    if (onAutoSubmit && hasPendingAnswers) {
      isSubmittingRef.current = true;
      try {
        await onAutoSubmit();
        toast.success('Submission successful!', { 
          duration: 3000,
          id: 'auto-submit-success' 
        });
      } catch (err) {
        console.error('[OfflineBanner] Auto-submit failed:', err);
        toast.error('Auto-submit failed', {
          description: 'Please try submitting manually.',
          duration: 5000,
          id: 'auto-submit-error',
        });
      } finally {
        isSubmittingRef.current = false;
      }
    }
  }, [onAutoSubmit, hasPendingAnswers]);

  // Register for network restoration events
  useEffect(() => {
    const unsubscribe = onNetworkRestored(handleNetworkRestored);
    return unsubscribe;
  }, [onNetworkRestored, handleNetworkRestored]);

  // Don't render if online
  if (isOnline) {
    // Show brief "reconnected" state if was previously offline
    if (wasOffline && isSubmittingRef.current) {
      return (
        <div className={cn(
          'fixed top-0 left-0 right-0 z-50 bg-warning/90 text-warning-foreground',
          'px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium',
          'animate-in slide-in-from-top-2 duration-300',
          className
        )}>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Reconnecting and submitting...</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className={cn(
      'fixed top-0 left-0 right-0 z-50 bg-destructive/95 text-destructive-foreground',
      'px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium',
      'animate-in slide-in-from-top-2 duration-300 shadow-lg',
      className
    )}>
      <WifiOff className="h-4 w-4 shrink-0" />
      <span className="text-center">
        <strong>No internet connection.</strong>
        {hasPendingAnswers && (
          <span className="ml-1">Your answers are saved locally and will submit automatically when reconnected.</span>
        )}
      </span>
    </div>
  );
}

export default OfflineBanner;
