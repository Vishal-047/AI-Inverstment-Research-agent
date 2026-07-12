import { NextRequest, NextResponse } from "next/server";
import { investmentAgentGraph } from "@/lib/agent/graph";

// Allow up to 5 minutes — the agent runs multiple search + LLM calls sequentially
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { companyName } = await req.json();


    if (!companyName) {
      return NextResponse.json(
        { error: "companyName is required" },
        { status: 400 }
      );
    }

    // Only pass fields without defaults — LangGraph fills in the rest from Annotation defaults
    const initialState = {
      companyName,
      queries: [] as string[],
    };

    // recursionLimit: LangGraph's cycle detection fires by default on any graph
    // that revisits a node. Our retry loop intentionally cycles back to planQueries
    // up to 2 times. Setting recursionLimit high enough (25 steps covers our max
    // 3 passes × 5 nodes = 15 steps, plus headroom) suppresses the false positive.
    const resultState = await investmentAgentGraph.invoke(initialState, {
      recursionLimit: 25,
    });

    return NextResponse.json({
      success: true,
      data: {
        companyName: resultState.companyName,
        queriesRun: resultState.queries,
        scores: resultState.scores,
        finalReasoning: resultState.finalReasoning,
        extractedData: resultState.extractedData,
        // Optional: Include searchResults if you want to show raw text on frontend, 
        // but it might be large. We'll leave it out to save bandwidth, 
        // since we have rawEvidence in the scores.
      },
    });
  } catch (error: any) {
    console.error("Agent error:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong" },
      { status: 500 }
    );
  }
}
