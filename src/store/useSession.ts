import { create } from 'zustand';
import { llmConfig } from '../config';
import type { AnalysisRecord } from '../lib/compose';
import type { Candidate } from '../lib/grouping';
import type { AlprResult, PhotoItem, PhotoPair, ReportProposal } from '../types';

type Session = {
  photos: PhotoItem[];
  candidates: Candidate[]; // grupowanie wstępne BEZ LLM (GROUPING.md)
  droppedCount: number; // zdjęcia bez użytecznego czasu (drop z inwentaryzacji)
  analysis: AnalysisRecord[]; // etap 2: wizja + split + kompozycja (ANALYSIS.md)
  results: AlprResult[];
  pairs: PhotoPair[];
  proposals: ReportProposal[];
  sparkKey: string;
  sparkModel: string;
  setPhotos: (p: PhotoItem[]) => void;
  setCandidates: (c: Candidate[], dropped: number) => void;
  setAnalysis: (a: AnalysisRecord[]) => void;
  setResults: (r: AlprResult[]) => void;
  setPairs: (p: PhotoPair[]) => void;
  setProposals: (p: ReportProposal[]) => void;
  updateProposal: (id: string, patch: Partial<ReportProposal>) => void;
  setSparkKey: (k: string) => void;
  setSparkModel: (m: string) => void;
  reset: () => void;
};

export const useSession = create<Session>((set) => ({
  photos: [],
  candidates: [],
  droppedCount: 0,
  analysis: [],
  results: [],
  pairs: [],
  proposals: [],
  sparkKey: llmConfig.apiKeyFromEnv,
  sparkModel: llmConfig.model,
  setPhotos: (photos) => set({ photos }),
  setCandidates: (candidates, droppedCount) => set({ candidates, droppedCount }),
  setAnalysis: (analysis) => set({ analysis }),
  setResults: (results) => set({ results }),
  setPairs: (pairs) => set({ pairs }),
  setProposals: (proposals) => set({ proposals }),
  updateProposal: (id, patch) =>
    set((s) => ({ proposals: s.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  setSparkKey: (sparkKey) => set({ sparkKey }),
  setSparkModel: (sparkModel) => set({ sparkModel }),
  reset: () => set({ photos: [], candidates: [], droppedCount: 0, analysis: [], results: [], pairs: [], proposals: [] }),
}));
