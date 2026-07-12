// Shared TypeScript-only types — no LangGraph/Zod imports here.
// Safe to import from both server and client code.

export type ScoredCategory = {
  score: number;
  rawEvidence: string;
  notes?: string;
};

export type FounderScores = {
  trackRecord: ScoredCategory;
  domainFit: ScoredCategory;
  teamVelocity: ScoredCategory;
  conviction: ScoredCategory;
  weightedTotal: number;
  verdict: "Invest" | "Pass with note" | "Pass" | "Inconclusive" | "Entity Conflict";
};
