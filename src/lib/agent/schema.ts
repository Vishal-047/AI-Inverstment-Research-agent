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
    departureTiming: z.enum(["early", "late", "not_applicable", "unclear"])
      .describe("If a departure occurred: 'early' = within ~2 years of founding, 'late' = after 2+ years, 'not_applicable' = no departure, 'unclear' = departure found but timing cannot be determined from available sources."),
    personalStakeNote: z.string(),
    rawEvidence: z.string().describe("Direct quotes or specific evidence found from search results."),
  }),
  dataConfidence: z.enum(["high", "medium", "low"]).describe("Overall confidence in the extracted data."),
  missingInformation: z.array(z.string()).describe("List of critical information missing from the search results that would help make a better decision."),
  entityConsistencyFlag: z.boolean().describe(
    "Set to TRUE if the search results appear to describe genuinely different companies or people — e.g. conflicting industries, multiple different founding dates, or clearly different founder names across results. This is NOT about incomplete data; it is specifically about name collision (multiple distinct entities sharing the same search term). Set FALSE if results are consistently about one company, even if data is sparse."
  ),
});

export type FounderSignalType = z.infer<typeof FounderSignalSchema>;

export const AgentState = Annotation.Root({
  companyName: Annotation<string>(),
  queries: Annotation<string[]>(),
  // searchResults accumulates across retry loops — we concat instead of overwrite
  searchResults: Annotation<string[]>({
    value: (state, update) => state.concat(update),
    default: () => [],
  }),
  extractedData: Annotation<FounderSignalType | null>({
    value: (_, update) => update,
    default: () => null,
  }),
  retryCount: Annotation<number>({
    value: (_, update) => update,
    default: () => 0,
  }),
  // context is the optional sector/location hint from the user for disambiguation
  context: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
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
