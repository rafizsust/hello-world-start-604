/**
 * IndexedDB-based audio persistence for speaking tests.
 * Allows resubmission from history even after navigating away.
 */

const DB_NAME = 'speaking_audio_db';
const DB_VERSION = 1;
const STORE_NAME = 'audio_segments';

export interface PersistedAudioSegment {
  key: string;
  testId: string;
  partNumber: 1 | 2 | 3;
  questionId: string;
  questionNumber: number;
  questionText: string;
  audioBlob: Blob;
  duration: number;
  savedAt: number;
}

export interface PersistedTestMeta {
  testId: string;
  topic?: string;
  difficulty?: string;
  savedAt: number;
  segmentKeys: string[];
}

// Open IndexedDB connection
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('testId', 'testId', { unique: false });
      }
    };
  });
}

// Save audio segment to IndexedDB
export async function saveAudioSegment(
  testId: string,
  segment: {
    key: string;
    partNumber: 1 | 2 | 3;
    questionId: string;
    questionNumber: number;
    questionText: string;
    chunks: Blob[];
    duration: number;
  }
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const audioBlob = new Blob(segment.chunks, { type: segment.chunks?.[0]?.type || 'audio/webm' });
    
    const record: PersistedAudioSegment = {
      key: `${testId}_${segment.key}`,
      testId,
      partNumber: segment.partNumber,
      questionId: segment.questionId,
      questionNumber: segment.questionNumber,
      questionText: segment.questionText,
      audioBlob,
      duration: segment.duration,
      savedAt: Date.now(),
    };
    
    store.put(record);
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    
    db.close();
    console.log(`[useSpeakingAudioPersistence] Saved audio segment: ${segment.key}`);
  } catch (err) {
    console.error('[useSpeakingAudioPersistence] Failed to save audio:', err);
  }
}

// Save all audio segments for a test
export async function saveAllAudioSegments(
  testId: string,
  segments: Record<string, {
    key: string;
    partNumber: 1 | 2 | 3;
    questionId: string;
    questionNumber: number;
    questionText: string;
    chunks: Blob[];
    duration: number;
  }>
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    for (const segment of Object.values(segments)) {
      const audioBlob = new Blob(segment.chunks, { type: segment.chunks?.[0]?.type || 'audio/webm' });
      
      const record: PersistedAudioSegment = {
        key: `${testId}_${segment.key}`,
        testId,
        partNumber: segment.partNumber,
        questionId: segment.questionId,
        questionNumber: segment.questionNumber,
        questionText: segment.questionText,
        audioBlob,
        duration: segment.duration,
        savedAt: Date.now(),
      };
      
      store.put(record);
    }
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    
    db.close();
    console.log(`[useSpeakingAudioPersistence] Saved ${Object.keys(segments).length} segments for test ${testId}`);
  } catch (err) {
    console.error('[useSpeakingAudioPersistence] Failed to save all audio:', err);
  }
}

// Load all audio segments for a test
export async function loadAudioSegments(testId: string): Promise<PersistedAudioSegment[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('testId');
    
    const segments: PersistedAudioSegment[] = await new Promise((resolve, reject) => {
      const request = index.getAll(testId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    
    db.close();
    console.log(`[useSpeakingAudioPersistence] Loaded ${segments.length} segments for test ${testId}`);
    return segments;
  } catch (err) {
    console.error('[useSpeakingAudioPersistence] Failed to load audio:', err);
    return [];
  }
}

// Check if a test has persisted audio
export async function hasPersistedAudio(testId: string): Promise<boolean> {
  try {
    const segments = await loadAudioSegments(testId);
    return segments.length > 0;
  } catch {
    return false;
  }
}

// Delete audio segments for a test (after successful submission)
export async function deleteAudioSegments(testId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('testId');
    
    // Get all keys for this test
    const segments: PersistedAudioSegment[] = await new Promise((resolve, reject) => {
      const request = index.getAll(testId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    
    // Delete each segment
    for (const segment of segments) {
      store.delete(segment.key);
    }
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    
    db.close();
    console.log(`[useSpeakingAudioPersistence] Deleted ${segments.length} segments for test ${testId}`);
  } catch (err) {
    console.error('[useSpeakingAudioPersistence] Failed to delete audio:', err);
  }
}

// Get all tests with persisted audio (for history page)
export async function getTestsWithPersistedAudio(): Promise<string[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const allRecords: PersistedAudioSegment[] = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    
    db.close();
    
    // Get unique test IDs
    const testIds = [...new Set(allRecords.map(r => r.testId))];
    return testIds;
  } catch (err) {
    console.error('[useSpeakingAudioPersistence] Failed to get tests with audio:', err);
    return [];
  }
}

// Clean up old audio (older than 7 days)
export async function cleanupOldAudio(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
    
    const allRecords: PersistedAudioSegment[] = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    
    let deleted = 0;
    for (const record of allRecords) {
      if (record.savedAt < cutoff) {
        store.delete(record.key);
        deleted++;
      }
    }
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    
    db.close();
    if (deleted > 0) {
      console.log(`[useSpeakingAudioPersistence] Cleaned up ${deleted} old segments`);
    }
  } catch (err) {
    console.error('[useSpeakingAudioPersistence] Failed to cleanup old audio:', err);
  }
}
