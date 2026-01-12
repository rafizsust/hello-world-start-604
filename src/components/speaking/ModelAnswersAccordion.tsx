import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sparkles, ChevronDown, ChevronUp, Lightbulb, CheckCircle2, Columns } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Toggle } from '@/components/ui/toggle';

interface ModelAnswer {
  partNumber: number;
  question: string;
  questionNumber?: number;
  candidateResponse?: string;
  modelAnswer?: string; // Legacy - treated as Band 8
  modelAnswerBand6?: string;
  modelAnswerBand7?: string;
  modelAnswerBand8?: string;
  modelAnswerBand9?: string;
  keyFeatures?: string[];
  whyBand6Works?: string[];
  whyBand7Works?: string[];
  whyBand8Works?: string[];
  whyBand9Works?: string[];
}

interface ModelAnswersAccordionProps {
  modelAnswers: ModelAnswer[];
  userBandScore?: number;
  className?: string;
}

const BAND_CONFIG = {
  6: { label: 'Band 6', color: 'border-orange-500', textColor: 'text-orange-600', bgColor: 'bg-orange-500/10' },
  7: { label: 'Band 7', color: 'border-warning', textColor: 'text-warning', bgColor: 'bg-warning/10' },
  8: { label: 'Band 8', color: 'border-success', textColor: 'text-success', bgColor: 'bg-success/10' },
  9: { label: 'Band 9', color: 'border-primary', textColor: 'text-primary', bgColor: 'bg-primary/10' },
} as const;

type BandLevel = keyof typeof BAND_CONFIG;

/**
 * Get the closest band level based on user's achieved score
 * Score 7.5 → Band 8 (rounds to nearest), Score 3.5 → Band 6 (min), Score 8.5 → Band 9
 */
function getClosestBand(userScore?: number): BandLevel {
  if (!userScore || userScore < 6) return 6; // Below 6 → show Band 6 (lowest available)
  
  // Round to nearest band level
  const rounded = Math.round(userScore);
  
  // Clamp to available bands (6-9)
  if (rounded <= 6) return 6;
  if (rounded >= 9) return 9;
  return rounded as BandLevel;
}

function BandAnswerSection({
  band,
  answer,
  whyItWorks,
  isOpen,
  onToggle,
  candidateResponse,
  showComparison,
}: {
  band: BandLevel;
  answer: string;
  whyItWorks?: string[];
  isOpen: boolean;
  onToggle: () => void;
  candidateResponse?: string;
  showComparison: boolean;
}) {
  const config = BAND_CONFIG[band];

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger className="w-full">
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg border-l-4 transition-colors",
          config.color,
          isOpen ? config.bgColor : "bg-muted/30 hover:bg-muted/50"
        )}>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-xs font-bold", config.textColor, config.bgColor)}>
              {config.label}
            </Badge>
            <span className="text-sm text-muted-foreground">Model Answer</span>
          </div>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-3 space-y-3">
          {/* Comparison View - Side by Side */}
          {showComparison && candidateResponse ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Your Response</p>
                <div className="text-sm leading-relaxed p-3 bg-muted/30 rounded-lg border-l-2 border-muted">
                  {candidateResponse}
                </div>
              </div>
              <div className="space-y-1">
                <p className={cn("text-xs font-medium", config.textColor)}>{config.label} Model Answer</p>
                <div className={cn("text-sm leading-relaxed p-3 rounded-lg border-l-2", config.bgColor, config.color)}>
                  {answer}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed pl-4 border-l-2 border-muted">
              {answer}
            </p>
          )}
          
          {whyItWorks && whyItWorks.length > 0 && (
            <div className={cn("rounded-lg p-3", config.bgColor)}>
              <p className={cn("text-xs font-medium mb-2 flex items-center gap-1", config.textColor)}>
                <Lightbulb className="w-3 h-3" />
                Why {config.label} Works:
              </p>
              <ul className="space-y-1">
                {whyItWorks.map((feature, j) => (
                  <li key={j} className="text-xs text-muted-foreground flex items-start gap-2">
                    <CheckCircle2 className={cn("w-3 h-3 flex-shrink-0 mt-0.5", config.textColor)} />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ModelAnswersAccordion({ modelAnswers, userBandScore, className }: ModelAnswersAccordionProps) {
  const closestBand = useMemo(() => getClosestBand(userBandScore), [userBandScore]);
  const [showComparison, setShowComparison] = useState(false);
  
  // Track which bands are open for each question - closest band is open by default
  const [openBands, setOpenBands] = useState<Record<string, Set<BandLevel>>>(() => {
    const initial: Record<string, Set<BandLevel>> = {};
    modelAnswers.forEach((_, i) => {
      initial[`q${i}`] = new Set([closestBand]);
    });
    return initial;
  });

  const toggleBand = (questionKey: string, band: BandLevel) => {
    setOpenBands(prev => {
      const current = prev[questionKey] || new Set();
      const next = new Set(current);
      if (next.has(band)) {
        next.delete(band);
      } else {
        next.add(band);
      }
      return { ...prev, [questionKey]: next };
    });
  };

  // Group by part
  const groupedByPart = useMemo(() => {
    const groups: Record<number, ModelAnswer[]> = {};
    modelAnswers.forEach((answer) => {
      if (!groups[answer.partNumber]) {
        groups[answer.partNumber] = [];
      }
      groups[answer.partNumber].push(answer);
    });
    return groups;
  }, [modelAnswers]);

  // Check if any model answer has candidate response for comparison toggle
  const hasAnyCandidateResponse = useMemo(() => 
    modelAnswers.some(m => !!m.candidateResponse), 
    [modelAnswers]
  );

  if (!modelAnswers || modelAnswers.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">No model answers available for this test.</p>
        </CardContent>
      </Card>
    );
  }

  let globalIndex = 0;

  return (
    <Card className={className}>
      <CardHeader className="p-3 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              Model Answers (Band 6 - 9)
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Compare responses at different band levels. 
              {userBandScore && (
                <span className="font-medium text-primary">
                  {' '}Based on your score of {userBandScore.toFixed(1)}, Band {closestBand} is highlighted.
                </span>
              )}
            </CardDescription>
          </div>
          
          {/* Comparison Toggle */}
          {hasAnyCandidateResponse && (
            <Toggle
              pressed={showComparison}
              onPressedChange={setShowComparison}
              size="sm"
              className="gap-1.5 text-xs"
              aria-label="Toggle comparison view"
            >
              <Columns className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Compare</span>
            </Toggle>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-3 md:p-6 pt-0 md:pt-0">
        {Object.entries(groupedByPart)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([partNum, answers]) => (
            <div key={partNum} className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Part {partNum}</Badge>
                <span className="text-xs text-muted-foreground">
                  {Number(partNum) === 1 ? 'Introduction & Interview' : 
                   Number(partNum) === 2 ? 'Individual Long Turn' : 'Two-way Discussion'}
                </span>
              </div>
              
              {answers.map((model) => {
                const questionKey = `q${globalIndex}`;
                const openSet = openBands[questionKey] || new Set([closestBand]);
                
                // Get available band answers
                const bandAnswers: { band: BandLevel; answer: string; whyItWorks?: string[] }[] = [];
                
                if (model.modelAnswerBand6) {
                  bandAnswers.push({ band: 6, answer: model.modelAnswerBand6, whyItWorks: model.whyBand6Works });
                }
                if (model.modelAnswerBand7) {
                  bandAnswers.push({ band: 7, answer: model.modelAnswerBand7, whyItWorks: model.whyBand7Works });
                }
                // Handle legacy modelAnswer as Band 8
                const band8Answer = model.modelAnswerBand8 || model.modelAnswer;
                if (band8Answer) {
                  bandAnswers.push({ band: 8, answer: band8Answer, whyItWorks: model.whyBand8Works || model.keyFeatures });
                }
                if (model.modelAnswerBand9) {
                  bandAnswers.push({ band: 9, answer: model.modelAnswerBand9, whyItWorks: model.whyBand9Works });
                }
                
                globalIndex++;
                
                return (
                  <div key={`${partNum}-${model.questionNumber || globalIndex}`} className="border rounded-lg p-3 md:p-4 space-y-4">
                    <p className="text-sm font-medium">{model.question}</p>
                    
                    {/* Candidate's Response - Only show if not in comparison mode */}
                    {model.candidateResponse && !showComparison && (
                      <div className="pl-3 md:pl-4 border-l-2 border-muted">
                        <p className="text-[10px] md:text-xs text-muted-foreground mb-1">Your response:</p>
                        <p className="text-xs md:text-sm italic text-muted-foreground">{model.candidateResponse}</p>
                      </div>
                    )}
                    
                    {/* Band Answer Sections */}
                    <div className="space-y-2">
                      {bandAnswers.map(({ band, answer, whyItWorks }) => (
                        <BandAnswerSection
                          key={band}
                          band={band}
                          answer={answer}
                          whyItWorks={whyItWorks}
                          isOpen={openSet.has(band)}
                          onToggle={() => toggleBand(questionKey, band)}
                          candidateResponse={model.candidateResponse}
                          showComparison={showComparison}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
