import { NextRequest, NextResponse } from "next/server";
import { investmentAgentGraph } from "@/lib/agent/graph";

// Allow up to 5 minutes — the agent runs multiple search + LLM calls sequentially
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { companyName, context } = await req.json();


    if (!companyName) {
      return NextResponse.json(
        { error: "companyName is required" },
        { status: 400 }
      );
    }

    // Only pass fields without defaults — LangGraph fills in the rest from Annotation defaults
    const initialState = {
      companyName,
      context: context || "",
      queries: [] as string[],
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const lgStream = await investmentAgentGraph.stream(initialState, {
            recursionLimit: 25,
            streamMode: "updates",
          });

          for await (const chunk of lgStream) {
            const [nodeName, nodeData] = Object.entries(chunk)[0];
            
            const payload = { node: nodeName, data: nodeData };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          }
          
          // Signal the end of the graph execution
          controller.enqueue(encoder.encode(`data: {"done": true}\n\n`));
          controller.close();
        } catch (err: any) {
          console.error("Streaming error:", err);
          controller.enqueue(encoder.encode(`data: {"error": ${JSON.stringify(err.message || "Unknown error")}}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
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
