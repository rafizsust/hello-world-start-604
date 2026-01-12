import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateBandScoreFromPercentage,
  calculateListeningBandScoreFromRaw,
  processMCMAGroup,
  normalizeAnswer,
  checkAnswerWithAlternatives,
  checkMCMAAnswer,
  calculateSubmitStats,
  saveFailedSubmission,
  loadFailedSubmission,
  clearFailedSubmission,
  hasFailedSubmission,
  savePendingTestState,
  loadPendingTestState,
  clearPendingTestState,
  isRetryableError,
  withRetry,
} from '../useTestSubmission';

describe('calculateBandScoreFromPercentage', () => {
  it('returns 9 for percentage >= 93', () => {
    expect(calculateBandScoreFromPercentage(93)).toBe(9);
    expect(calculateBandScoreFromPercentage(100)).toBe(9);
  });

  it('returns 8.5 for percentage >= 85 and < 93', () => {
    expect(calculateBandScoreFromPercentage(85)).toBe(8.5);
    expect(calculateBandScoreFromPercentage(92)).toBe(8.5);
  });

  it('returns 8 for percentage >= 78 and < 85', () => {
    expect(calculateBandScoreFromPercentage(78)).toBe(8);
    expect(calculateBandScoreFromPercentage(84)).toBe(8);
  });

  it('returns 7.5 for percentage >= 70 and < 78', () => {
    expect(calculateBandScoreFromPercentage(70)).toBe(7.5);
    expect(calculateBandScoreFromPercentage(77)).toBe(7.5);
  });

  it('returns 7 for percentage >= 63 and < 70', () => {
    expect(calculateBandScoreFromPercentage(63)).toBe(7);
    expect(calculateBandScoreFromPercentage(69)).toBe(7);
  });

  it('returns 6.5 for percentage >= 55 and < 63', () => {
    expect(calculateBandScoreFromPercentage(55)).toBe(6.5);
    expect(calculateBandScoreFromPercentage(62)).toBe(6.5);
  });

  it('returns 6 for percentage >= 48 and < 55', () => {
    expect(calculateBandScoreFromPercentage(48)).toBe(6);
    expect(calculateBandScoreFromPercentage(54)).toBe(6);
  });

  it('returns 5.5 for percentage >= 40 and < 48', () => {
    expect(calculateBandScoreFromPercentage(40)).toBe(5.5);
    expect(calculateBandScoreFromPercentage(47)).toBe(5.5);
  });

  it('returns 5 for percentage >= 33 and < 40', () => {
    expect(calculateBandScoreFromPercentage(33)).toBe(5);
    expect(calculateBandScoreFromPercentage(39)).toBe(5);
  });

  it('returns 4.5 for percentage >= 25 and < 33', () => {
    expect(calculateBandScoreFromPercentage(25)).toBe(4.5);
    expect(calculateBandScoreFromPercentage(32)).toBe(4.5);
  });

  it('returns 4 for percentage >= 18 and < 25', () => {
    expect(calculateBandScoreFromPercentage(18)).toBe(4);
    expect(calculateBandScoreFromPercentage(24)).toBe(4);
  });

  it('returns 3.5 for percentage >= 13 and < 18', () => {
    expect(calculateBandScoreFromPercentage(13)).toBe(3.5);
    expect(calculateBandScoreFromPercentage(17)).toBe(3.5);
  });

  it('returns 3 for percentage >= 8 and < 13', () => {
    expect(calculateBandScoreFromPercentage(8)).toBe(3);
    expect(calculateBandScoreFromPercentage(12)).toBe(3);
  });

  it('returns 2.5 for percentage < 8', () => {
    expect(calculateBandScoreFromPercentage(7)).toBe(2.5);
    expect(calculateBandScoreFromPercentage(0)).toBe(2.5);
  });
});

describe('calculateListeningBandScoreFromRaw', () => {
  it('returns 9 for 39+ correct answers', () => {
    expect(calculateListeningBandScoreFromRaw(39)).toBe(9);
    expect(calculateListeningBandScoreFromRaw(40)).toBe(9);
  });

  it('returns 8.5 for 37-38 correct answers', () => {
    expect(calculateListeningBandScoreFromRaw(37)).toBe(8.5);
    expect(calculateListeningBandScoreFromRaw(38)).toBe(8.5);
  });

  it('returns 8 for 35-36 correct answers', () => {
    expect(calculateListeningBandScoreFromRaw(35)).toBe(8);
    expect(calculateListeningBandScoreFromRaw(36)).toBe(8);
  });

  it('returns 7.5 for 32-34 correct answers', () => {
    expect(calculateListeningBandScoreFromRaw(32)).toBe(7.5);
    expect(calculateListeningBandScoreFromRaw(34)).toBe(7.5);
  });

  it('returns 7 for 30-31 correct answers', () => {
    expect(calculateListeningBandScoreFromRaw(30)).toBe(7);
    expect(calculateListeningBandScoreFromRaw(31)).toBe(7);
  });

  it('returns 6.5 for 26-29 correct answers', () => {
    expect(calculateListeningBandScoreFromRaw(26)).toBe(6.5);
    expect(calculateListeningBandScoreFromRaw(29)).toBe(6.5);
  });

  it('returns 6 for 23-25 correct answers', () => {
    expect(calculateListeningBandScoreFromRaw(23)).toBe(6);
    expect(calculateListeningBandScoreFromRaw(25)).toBe(6);
  });

  it('returns 5.5 for 18-22 correct answers', () => {
    expect(calculateListeningBandScoreFromRaw(18)).toBe(5.5);
    expect(calculateListeningBandScoreFromRaw(22)).toBe(5.5);
  });

  it('returns 5 for 16-17 correct answers', () => {
    expect(calculateListeningBandScoreFromRaw(16)).toBe(5);
    expect(calculateListeningBandScoreFromRaw(17)).toBe(5);
  });

  it('returns 4 for less than 16 correct answers', () => {
    expect(calculateListeningBandScoreFromRaw(15)).toBe(4);
    expect(calculateListeningBandScoreFromRaw(0)).toBe(4);
  });
});

describe('processMCMAGroup', () => {
  it('returns correct result when all answers match', () => {
    const result = processMCMAGroup(1, 3, 'A,B,C', 'A,B,C', 'Test explanation');
    
    expect(result.questionNumber).toBe(1);
    expect(result.questionNumbers).toEqual([1, 2, 3]);
    expect(result.userAnswer).toBe('A,B,C');
    expect(result.correctAnswer).toBe('A,B,C');
    expect(result.isCorrect).toBe(true);
    expect(result.partialScore).toBe(3);
    expect(result.maxScore).toBe(3);
    expect(result.explanation).toBe('Test explanation');
    expect(result.questionType).toBe('MULTIPLE_CHOICE_MULTIPLE');
  });

  it('returns partial score when some answers match', () => {
    const result = processMCMAGroup(1, 2, 'A,C', 'A,B', '');
    
    expect(result.isCorrect).toBe(false);
    expect(result.partialScore).toBe(1); // Only A is correct
    expect(result.maxScore).toBe(2);
    expect(result.userAnswer).toBe('A,C');
    expect(result.correctAnswer).toBe('A,B');
  });

  it('returns zero partial score when no answers match', () => {
    const result = processMCMAGroup(5, 6, 'C,D', 'A,B', '');
    
    expect(result.isCorrect).toBe(false);
    expect(result.partialScore).toBe(0);
    expect(result.maxScore).toBe(2);
  });

  it('handles case-insensitive matching', () => {
    const result = processMCMAGroup(1, 2, 'a,b', 'A,B', '');
    
    expect(result.isCorrect).toBe(true);
    expect(result.partialScore).toBe(2);
    expect(result.userAnswer).toBe('A,B'); // Normalized to uppercase
  });

  it('handles empty user answer', () => {
    const result = processMCMAGroup(1, 2, '', 'A,B', '');
    
    expect(result.isCorrect).toBe(false);
    expect(result.partialScore).toBe(0);
    expect(result.maxScore).toBe(2);
    expect(result.userAnswer).toBe('');
  });

  it('handles whitespace in answers', () => {
    const result = processMCMAGroup(1, 2, ' A , B ', ' A , B ', '');
    
    expect(result.isCorrect).toBe(true);
    expect(result.partialScore).toBe(2);
  });

  it('marks as incorrect when user selects more than correct answers', () => {
    const result = processMCMAGroup(1, 2, 'A,B,C', 'A,B', '');
    
    expect(result.isCorrect).toBe(false); // Extra selection C makes it incorrect
    expect(result.partialScore).toBe(2); // But still gets partial credit for A,B
    expect(result.maxScore).toBe(2);
  });

  it('marks as incorrect when user selects fewer than correct answers', () => {
    const result = processMCMAGroup(1, 3, 'A', 'A,B,C', '');
    
    expect(result.isCorrect).toBe(false);
    expect(result.partialScore).toBe(1);
    expect(result.maxScore).toBe(3);
  });
});

describe('normalizeAnswer', () => {
  it('converts to lowercase and trims', () => {
    expect(normalizeAnswer('  HELLO  ')).toBe('hello');
    expect(normalizeAnswer('Test')).toBe('test');
    expect(normalizeAnswer('  Mixed Case  ')).toBe('mixed case');
  });

  it('handles empty string', () => {
    expect(normalizeAnswer('')).toBe('');
    expect(normalizeAnswer('   ')).toBe('');
  });
});

describe('checkAnswerWithAlternatives', () => {
  it('matches exact answer', () => {
    expect(checkAnswerWithAlternatives('hello', 'hello')).toBe(true);
    expect(checkAnswerWithAlternatives('HELLO', 'hello')).toBe(true);
  });

  it('matches any alternative separated by slash', () => {
    expect(checkAnswerWithAlternatives('colour', 'colour/color')).toBe(true);
    expect(checkAnswerWithAlternatives('color', 'colour/color')).toBe(true);
    expect(checkAnswerWithAlternatives('COLOR', 'colour/color')).toBe(true);
  });

  it('handles multiple alternatives', () => {
    expect(checkAnswerWithAlternatives('a', 'a/b/c')).toBe(true);
    expect(checkAnswerWithAlternatives('b', 'a/b/c')).toBe(true);
    expect(checkAnswerWithAlternatives('c', 'a/b/c')).toBe(true);
    expect(checkAnswerWithAlternatives('d', 'a/b/c')).toBe(false);
  });

  it('returns false for non-matching answers', () => {
    expect(checkAnswerWithAlternatives('wrong', 'correct')).toBe(false);
    expect(checkAnswerWithAlternatives('wrong', 'correct/also correct')).toBe(false);
  });

  it('handles whitespace', () => {
    expect(checkAnswerWithAlternatives('  hello  ', 'hello')).toBe(true);
    expect(checkAnswerWithAlternatives('colour', '  colour / color  ')).toBe(true);
  });
});

describe('checkMCMAAnswer', () => {
  it('returns true when all options match exactly', () => {
    expect(checkMCMAAnswer('A,B', 'A,B')).toBe(true);
    expect(checkMCMAAnswer('A,B,C', 'A,B,C')).toBe(true);
  });

  it('handles different order', () => {
    expect(checkMCMAAnswer('B,A', 'A,B')).toBe(true);
    expect(checkMCMAAnswer('C,A,B', 'A,B,C')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(checkMCMAAnswer('a,b', 'A,B')).toBe(true);
    expect(checkMCMAAnswer('A,B', 'a,b')).toBe(true);
  });

  it('returns false when options differ', () => {
    expect(checkMCMAAnswer('A,C', 'A,B')).toBe(false);
    expect(checkMCMAAnswer('A', 'A,B')).toBe(false);
    expect(checkMCMAAnswer('A,B,C', 'A,B')).toBe(false);
  });

  it('handles whitespace', () => {
    expect(checkMCMAAnswer(' A , B ', 'A,B')).toBe(true);
    expect(checkMCMAAnswer('A,B', ' A , B ')).toBe(true);
  });

  it('handles empty answers', () => {
    expect(checkMCMAAnswer('', '')).toBe(true);
    expect(checkMCMAAnswer('', 'A,B')).toBe(false);
    expect(checkMCMAAnswer('A,B', '')).toBe(false);
  });
});

describe('calculateSubmitStats', () => {
  it('calculates basic stats without question groups', () => {
    const answers = { 1: 'A', 2: 'B', 3: '' };
    const questions = [
      { question_number: 1 },
      { question_number: 2 },
      { question_number: 3 },
    ];
    const questionGroups: any[] = [];

    const result = calculateSubmitStats(answers, questions, questionGroups);

    expect(result.totalCount).toBe(3);
    expect(result.answeredCount).toBe(2);
  });

  it('handles MCMA groups correctly', () => {
    const answers = { 1: 'A,B', 4: 'C' }; // Questions 1-3 are MCMA, question 4 is regular
    const questions = [
      { question_number: 1 },
      { question_number: 2 },
      { question_number: 3 },
      { question_number: 4 },
    ];
    const questionGroups = [
      { question_type: 'MULTIPLE_CHOICE_MULTIPLE', start_question: 1, end_question: 3 },
    ];

    const result = calculateSubmitStats(answers, questions, questionGroups);

    expect(result.totalCount).toBe(4); // 3 from MCMA range + 1 regular
    expect(result.answeredCount).toBe(3); // 2 selections for MCMA + 1 regular
  });

  it('uses max_answers from group options when available', () => {
    const answers = { 1: 'A,B' };
    const questions = [{ question_number: 1 }, { question_number: 2 }];
    const questionGroups = [
      { 
        question_type: 'MULTIPLE_CHOICE_MULTIPLE', 
        start_question: 1, 
        end_question: 2,
        options: { max_answers: 3 }
      },
    ];

    const result = calculateSubmitStats(answers, questions, questionGroups);

    expect(result.totalCount).toBe(3); // Uses max_answers
    expect(result.answeredCount).toBe(2); // 2 selections
  });

  it('uses totalQuestionsFromTest as fallback', () => {
    const answers = {};
    const questions: any[] = [];
    const questionGroups: any[] = [];

    const result = calculateSubmitStats(answers, questions, questionGroups, 10);

    expect(result.totalCount).toBe(10);
    expect(result.answeredCount).toBe(0);
  });

  it('defaults to 40 when no data available', () => {
    const answers = {};
    const questions: any[] = [];
    const questionGroups: any[] = [];

    const result = calculateSubmitStats(answers, questions, questionGroups);

    expect(result.totalCount).toBe(40);
    expect(result.answeredCount).toBe(0);
  });

  it('caps answered count at total count', () => {
    const answers = { 1: 'A,B,C,D,E' }; // More selections than allowed
    const questions = [{ question_number: 1 }];
    const questionGroups = [
      { 
        question_type: 'MULTIPLE_CHOICE_MULTIPLE', 
        start_question: 1, 
        end_question: 1,
        options: { max_answers: 2 }
      },
    ];

    const result = calculateSubmitStats(answers, questions, questionGroups);

    expect(result.totalCount).toBe(2);
    expect(result.answeredCount).toBeLessThanOrEqual(result.totalCount);
  });

  it('handles string keys in answers object', () => {
    const answers = { '1': 'A', '2': 'B' };
    const questions = [{ question_number: 1 }, { question_number: 2 }];
    const questionGroups: any[] = [];

    const result = calculateSubmitStats(answers, questions, questionGroups);

    expect(result.answeredCount).toBe(2);
  });
});

// ============================================================================
// Failed Submission Utilities Tests
// ============================================================================

describe('saveFailedSubmission / loadFailedSubmission / clearFailedSubmission', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it('saves and loads a failed submission correctly', () => {
    const failedState = {
      testId: 'test-123',
      testType: 'ai-reading' as const,
      answers: { 1: 'A', 2: 'B' },
      testTopic: 'Environment',
      timeSpent: 1200,
    };

    saveFailedSubmission(failedState);
    const loaded = loadFailedSubmission();

    expect(loaded).not.toBeNull();
    expect(loaded?.testId).toBe('test-123');
    expect(loaded?.testType).toBe('ai-reading');
    expect(loaded?.answers).toEqual({ 1: 'A', 2: 'B' });
    expect(loaded?.testTopic).toBe('Environment');
    expect(loaded?.failedAt).toBeDefined();
  });

  it('returns null when no failed submission exists', () => {
    const loaded = loadFailedSubmission();
    expect(loaded).toBeNull();
  });

  it('filters by testId when provided', () => {
    saveFailedSubmission({
      testId: 'test-123',
      testType: 'ai-reading',
      answers: { 1: 'A' },
    });

    // Should find matching testId
    const foundMatch = loadFailedSubmission('test-123');
    expect(foundMatch).not.toBeNull();

    // Should not find non-matching testId
    const notFound = loadFailedSubmission('test-456');
    expect(notFound).toBeNull();
  });

  it('filters by testType when provided', () => {
    saveFailedSubmission({
      testId: 'test-123',
      testType: 'ai-listening',
      answers: { 1: 'A' },
    });

    // Should find matching testType
    const foundMatch = loadFailedSubmission(undefined, 'ai-listening');
    expect(foundMatch).not.toBeNull();

    // Should not find non-matching testType
    const notFound = loadFailedSubmission(undefined, 'ai-reading');
    expect(notFound).toBeNull();
  });

  it('clears failed submission correctly', () => {
    saveFailedSubmission({
      testId: 'test-123',
      testType: 'ai-reading',
      answers: { 1: 'A' },
    });

    clearFailedSubmission();
    const loaded = loadFailedSubmission();
    expect(loaded).toBeNull();
  });
});

describe('hasFailedSubmission', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns true when failed submission exists for testId', () => {
    saveFailedSubmission({
      testId: 'test-abc',
      testType: 'ai-listening',
      answers: { 1: 'B' },
    });

    expect(hasFailedSubmission('test-abc')).toBe(true);
    expect(hasFailedSubmission('test-xyz')).toBe(false);
  });

  it('returns false when no failed submission exists', () => {
    expect(hasFailedSubmission('test-123')).toBe(false);
  });
});

// ============================================================================
// Pending Test State Utilities Tests
// ============================================================================

describe('savePendingTestState / loadPendingTestState / clearPendingTestState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads pending state correctly', () => {
    const pendingState = {
      testId: 'test-456',
      testType: 'reading' as const,
      answers: { 1: 'TRUE', 2: 'FALSE' },
      currentQuestion: 5,
      currentPassageIndex: 1,
      timeLeft: 3600,
      returnPath: '/reading/test/test-456',
    };

    savePendingTestState(pendingState);
    const loaded = loadPendingTestState();

    expect(loaded).not.toBeNull();
    expect(loaded?.testId).toBe('test-456');
    expect(loaded?.testType).toBe('reading');
    expect(loaded?.answers).toEqual({ 1: 'TRUE', 2: 'FALSE' });
    expect(loaded?.currentQuestion).toBe(5);
    expect(loaded?.autoSubmitOnReturn).toBe(true);
    expect(loaded?.savedAt).toBeDefined();
  });

  it('returns null when no pending state exists', () => {
    const loaded = loadPendingTestState();
    expect(loaded).toBeNull();
  });

  it('clears pending state correctly', () => {
    savePendingTestState({
      testId: 'test-789',
      testType: 'listening',
      answers: {},
      currentQuestion: 1,
      timeLeft: 1800,
      returnPath: '/listening/test/test-789',
    });

    clearPendingTestState();
    const loaded = loadPendingTestState();
    expect(loaded).toBeNull();
  });
});

// ============================================================================
// Retry Utilities Tests
// ============================================================================

describe('isRetryableError', () => {
  it('returns true for network errors', () => {
    expect(isRetryableError(new Error('Failed to fetch'))).toBe(true);
    expect(isRetryableError(new Error('NetworkError when attempting to fetch'))).toBe(true);
    expect(isRetryableError(new Error('network error occurred'))).toBe(true);
    expect(isRetryableError('TypeError: Failed to fetch')).toBe(true);
  });

  it('returns true for timeout errors', () => {
    expect(isRetryableError(new Error('Request timeout'))).toBe(true);
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
  });

  it('returns true for rate limiting (429)', () => {
    expect(isRetryableError(new Error('429 Too Many Requests'))).toBe(true);
    expect(isRetryableError(new Error('rate limit exceeded'))).toBe(true);
  });

  it('returns true for service unavailable (503)', () => {
    expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
    expect(isRetryableError(new Error('service unavailable'))).toBe(true);
  });

  it('returns true for gateway timeout (504)', () => {
    expect(isRetryableError(new Error('504 Gateway Timeout'))).toBe(true);
    expect(isRetryableError(new Error('gateway timeout'))).toBe(true);
  });

  it('returns false for non-retryable errors', () => {
    expect(isRetryableError(new Error('Invalid API key'))).toBe(false);
    expect(isRetryableError(new Error('Unauthorized'))).toBe(false);
    expect(isRetryableError(new Error('Permission denied'))).toBe(false);
    expect(isRetryableError(new Error('Quota exceeded'))).toBe(false);
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns result on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    
    const result = await withRetry(fn);
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue('success');
    
    const resultPromise = withRetry(fn, { maxRetries: 3, initialDelayMs: 100 });
    
    // Fast-forward through the delay
    await vi.advanceTimersByTimeAsync(150);
    
    const result = await resultPromise;
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Invalid API key'));
    
    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow('Invalid API key');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after max retries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    const onRetry = vi.fn();
    
    const resultPromise = withRetry(fn, { maxRetries: 2, initialDelayMs: 50, onRetry });
    
    // Fast-forward through all retries
    await vi.advanceTimersByTimeAsync(500);
    
    await expect(resultPromise).rejects.toThrow('Failed to fetch');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('calls onRetry callback with attempt number', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('success');
    
    const onRetry = vi.fn();
    
    const resultPromise = withRetry(fn, { 
      maxRetries: 3, 
      initialDelayMs: 50,
      onRetry 
    });
    
    // Fast-forward through retries
    await vi.advanceTimersByTimeAsync(500);
    
    await resultPromise;
    
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Number), expect.any(Error));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Number), expect.any(Error));
  });
});
