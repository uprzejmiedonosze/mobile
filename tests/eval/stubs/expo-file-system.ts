// Stub for 'expo-file-system/legacy', mapped in tsconfig.json `paths`. src/lib/compose.ts imports
// this module at the top of the file (for its analysis-cache read/write helpers), which does not
// exist under plain Node/tsx. The eval harness never calls loadAnalysisCache()/saveAnalysisCache()
// — it has its own cache (tests/.cache/llm/) — so a no-op is enough to satisfy the import.
export const documentDirectory = '/dev/null/';
export const cacheDirectory = '/dev/null/';

export async function getInfoAsync(_path: string): Promise<{ exists: boolean }> {
  return { exists: false };
}

export async function readAsStringAsync(_path: string): Promise<string> {
  throw new Error('expo-file-system stub: readAsStringAsync not implemented (eval harness does not use compose.ts analysis cache)');
}

export async function writeAsStringAsync(_path: string, _contents: string): Promise<void> {
  // no-op
}
