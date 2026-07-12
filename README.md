# FounderLens — AI Investment Research Agent

> An AI agent that researches a company's founding team and returns an
> investment verdict — Invest / Pass with note / Pass / Inconclusive — through
> the lens of founder & execution quality, not just market opportunity.

---

## Overview

FounderLens is an autonomous research assistant designed for early-stage startup investing. Rather than solely analyzing market sizes or generic product pitches, it programmatically evaluates a startup's DNA: the founders. It uses a structured four-part rubric to assess track record, domain fit, velocity, and conviction. 

**Tech Stack:** Next.js (App Router), LangGraph.js, Google `gemini-3.5-flash`, and Tavily Search API.

**Live demo:** [Vercel URL]  
**Repo:** [GitHub URL]  

---

## How to Run It

### Prerequisites
- Node.js 18+
- A free Google AI Studio API key: https://aistudio.google.com/app/apikey
- A free Tavily API key: https://app.tavily.com/sign-in

### Setup
```bash
git clone https://github.com/Vishal-047/AI-Inverstment-Research-agent.git
cd AI-Inverstment-Research-agent
npm install
cp .env.example .env.local
# then fill in .env.local with:
#   GOOGLE_API_KEY=your-key-here
#   TAVILY_API_KEY=your-key-here
npm run dev
```
Open http://localhost:3000

### Testing the API directly
```bash
curl -X POST http://localhost:3000/api/research \
  -H "Content-Type: application/json" \
  -d '{"companyName": "Cursor"}'
```

*(Note: A full run takes ~60-90 seconds due to multiple search + LLM calls; the UI utilizes Server-Sent Events (SSE) to show live progress via streaming.)*

---

## How It Works

### Philosophy
This agent evaluates companies primarily through founder and execution quality, not just market opportunity. In early-stage venture capital, outcomes are driven disproportionately by *who* is building rather than *what* is being built. Pivot rates are high, so backing a high-velocity, resilient team with domain expertise is the most reliable leading indicator of success.

### Architecture
```
START → planQueries → executeSearch → extractData
              ↑                            ↓
              └── retry if low confidence ──┘
                                             ↓
                                       scoreCompany (pure TS)
                                             ↓
                                       decideOutcome (LLM narrative)
                                             ↓
                                            END
```

- **planQueries** — Analyzes the company name/context and generates specific, tailored search queries aimed at finding founder backgrounds, traction, and team dynamics.
- **executeSearch** — Uses Tavily to execute the planned queries across the web, aggregating LLM-optimized search results.
- **extractData** — Uses structured LLM extraction (via Zod) to pull hard facts out of the search results, explicitly requiring a `rawEvidence` citation for every data point.
- **scoreCompany** — Pure TypeScript node that calculates the weighted investment score. Math is strictly handled in code, never by the LLM.
- **decideOutcome** — The LLM reads the final computed score and raw evidence, drafting a cohesive investment memo justifying the mathematical verdict.

### Scoring Rubric — "Founder Execution Score"
| Category | Weight | What it measures |
|---|---|---|
| Track Record | 30% | Previous startup ventures and their specific outcomes (exit, shutdown, still running). |
| Domain-Founder Fit | 25% | Relevant background matching the current venture and whether there are signs of major pivots. |
| Team Velocity | 25% | Key leadership hires found and notes on the overall hiring trend. |
| Conviction | 20% | Co-founder stability, departure timing (early vs late), and notes on the founders' personal stake. |

**Decision rule (Scale 0-10):** 
- **Invest**: Weighted Score ≥ 7.0
- **Pass with note**: Weighted Score 5.5 - 6.9
- **Pass**: Weighted Score < 5.5
- **Inconclusive**: If search data is too thin to make a confident assessment.
- **Floor Rule**: If a company scores `< 4.0` in *any* of the four categories (Track Record, Domain Fit, Velocity, or Conviction), the final verdict is automatically downgraded to "Pass" regardless of the total weighted score.

---

## Key Decisions & Trade-offs

- **Streaming Architecture (SSE)** — Switched from a blocking invoke to an iterative event stream (`graph.stream`). A 90-second blocked request creates terrible UX, so streaming intermediate node transitions provides instant transparency.
- **Bounded retries (max 2), not unbounded** — The graph retries if the LLM reports low confidence in the extracted data. This is strictly bounded to prevent infinite loops, establishing a hard cost/latency ceiling.
- **Tavily over free scraping (e.g. DuckDuckGo)** — We opted for a paid search API because Tavily returns cleaned, LLM-ready markdown content. Scraping raw HTML introduced too much token bloat and unreliability.
- **Gemini 3.5 Flash over Pro** — Flash is significantly cheaper and faster, yet perfectly capable of structured JSON extraction (via `withStructuredOutput`) when prompted correctly.
- **Scoring is pure TypeScript, not LLM-decided** — LLMs are notoriously bad at consistent math and strict boundary rules. Calculating the score in TS guarantees determinism and auditability.
- **`rawEvidence` required on every category** — The Zod schema requires the LLM to output an exact quote/link justifying its score. This eliminates hallucinated scores and grounds the final memo.
- **Co-founder departure timing (early vs. late)** — Initially, any founder departure triggered a severe penalty. We refactored this into an object tracking the *timing* of departures, ensuring late-stage, amicable transitions aren't unfairly punished like early-stage blow-ups.
- **Entity-conflict short-circuits scoring rather than retrying** — If the LLM detects search results are mixing two different companies (e.g., "Stripe" the fintech vs "Stripe" the clothing brand), it immediately halts execution. Retrying Tavily won't fix name ambiguity—it just burns API quota.
- **What I deliberately left out** — There is no caching layer and no integration with paid financial APIs (like Pitchbook). The agent is strictly calibrated for early-stage/startup evaluation, so evaluating mature public companies will yield noisy results.

---

## Example Runs

### 1. Microsoft (Pass with note)
*Note: This was a genuinely tested run from our chat history.*
- **Verdict**: Pass with note
- **What happened**: Microsoft did not achieve an "Invest" due to its mature stage, requiring stronger track record and domain fit scores for an early-stage rubric. However, thanks to the late-departure timing logic, it no longer gets unfairly hammered by late-career executive transitions, resulting in a balanced "Pass with note" rather than a hard fail.

### 2. [Insert Real "Invest" Run Here]
- **Verdict**: 
- **Weighted score**: 
- **Key reasoning**: *(Run a successful early-stage company here and paste the real output)*

### 3. [Insert Real "Inconclusive" Run Here]
- **Verdict**: Inconclusive
- **What happened**: *(Run an obscure stealth startup here and paste the real retry/inconclusive behavior)*

### 4. Stripe (Entity Conflict)
*Note: The previous "Invest" outcome for Stripe was illustrative. Please run this live to get the real API response and paste it here.*
- **Without sector context**: The agent detects conflicting entities and the `entityConsistencyFlag` trips, short-circuiting the graph.
- **With "fintech" context added**: *(Run this live and paste the real result here)*

---

## What I Would Improve With More Time

- **Graduated scoring instead of threshold buckets** — Hard cutoffs (like 75) are brittle. A continuous confidence spectrum would allow for more nuanced borderline evaluations.
- **Caching layer** — Implementing a database (like Redis/Postgres) to hash company queries and cache Tavily/Gemini responses to drastically reduce redundant API costs.
- **Domain-filtered search** — Forcing Tavily to only query specific high-signal domains (linkedin.com, crunchbase.com, techcrunch.com) to filter out SEO spam and noisy press releases.
- **Human-in-the-loop Disambiguation** — Instead of fully halting on an entity conflict, prompt the user mid-stream for the context, then resume the graph automatically.

---

## AI Chat Logs (Bonus)

Full session transcripts from building this project are included in `/chat-logs`. They cover:
- Initial architecture planning and trade-off discussions.
- Backend implementation (LangGraph nodes, schema design).
- Debugging real issues encountered (e.g., Gemini model authentication, quota exhaustion, LangGraph Annotation API changes).
- The Tier 1 improvements (founder departure timing, disambiguation, streaming) and the exact reasoning behind each design decision.

See `/chat-logs/README.md` for an index.
