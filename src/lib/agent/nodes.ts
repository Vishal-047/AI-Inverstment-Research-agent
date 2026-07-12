import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState, FounderSignalSchema } from "./schema";
import type { FounderScores } from "./types";
import { tavily } from "@tavily/core";

// ── Lazy LLM factory ──────────────────────────────────────────────────────────
// We do NOT initialize the LLM at module level.
// Reason: ChatGoogleGenerativeAI validates the API key in its constructor.
// If it's called at module evaluation time (import), the env var may not be
// injected yet by Next.js/Turbopack, causing a false "no API key" error.
// Calling it inside each request handler guarantees the env is fully loaded.
function getLlm() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY is not set. Add it to .env.local and restart the server."
    );
  }
  return new ChatGoogleGenerativeAI({
    model: "gemini-3.5-flash",
    apiKey,
    temperature: 0,
  });
}

export const planQueriesNode = async (state: typeof AgentState.State) => {
  const { companyName, context, extractedData, retryCount } = state;
  const llm = getLlm();

  // When the user provides context (e.g. "fintech, Bangalore"), append it to every
  // query so Tavily targets the right entity instead of the most famous one with that name.
  const searchTarget = context ? `${companyName} ${context}` : companyName;

  let prompt = `You are an expert startup researcher. Your goal is to generate 3-4 highly specific search queries to find information about the founders of the company "${searchTarget}". 
Focus on:
1. Track record (previous startups, exits)
2. Domain fit (relevant background to their current product)
3. Team velocity (recent leadership hires)
4. Conviction (co-founder stability, departures, personal stake)

Return ONLY a JSON array of strings representing the search queries.`;

  if (retryCount > 0 && extractedData?.missingInformation?.length) {
    prompt += `\n\nYou previously searched but missed the following information:
${extractedData.missingInformation.join("\n")}

Generate 2-3 NEW queries specifically targeting this missing information. Return ONLY a JSON array of strings.`;
  }

  const response = await llm.invoke(prompt);
  let queries: string[] = [];
  try {
    const text = response.content.toString().trim();
    const jsonStr = text.replace(/^```json/, "").replace(/```$/, "").trim();
    queries = JSON.parse(jsonStr);
  } catch (e) {
    queries = [
      `${searchTarget} founders background`,
      `${searchTarget} founders previous startups exits`,
      `${searchTarget} key leadership hires team`,
      `${searchTarget} co-founder departure resignation`,
    ];
  }

  return { queries };
};

export const executeSearchNode = async (state: typeof AgentState.State) => {
  const { queries } = state;
  const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

  const searchResults: string[] = [];
  
  for (const query of queries) {
    try {
      const response = await tvly.search(query, {
        searchDepth: "basic",
        includeRawContent: false,
        maxResults: 3,
      });
      
      const resultsText = response.results
        .map((r: any) => {
          // Truncate content to avoid Gemini's loop-detection on large/repetitive text
          const snippet = (r.content as string).slice(0, 800);
          return `URL: ${r.url}\nTitle: ${r.title}\nContent: ${snippet}`;
        })
        .join("\n\n");
      
      searchResults.push(`--- Query: ${query} ---\n${resultsText}`);
    } catch (e) {
      console.error(`Search failed for query: ${query}`, e);
    }
  }

  return { searchResults };
};

export const extractDataNode = async (state: typeof AgentState.State) => {
  const { companyName, searchResults, retryCount } = state;
  const llm = getLlm();
  const extractionLlm = llm.withStructuredOutput(FounderSignalSchema, {
    name: "founder_signal_extractor",
  });

  const allResults = searchResults.join("\n\n=====\n\n");
  // Cap total context at ~8000 chars — Gemini Flash flags looping on very large prompts
  const truncatedResults = allResults.slice(0, 8000);

  const prompt = `You are a startup analyst. Review the following search results for the company "${companyName}" and extract signals about the founders and execution.
Only use the provided text. Do not invent information. If information is missing, note it in the missingInformation field and consider setting dataConfidence to medium or low.

IMPORTANT — Conviction / Co-founder departure timing:
- If a co-founder departure is mentioned, try to infer the TIMING by comparing the company's founding year to the year of the departure news or announcement.
- Set departureTiming to "early" if the departure happened within approximately 2 years of founding.
- Set departureTiming to "late" if the departure happened more than 2 years after founding.
- Set departureTiming to "unclear" if a departure is confirmed but you cannot determine the year from the search results.
- Set departureTiming to "not_applicable" if no departure was found (cofounderStability is "stable" or "unclear").

IMPORTANT — Entity consistency:
- Set entityConsistencyFlag to TRUE ONLY if the search results appear to describe genuinely DIFFERENT companies or people.
- Signals of a real name collision: conflicting industries (e.g. one result about a SaaS startup, another about a restaurant chain), completely different founder names across results, or contradictory founding dates (e.g. founded 2018 in one result, founded 1987 in another).
- Incomplete or sparse data about ONE company is NOT a collision — set entityConsistencyFlag to FALSE in that case.

Search Results:
${truncatedResults}
`;

  const response = await extractionLlm.invoke(prompt);
  
  return { 
    extractedData: response,
    retryCount: retryCount + 1 
  };
};

export const scoreCompanyNode = async (state: typeof AgentState.State) => {
  const { extractedData } = state;
  if (!extractedData) throw new Error("No extracted data to score");

  // ── Entity conflict short-circuit ──────────────────────────────────────────
  // If Gemini flagged that search results appear to describe multiple different
  // companies with the same name, scoring would be meaningless — we'd be mixing
  // evidence from unrelated entities. Return a distinct verdict immediately so
  // the frontend can show a targeted disambiguation prompt instead of scores.
  // A retry is NOT attempted here: more searches won't resolve a name collision;
  // only user-provided context (sector / location) can fix it.
  if (extractedData.entityConsistencyFlag === true) {
    const conflictScores: FounderScores = {
      trackRecord:  { score: 0, rawEvidence: "N/A — entity conflict detected" },
      domainFit:    { score: 0, rawEvidence: "N/A — entity conflict detected" },
      teamVelocity: { score: 0, rawEvidence: "N/A — entity conflict detected" },
      conviction:   { score: 0, rawEvidence: "N/A — entity conflict detected" },
      weightedTotal: 0,
      verdict: "Entity Conflict",
    };
    return { scores: conflictScores };
  }

  const wTrackRecord = 0.30;
  const wDomainFit = 0.25;
  const wVelocity = 0.25;
  const wConviction = 0.20;

  let trScore = 5;
  const exits = extractedData.trackRecord.priorVentures.filter(v => v.outcome === "exit");
  const shutdowns = extractedData.trackRecord.priorVentures.filter(v => v.outcome === "shutdown");
  if (exits.length > 0) trScore = 9;
  else if (extractedData.trackRecord.priorVentures.length > 0 && shutdowns.length === 0) trScore = 7;
  else if (shutdowns.length > 0) trScore = 4;
  else if (extractedData.trackRecord.priorVentures.length === 0) trScore = 3;

  let dfScore = 5;
  if (extractedData.domainFit.relevantBackground.length > 1) dfScore = 8;
  if (extractedData.domainFit.pivotFlag) dfScore -= 3;

  let velScore = 5;
  if (extractedData.teamVelocity.keyHiresFound.length >= 2) velScore = 8;
  else if (extractedData.teamVelocity.keyHiresFound.length === 0) velScore = 3;

  // Conviction logic — timing-aware departure scoring
  // Judgment call: "unclear" timing defaults to 3 (not 2).
  // Reasoning: early blow-ups are usually documented online (press, LinkedIn, Reddit).
  // If we found a departure but can't find timing, it's more likely a quiet late
  // transition than a dramatic early falling-out. So "unclear" leans cautious
  // but does NOT apply the same floor-rule risk as a confirmed early departure.
  let convScore = 6;
  if (extractedData.conviction.cofounderStability === "stable") {
    convScore = 8;
  } else if (extractedData.conviction.cofounderStability === "departures_found") {
    const timing = extractedData.conviction.departureTiming;
    if (timing === "early")   convScore = 2; // early instability — real red flag, keep floor risk
    else if (timing === "late")    convScore = 5; // late transition — penalised but not disqualifying
    else if (timing === "unclear") convScore = 3; // cautious default — departure confirmed, timing unknown
    else                           convScore = 3; // fallback for unexpected values
  }

  const weightedTotal = 
    (trScore * wTrackRecord) + 
    (dfScore * wDomainFit) + 
    (velScore * wVelocity) + 
    (convScore * wConviction);

  let verdict: FounderScores["verdict"] = "Inconclusive";

  if (extractedData.dataConfidence === "low" || extractedData.missingInformation.length > 3) {
    verdict = "Inconclusive";
  } else if (trScore < 4 || dfScore < 4 || velScore < 4 || convScore < 4) {
    verdict = "Pass";
  } else if (weightedTotal >= 7.0) {
    verdict = "Invest";
  } else if (weightedTotal >= 5.5) {
    verdict = "Pass with note";
  } else {
    verdict = "Pass";
  }

  const scores: FounderScores = {
    trackRecord: { score: trScore, rawEvidence: extractedData.trackRecord.rawEvidence },
    domainFit: { score: dfScore, rawEvidence: extractedData.domainFit.rawEvidence },
    teamVelocity: { score: velScore, rawEvidence: extractedData.teamVelocity.rawEvidence },
    conviction: { score: convScore, rawEvidence: extractedData.conviction.rawEvidence },
    weightedTotal: Number(weightedTotal.toFixed(2)),
    verdict,
  };

  return { scores };
};

export const decideOutcomeNode = async (state: typeof AgentState.State) => {
  const { companyName, scores, extractedData } = state;
  const llm = getLlm();

  if (!scores || !extractedData) throw new Error("Missing data for decision");

  if (scores.verdict === "Entity Conflict") {
    return { finalReasoning: "Search results appear to reference multiple different entities. Please add a sector or location to disambiguate." };
  }

  const prompt = `You are a venture capital partner writing a final decision memo for the company "${companyName}".
Based on the extracted data and the calculated scores, write a professional, concise, and definitive reasoning narrative.
Explain why the startup received a verdict of "${scores?.verdict}" with a score of ${scores?.weightedTotal}.
Highlight the strongest and weakest categories based on the scoring (Track Record: ${scores?.trackRecord.score}, Domain Fit: ${scores?.domainFit.score}, Velocity: ${scores?.teamVelocity.score}, Conviction: ${scores?.conviction.score}).

If the verdict is Inconclusive, emphasize what data was missing.

Return only the final reasoning paragraph (max 3-4 sentences).`;

  const response = await llm.invoke(prompt);
  
  return { finalReasoning: response.content.toString().trim() };
};
