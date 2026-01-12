import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiErrorDescriptor } from '@/lib/apiErrors';
import { AlertTriangle, ArrowLeft, Settings, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';

interface SubmissionErrorStateProps {
  error: ApiErrorDescriptor;
  onResubmit: () => void;
  isResubmitting: boolean;
  testTopic?: string;
  module?: 'speaking' | 'writing' | 'reading' | 'listening';
  /** Custom back link (defaults to /ai-practice) */
  backLink?: string;
  /** Custom back label (defaults to "Return to AI Practice") */
  backLabel?: string;
}

export function SubmissionErrorState({
  error,
  onResubmit,
  isResubmitting,
  testTopic,
  module = 'speaking',
  backLink = '/ai-practice',
  backLabel = 'Return to AI Practice',
}: SubmissionErrorStateProps) {
  const preservedContentMessage = module === 'speaking' 
    ? 'Your test answers and audio recordings have been preserved.' 
    : module === 'writing'
      ? 'Your written responses have been preserved.'
      : 'Your answers have been preserved.';
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">{error.title}</CardTitle>
          {testTopic && (
            <p className="text-sm text-muted-foreground mt-1">Topic: {testTopic}</p>
          )}
        </CardHeader>
        
        <CardContent className="space-y-6">
          <p className="text-center text-muted-foreground">{error.description}</p>
          
          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="font-medium text-sm mb-2">Your work is safe!</h4>
            <p className="text-sm text-muted-foreground">
              {preservedContentMessage} You can try submitting again after resolving the issue.
            </p>
          </div>
          
          <div className="space-y-3">
            {/* Resubmit button */}
            <Button
              onClick={onResubmit}
              disabled={isResubmitting}
              className="w-full gap-2"
              size="lg"
            >
              <RotateCcw className={`w-4 h-4 ${isResubmitting ? 'animate-spin' : ''}`} />
              {isResubmitting ? 'Submitting...' : 'Try Again'}
            </Button>
            
            {/* Settings link for API key issues */}
            {(error.kind === 'quota' || error.kind === 'invalid_key' || error.kind === 'key_suspended') && (
              <Link to="/settings" className="block">
                <Button variant="outline" className="w-full gap-2">
                  <Settings className="w-4 h-4" />
                  Go to Settings
                </Button>
              </Link>
            )}
            
            {/* Return link */}
            <Link to={backLink} className="block">
              <Button variant="ghost" className="w-full gap-2">
                <ArrowLeft className="w-4 h-4" />
                {backLabel}
              </Button>
            </Link>
          </div>
          
          <p className="text-xs text-center text-muted-foreground">
            If the issue persists, please check your internet connection or try again later.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
