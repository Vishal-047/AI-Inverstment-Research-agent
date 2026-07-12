import { z } from "zod";
import { Annotation } from "@langchain/langgraph";
import type { ScoredCategory, FounderScores } from "./types";
export type { ScoredCategory, FounderScores };

export const FounderSignalSchema = z.object({
  trackRecord: z.object({
    priorVentures: z.array(z.object({
      name: z.string(),
      outcome: z.enum(["exit", "shutdown", "still_running", "unclear"]),
      relevance: z.string(),
    })),
    rawEvidence: z.string().describe("Direct quotes or specific evidence found from search results."),
  }),
  domainFit: z.object({
    relevantBackground: z.array(z.string()),
    pivotFlag: z.boolean(),
    rawEvidence: z.string().describe("Direct quotes or specific evidence found from search results."),
  }),
  teamVelocity: z.object({
    keyHiresFound: z.array(z.string()),
    hiringTrendNote: z.string(),
    rawEvidence: z.string().describe("Direct quotes or specific evidence found from search results."),
  }),
  conviction: z.object({
    cofounderStability: z.enum(["stable", "departures_found", "unclear"]),
    personalStakeNote: z.string(),
    rawEvidence: z.string().describe("Direct quotes or specific evidence found from search results."),
  }),
  dataConfidence: z.enum(["high", "medium", "low"]).describe("Overall confidence in the extracted data."),
  missingInformation: z.array(z.string()).describe("List of critical information missing from the search results that would help make a better decision."),
});

export type FounderSignalType = z.infer<typeof FounderSignalSchema>;

// ScoredCategory and FounderScores are defined in ./types and re-exported above.

// Define the state for the LangGraph
export const AgentState = Annotation.Root({
  companyName: Annotation<string>(),
  queries: Annotation<string[]>(),
  // searchResults accumulates across retry loops — we concat instead of overwrite
  searchResults: Annotation<string[]>({
    value: (state, update) => state.concat(update),
    default: () => [],
  }),
  // Last-write-wins for all other fields — `value: (_, u) => u` means "take the new value"
  extractedData: Annotation<FounderSignalType | null>({
    value: (_, update) => update,
    default: () => null,
  }),
  retryCount: Annotation<number>({
    value: (_, update) => update,
    default: () => 0,
  }),
  scores: Annotation<FounderScores | null>({
    value: (_, update) => update,
    default: () => null,
  }),
  finalReasoning: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),
});
