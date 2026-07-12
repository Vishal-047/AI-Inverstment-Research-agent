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
  const { companyName, extractedData, retryCount } = state;
  const llm = getLlm();

  let prompt = `You are an expert startup researcher. Your goal is to generate 3-4 highly specific search queries to find information about the founders of the company "${companyName}". 
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
    // fallback queries
    queries = [
      `${companyName} founders background`,
      `${companyName} founders previous startups exits`,
      `${companyName} key leadership hires team`,
      `${companyName} co-founder departure resignation`,
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

  // Weights
  const wTrackRecord = 0.30;
  const wDomainFit = 0.25;
  const wVelocity = 0.25;
  const wConviction = 0.20;

  // Track Record logic
  let trScore = 5;
  const exits = extractedData.trackRecord.priorVentures.filter(v => v.outcome === "exit");
  const shutdowns = extractedData.trackRecord.priorVentures.filter(v => v.outcome === "shutdown");
  if (exits.length > 0) trScore = 9;
  else if (extractedData.trackRecord.priorVentures.length > 0 && shutdowns.length === 0) trScore = 7;
  else if (shutdowns.length > 0) trScore = 4;
  else if (extractedData.trackRecord.priorVentures.length === 0) trScore = 3;

  // Domain Fit logic
  let dfScore = 5;
  if (extractedData.domainFit.relevantBackground.length > 1) dfScore = 8;
  if (extractedData.domainFit.pivotFlag) dfScore -= 3;

  // Velocity logic
  let velScore = 5;
  if (extractedData.teamVelocity.keyHiresFound.length >= 2) velScore = 8;
  else if (extractedData.teamVelocity.keyHiresFound.length === 0) velScore = 3;

  // Conviction logic
  let convScore = 6;
  if (extractedData.conviction.cofounderStability === "departures_found") convScore = 2;
  else if (extractedData.conviction.cofounderStability === "stable") convScore = 8;

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
  const { companyName, scores } = state;
  const llm = getLlm();

  const prompt = `You are a Venture Capital Partner writing the final investment memo for "${companyName}".
Based on the extracted data and the calculated scores, write a professional, concise, and definitive reasoning narrative.
Explain why the startup received a verdict of "${scores?.verdict}" with a score of ${scores?.weightedTotal}.
Highlight the strongest and weakest categories based on the scoring (Track Record: ${scores?.trackRecord.score}, Domain Fit: ${scores?.domainFit.score}, Velocity: ${scores?.teamVelocity.score}, Conviction: ${scores?.conviction.score}).

If the verdict is Inconclusive, emphasize what data was missing.

Return only the final reasoning paragraph (max 3-4 sentences).`;

  const response = await llm.invoke(prompt);
  
  return { finalReasoning: response.content.toString().trim() };
};
