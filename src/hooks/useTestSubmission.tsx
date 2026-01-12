/**
 * Shared utilities and hook for test submission logic across Reading, Listening, and AI Practice tests.
 * Consolidates common patterns including:
 * - Band score calculation
 * - Answer validation and scoring
 * - Error handling with ApiErrorDescriptor
 * - localStorage state persistence for unauthenticated users
 * - Failed submission preservation for resubmission
 * - Supabase submission
 */

import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { describeApiError, ApiErrorDescriptor } from '@/lib/apiErrors';
import { safeLocalStorageSetItem, safeLocalStorageGetItem } from '@/lib/storage';

// ============================================================================
// Types
// ============================================================================

export type TestModule = 'reading' | 'listening' | 'writing' | 'speaking';

export interface QuestionResultBase {
  questionNumber: number;
  questionNumbers?: number[]; // For grouped questions (MCMA)
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  partialScore?: number;
  maxScore?: number;
  explanation?: string;
  questionType?: string;
  questionText?: string;
}

export interface SubmissionResult {
  id: string;
  score: number;
  total: number;
  percentage: number;
  bandScore: number;
  testTitle: string;
  bookName: string;
  testNumber: number;
  completedAt: string;
  questionResults: QuestionResultBase[];
}

export interface PendingSubmissionState {
  testId: string;
  testType: TestModule;
  answers: Record<number, string>;
  currentQuestion: number;
  currentPassageIndex?: number; // Reading only
  timeLeft: number;
  returnPath: string;
  savedAt: string;
  autoSubmitOnReturn: boolean;
}

/**
 * Failed submission state - preserved when API call fails
 * Allows users to retry submission without losing their work
 */
export interface FailedSubmissionState {
  testId: string;
  testType: TestModule | 'ai-reading' | 'ai-listening' | 'ai-writing' | 'ai-speaking';
  answers: Record<number, string>;
  // Writing-specific
  submissionText?: string;
  submissionText1?: string;
  submissionText2?: string;
  // Test metadata
  testTopic?: string;
  timeSpent?: number;
  // Timestamp
  failedAt: string;
}

export interface TestSubmissionConfig {
  testId: string;
  testType: TestModule;
  tableName: 'reading_test_submissions' | 'listening_test_submissions';
  returnPath: string;
  // For result data
  testTitle?: string;
  bookName?: string;
  testNumber?: number;
}

export interface UseTestSubmissionReturn {
  // State
  submissionError: ApiErrorDescriptor | null;
  isSubmitting: boolean;
  isResubmitting: boolean;
  
  // Actions
  submitTest: (params: SubmitTestParams) => Promise<void>;
  handleResubmit: () => Promise<void>;
  setSubmissionError: (error: ApiErrorDescriptor | null) => void;
  setIsResubmitting: (value: boolean) => void;
  
  // Utilities - exposed from hook
  savePendingState: (state: Omit<PendingSubmissionState, 'savedAt' | 'autoSubmitOnReturn'>) => void;
  clearPendingState: () => void;
}

export interface SubmitTestParams {
  answers: Record<number, string>;
  questionResults: QuestionResultBase[];
  score: number;
  totalQuestions: number;
  bandScore: number;
  config: TestSubmissionConfig;
  // Optional additional state for pending submission
  currentQuestion?: number;
  currentPassageIndex?: number;
  timeLeft?: number;
}

// ============================================================================
// Band Score Calculation (Standalone utilities)
// ============================================================================

/**
 * Calculate IELTS band score based on percentage.
 * Used for AI practice tests and part tests where total questions != 40.
 * Uses a proportional scale derived from the official IELTS conversion.
 */
export function calculateBandScoreFromPercentage(percentage: number): number {
  // Proportional mapping from official IELTS table (40 questions)
  // 0/40 = 0% -> Band 0
  // 1/40 = 2.5% -> Band 1.5
  // 2-3/40 = 5-7.5% -> Band 2
  // 4-5/40 = 10-12.5% -> Band 2.5
  // etc.
  if (percentage === 0) return 0;
  if (percentage <= 2.5) return 1.5;
  if (percentage <= 7.5) return 2;
  if (percentage <= 12.5) return 2.5;
  if (percentage <= 17.5) return 3;
  if (percentage <= 22.5) return 3.5;
  if (percentage <= 30) return 4;
  if (percentage <= 35) return 4.5;
  if (percentage <= 45) return 5;
  if (percentage <= 55) return 5.5;
  if (percentage <= 65) return 6;
  if (percentage <= 72.5) return 6.5;
  if (percentage <= 80) return 7;
  if (percentage <= 85) return 7.5;
  if (percentage <= 90) return 8;
  if (percentage <= 95) return 8.5;
  return 9;
}

/**
 * Calculate band score based on raw score (out of 40).
 * Uses the OFFICIAL IELTS Listening/Reading band score conversion table.
 * This should ONLY be used for Cambridge full tests with exactly 40 questions.
 * 
 * Official IELTS Band Score Conversion Table:
 * Raw Score | Band Score
 * 39-40     | 9
 * 37-38     | 8.5
 * 35-36     | 8
 * 33-34     | 7.5
 * 30-32     | 7
 * 27-29     | 6.5
 * 23-26     | 6
 * 19-22     | 5.5
 * 15-18     | 5
 * 13-14     | 4.5
 * 10-12     | 4
 * 8-9       | 3.5
 * 6-7       | 3
 * 4-5       | 2.5
 * 2-3       | 2
 * 1         | 1.5
 * 0         | 0
 */
export function calculateBandScoreFromRaw40(correctCount: number): number {
  if (correctCount >= 39) return 9;
  if (correctCount >= 37) return 8.5;
  if (correctCount >= 35) return 8;
  if (correctCount >= 33) return 7.5;
  if (correctCount >= 30) return 7;
  if (correctCount >= 27) return 6.5;
  if (correctCount >= 23) return 6;
  if (correctCount >= 19) return 5.5;
  if (correctCount >= 15) return 5;
  if (correctCount >= 13) return 4.5;
  if (correctCount >= 10) return 4;
  if (correctCount >= 8) return 3.5;
  if (correctCount >= 6) return 3;
  if (correctCount >= 4) return 2.5;
  if (correctCount >= 2) return 2;
  if (correctCount >= 1) return 1.5;
  return 0;
}

/**
 * Calculate band score based on raw listening score (out of 40).
 * Uses official IELTS listening band score table.
 * @deprecated Use calculateBandScoreFromRaw40 for full tests or calculateBandScoreFromPercentage for part tests
 */
export function calculateListeningBandScoreFromRaw(correctCount: number): number {
  return calculateBandScoreFromRaw40(correctCount);
}

// ============================================================================
// Pending State Utilities (Standalone) - For unauthenticated users
// ============================================================================

/**
 * Save pending test submission state to localStorage
 */
export function savePendingTestState(state: Omit<PendingSubmissionState, 'savedAt' | 'autoSubmitOnReturn'>): void {
  const fullState: PendingSubmissionState = {
    ...state,
    savedAt: new Date().toISOString(),
    autoSubmitOnReturn: true,
  };
  safeLocalStorageSetItem('pendingTestSubmission', JSON.stringify(fullState));
}

/**
 * Clear pending test submission state from localStorage
 */
export function clearPendingTestState(): void {
  localStorage.removeItem('pendingTestSubmission');
}

/**
 * Load pending test submission state from localStorage
 */
export function loadPendingTestState(): PendingSubmissionState | null {
  const saved = safeLocalStorageGetItem('pendingTestSubmission');
  if (!saved) return null;
  try {
    return JSON.parse(saved) as PendingSubmissionState;
  } catch {
    return null;
  }
}

// ============================================================================
// Failed Submission Utilities - For API failures
// ============================================================================

const FAILED_SUBMISSION_KEY = 'failed_test_submission';
const FAILED_SUBMISSION_EXPIRY_HOURS = 24;

/**
 * Save failed submission state to localStorage for later retry
 */
export function saveFailedSubmission(state: Omit<FailedSubmissionState, 'failedAt'>): void {
  const fullState: FailedSubmissionState = {
    ...state,
    failedAt: new Date().toISOString(),
  };
  safeLocalStorageSetItem(FAILED_SUBMISSION_KEY, JSON.stringify(fullState));
}

/**
 * Load failed submission state from localStorage
 * Returns null if expired or not found
 */
export function loadFailedSubmission(testId?: string, testType?: string): FailedSubmissionState | null {
  const saved = safeLocalStorageGetItem(FAILED_SUBMISSION_KEY);
  if (!saved) return null;
  
  try {
    const state = JSON.parse(saved) as FailedSubmissionState;
    
    // Check expiry
    const failedAt = new Date(state.failedAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - failedAt.getTime()) / (1000 * 60 * 60);
    
    if (hoursDiff > FAILED_SUBMISSION_EXPIRY_HOURS) {
      clearFailedSubmission();
      return null;
    }
    
    // Optional: filter by testId/testType
    if (testId && state.testId !== testId) return null;
    if (testType && state.testType !== testType) return null;
    
    return state;
  } catch {
    clearFailedSubmission();
    return null;
  }
}

/**
 * Clear failed submission state from localStorage
 */
export function clearFailedSubmission(): void {
  localStorage.removeItem(FAILED_SUBMISSION_KEY);
}

/**
 * Check if there's a failed submission for a specific test
 */
export function hasFailedSubmission(testId: string, testType?: string): boolean {
  return loadFailedSubmission(testId, testType) !== null;
}

// ============================================================================
// Retry with Exponential Backoff
// ============================================================================

export interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  /** Called on each retry with attempt number and delay */
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

const DEFAULT_RETRY_CONFIG: Required<Omit<RetryConfig, 'onRetry'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Check if an error is retryable (network/transient errors)
 */
export function isRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  
  // Network errors are always retryable
  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('typeerror') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('enotfound') ||
    msg.includes('connection refused')
  ) {
    return true;
  }
  
  // Rate limiting (429) - can retry after delay
  if (msg.includes('429') || msg.includes('too many requests') || msg.includes('rate limit')) {
    return true;
  }
  
  // Service unavailable (503) - transient
  if (msg.includes('503') || msg.includes('service unavailable')) {
    return true;
  }
  
  // Gateway timeout (504)
  if (msg.includes('504') || msg.includes('gateway timeout')) {
    return true;
  }
  
  return false;
}

/**
 * Execute an async function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const { maxRetries, initialDelayMs, maxDelayMs, backoffMultiplier } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };
  
  let lastError: unknown;
  let delay = initialDelayMs;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry non-retryable errors
      if (!isRetryableError(error)) {
        throw error;
      }
      
      // Don't retry if we've exhausted retries
      if (attempt >= maxRetries) {
        throw error;
      }
      
      // Call onRetry callback
      config.onRetry?.(attempt + 1, delay, error);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Increase delay with exponential backoff (with jitter)
      const jitter = Math.random() * 0.2 + 0.9; // 0.9 to 1.1
      delay = Math.min(delay * backoffMultiplier * jitter, maxDelayMs);
    }
  }
  
  throw lastError;
}

/**
 * Show retry toast notification
 */
export function showRetryToast(attempt: number, maxRetries: number): string {
  const toastId = 'network-retry-toast';
  toast.loading(`Network issue detected. Retrying (${attempt}/${maxRetries})...`, {
    id: toastId,
    duration: 5000,
  });
  return toastId;
}

/**
 * Dismiss retry toast
 */
export function dismissRetryToast(toastId: string): void {
  toast.dismiss(toastId);
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useTestSubmission(): UseTestSubmissionReturn {
  const navigate = useNavigate();
  
  const [submissionError, setSubmissionError] = useState<ApiErrorDescriptor | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);
  
  // Store last submission params for resubmit
  const lastSubmitParamsRef = useRef<SubmitTestParams | null>(null);

  const savePendingState = useCallback((state: Omit<PendingSubmissionState, 'savedAt' | 'autoSubmitOnReturn'>) => {
    savePendingTestState(state);
  }, []);

  const clearPendingState = useCallback(() => {
    clearPendingTestState();
  }, []);

  const submitTest = useCallback(async (params: SubmitTestParams) => {
    const { answers, questionResults, score, totalQuestions, bandScore, config, currentQuestion, currentPassageIndex, timeLeft } = params;
    
    // Store for potential resubmit
    lastSubmitParamsRef.current = params;
    
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      // Check authentication
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        // Save state for unauthenticated user
        savePendingState({
          testId: config.testId,
          testType: config.testType,
          answers,
          currentQuestion: currentQuestion ?? 1,
          currentPassageIndex,
          timeLeft: timeLeft ?? 0,
          returnPath: config.returnPath,
        });
        
        navigate(`/auth?returnTo=${encodeURIComponent(config.returnPath)}&pendingSubmission=true`);
        return;
      }

      // Generate submission ID
      let submissionId = crypto.randomUUID() as `${string}-${string}-${string}-${string}-${string}`;

      // Submit to database
      const { data: submission, error } = await supabase
        .from(config.tableName)
        .insert({
          user_id: user.id,
          test_id: config.testId,
          answers: answers,
          score,
          total_questions: totalQuestions,
          band_score: bandScore,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (submission) {
        submissionId = submission.id as `${string}-${string}-${string}-${string}-${string}`;
      }

      // Clear pending submission data
      clearPendingState();

      // Store result in sessionStorage for the results page
      const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
      const resultData: SubmissionResult = {
        id: submissionId,
        score,
        total: totalQuestions,
        percentage,
        bandScore,
        testTitle: config.testTitle || `${config.testType.charAt(0).toUpperCase() + config.testType.slice(1)} Test`,
        bookName: config.bookName || '',
        testNumber: config.testNumber || 1,
        completedAt: new Date().toISOString(),
        questionResults,
      };

      sessionStorage.setItem(`test_result_${submissionId}`, JSON.stringify(resultData));

      // Navigate to results page
      navigate(`/results/${submissionId}?type=${config.testType}&testId=${config.testId}`);
    } catch (err: unknown) {
      console.error(`Error submitting ${config.testType} test:`, err);
      const errDesc = describeApiError(err);
      setSubmissionError(errDesc);
      toast.error(errDesc.title, { description: 'Your answers are preserved. You can try again.' });
    } finally {
      setIsSubmitting(false);
      setIsResubmitting(false);
    }
  }, [navigate, savePendingState, clearPendingState]);

  const handleResubmit = useCallback(async () => {
    if (!lastSubmitParamsRef.current) {
      toast.error('No submission data available');
      return;
    }
    
    setIsResubmitting(true);
    setSubmissionError(null);
    await submitTest(lastSubmitParamsRef.current);
  }, [submitTest]);

  return {
    submissionError,
    isSubmitting,
    isResubmitting,
    submitTest,
    handleResubmit,
    setSubmissionError,
    setIsResubmitting,
    savePendingState,
    clearPendingState,
  };
}

// ============================================================================
// Answer Checking Utilities
// ============================================================================

/**
 * Basic answer normalization for comparison
 */
export function normalizeAnswer(answer: string): string {
  return answer.toLowerCase().trim();
}

/**
 * Check if user answer matches correct answer with slash alternatives.
 * E.g., "colour/color" accepts both "colour" and "color"
 */
export function checkAnswerWithAlternatives(userAnswer: string, correctAnswer: string): boolean {
  const normalizedUser = normalizeAnswer(userAnswer);
  const alternatives = correctAnswer.split('/').map(a => normalizeAnswer(a));
  return alternatives.some(alt => alt === normalizedUser);
}

/**
 * Check MULTIPLE_CHOICE_MULTIPLE answer (set comparison)
 */
export function checkMCMAAnswer(userAnswer: string, correctAnswer: string): boolean {
  const correctOptions = new Set(
    correctAnswer.split(',').map(opt => opt.trim().toLowerCase()).filter(Boolean)
  );
  const userSelectedOptions = new Set(
    userAnswer.split(',').map(opt => opt.trim().toLowerCase()).filter(Boolean)
  );
  
  return (
    correctOptions.size === userSelectedOptions.size &&
    [...correctOptions].every(opt => userSelectedOptions.has(opt))
  );
}

/**
 * Process MCMA groups for partial scoring
 */
export interface MCMAGroupResult {
  questionNumber: number;
  questionNumbers: number[];
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  partialScore: number;
  maxScore: number;
  explanation: string;
  questionType: 'MULTIPLE_CHOICE_MULTIPLE';
}

export function processMCMAGroup(
  groupStartQuestion: number,
  groupEndQuestion: number,
  userAnswerRaw: string,
  correctAnswerRaw: string,
  explanation: string = ''
): MCMAGroupResult {
  const rangeNumbers: number[] = [];
  for (let n = groupStartQuestion; n <= groupEndQuestion; n++) {
    rangeNumbers.push(n);
  }

  const userLetters = userAnswerRaw
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  const correctLetters = correctAnswerRaw
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  const correctSelections = userLetters.filter(l => correctLetters.includes(l));
  const partialScore = correctSelections.length;
  const maxScore = correctLetters.length;
  const isFullyCorrect = partialScore === maxScore && userLetters.length === maxScore;

  return {
    questionNumber: groupStartQuestion,
    questionNumbers: rangeNumbers,
    userAnswer: userLetters.join(','),
    correctAnswer: correctLetters.join(','),
    isCorrect: isFullyCorrect,
    partialScore,
    maxScore,
    explanation,
    questionType: 'MULTIPLE_CHOICE_MULTIPLE',
  };
}

// ============================================================================
// Submit Stats Calculation (for dialog display)
// ============================================================================

export interface SubmitStats {
  totalCount: number;
  answeredCount: number;
}

/**
 * Calculate submit stats for the submit dialog.
 * Handles MCMA grouped questions appropriately.
 */
export function calculateSubmitStats(
  answers: Record<number | string, string>,
  questions: Array<{ question_number: number }>,
  questionGroups: Array<{
    question_type: string;
    start_question: number;
    end_question: number;
    options?: { max_answers?: number } | null;
  }>,
  totalQuestionsFromTest?: number
): SubmitStats {
  const numericKey = (k: string) => /^\d+$/.test(k);
  const normalizeAnswerValue = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const isAnsweredValue = (v: string) => v.trim().length > 0;

  const normalizedAnswers: Record<number, string> = {};
  for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
    if (!numericKey(k)) continue;
    normalizedAnswers[Number(k)] = normalizeAnswerValue(v);
  }

  const totalCount = (() => {
    const maxFromGroups = questionGroups.length > 0 ? Math.max(...questionGroups.map((g) => g.end_question)) : 0;
    const maxFromQuestions = questions.length > 0 ? Math.max(...questions.map((q) => q.question_number)) : 0;
    const derivedMax = Math.max(maxFromGroups, maxFromQuestions);
    if (derivedMax > 0) return derivedMax;

    if (typeof totalQuestionsFromTest === 'number' && totalQuestionsFromTest > 0) return totalQuestionsFromTest;

    return 40;
  })();

  // MCQ multiple stores all selections on the FIRST question number (comma-separated)
  const mcqMultipleNumbers = new Set<number>();
  let answeredCount = 0;

  const mcqMultipleGroups = questionGroups.filter((g) => g.question_type === 'MULTIPLE_CHOICE_MULTIPLE');
  for (const g of mcqMultipleGroups) {
    const rangeLen = Math.max(0, g.end_question - g.start_question + 1);
    for (let n = g.start_question; n <= g.end_question; n++) mcqMultipleNumbers.add(n);

    const raw = normalizedAnswers[g.start_question] || '';
    const selectedCount = raw
      ? raw.split(',').map((s) => s.trim()).filter(Boolean).length
      : 0;

    answeredCount += Math.min(selectedCount, rangeLen);
  }

  // Everything else: count per question number
  for (let n = 1; n <= totalCount; n++) {
    if (mcqMultipleNumbers.has(n)) continue;
    if (isAnsweredValue(normalizedAnswers[n] || '')) answeredCount++;
  }

  answeredCount = Math.min(answeredCount, totalCount);

  return {
    totalCount,
    answeredCount,
  };
}
