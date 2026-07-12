import { StateGraph, END, START } from "@langchain/langgraph";
import { AgentState } from "./schema";
import { 
  planQueriesNode, 
  executeSearchNode, 
  extractDataNode, 
  scoreCompanyNode, 
  decideOutcomeNode 
} from "./nodes";

const routeAfterExtraction = (state: typeof AgentState.State) => {
  if (state.extractedData?.dataConfidence === "low" && state.retryCount < 2) {
    return "planQueries";
  }
  return "scoreCompany";
};

const graphBuilder = new StateGraph(AgentState)
  .addNode("planQueries", planQueriesNode)
  .addNode("executeSearch", executeSearchNode)
  .addNode("extractData", extractDataNode)
  .addNode("scoreCompany", scoreCompanyNode)
  .addNode("decideOutcome", decideOutcomeNode)
  
  .addEdge(START, "planQueries")
  .addEdge("planQueries", "executeSearch")
  .addEdge("executeSearch", "extractData")
  .addConditionalEdges("extractData", routeAfterExtraction, {
    planQueries: "planQueries",
    scoreCompany: "scoreCompany",
  })
  .addEdge("scoreCompany", "decideOutcome")
  .addEdge("decideOutcome", END);

export const investmentAgentGraph = graphBuilder.compile();
