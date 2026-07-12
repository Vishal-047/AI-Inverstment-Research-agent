# AI Investment Research Agent

An AI-powered investment research tool that evaluates startup founding teams and returns a structured verdict: **Invest / Pass with note / Pass / Inconclusive**.

> **Core philosophy:** Back the founder, not just the market. Early-stage outcomes are driven more by *who* is building than *what* is being built.

---

## Live Demo

> Deployed on Vercel: _link coming soon_

---

## How It Works

You type a company name → the agent researches the founding team → returns a scored verdict.

```
Input (company name)
  → Query Planner Node   — Gemini generates 4 targeted founder-focused search queries
  → Search Node          — Tavily fetches real web results for each query
  → Extraction Node      — Gemini extracts structured data (exits, domain fit, hires, stability)
  → Scoring Node         — Pure TypeScript applies weighted rubric + floor rule
  → Decision Node        — Gemini writes final VC memo narrative
  → Output (verdict + scores + evidence)
```

The graph is **iterative**: if `dataConfidence` is low after the first pass, the agent loops back and generates more targeted queries (max 2 retries).

---

## Scoring Rubric — "Founder Execution Score"

| Category | Weight | What it measures |
|---|---|---|
| Track Record | 30% | Prior startups, exits, shutdowns |
| Domain-Founder Fit | 25% | Does background genuinely match the problem? |
| Team Velocity | 25% | Key leadership hires found |
| Conviction | 20% | Co-founder stability, tenure, personal stake |

**Decision rules:**
- **Invest** → weighted score ≥ 7.0 AND no single category < 4
- **Pass with note** → weighted score 5.5–7.0
- **Pass** → score < 5.5 OR any single category < 4 *(floor rule)*
- **Inconclusive** → insufficient data across most categories

> ⚠ **Best suited for startups 0–5 years old.** Scores for large public companies (Google, Microsoft) are unreliable — their founding signals are decades old and buried under corporate noise.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Agent Orchestration | LangGraph.js (StateGraph) |
| LLM | Google Gemini 2.0 Flash |
| Web Search | Tavily API (free tier) |
| Schema Validation | Zod |
| Styling | Tailwind CSS |
| Deployment | Vercel |

---

## Setup & Run

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create `.env.local` in the root:

```env
GOOGLE_API_KEY=your_google_ai_studio_key
TAVILY_API_KEY=your_tavily_api_key
```

- **Google AI Studio key**: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- **Tavily key** (free tier): [app.tavily.com](https://app.tavily.com)

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Type a startup name and click **Research**. Expect ~60–90 seconds for a full run.

---

## Key Decisions & Trade-offs

**Why iterative graph (not linear or parallel)?**
The floor rule requires high confidence in every category. If evidence for one category is thin on the first search pass, the agent loops back with targeted queries rather than incorrectly penalising the company for missing data.

**Why TypeScript for scoring (not LLM)?**
LLMs are inconsistent with arithmetic. The rubric math must be deterministic and auditable. The LLM only writes prose — the numbers come from pure TypeScript.

**Why Tavily over DuckDuckGo scraping?**
DDG scraping is fragile and rate-limited. Tavily returns clean content (not raw HTML) and is purpose-built for AI agents. The free tier (1000 searches/month) is sufficient for demos and evaluation.

**Why `rawEvidence` in every schema field?**
Forces grounding — the LLM cannot assign a score without citing actual text. Also powers the UI: each score card shows exactly *why* it got that score.

---

## Example Runs

| Company | Score | Verdict | Notes |
|---|---|---|---|
| **Microsoft** | ~4.7 | Pass | Allen departure flagged → conviction = 2 → floor rule fires |
| **Google** | ~7.7 | Invest | Textbook domain fit (PhD + PageRank), stable co-founders |
| **Cursor** | TBD | — | Try it — designed exactly for this type of startup |
| **Perplexity** | TBD | — | Strong AI research background, recent hires |
| **Linear** | TBD | — | Small, high-conviction founding team |

---

## What I'd Improve With More Time

1. **Streaming updates** — Replace single HTTP wait with SSE so each node completion shows in real time
2. **Graduated scoring** — Current scoring uses hard thresholds; a continuous scale would be more nuanced
3. **Smarter co-founder departure rule** — Penalise early departures (<2yr) heavily, reduce penalty for later transitions
4. **Disambiguation** — Add city/sector input for ambiguous company names
5. **Search caching** — Cache results by company name to avoid redundant API calls
6. **LinkedIn-specific queries** — Target `site:linkedin.com` for higher-quality founder data

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                  # Frontend UI
│   └── api/research/route.ts     # POST /api/research endpoint
└── lib/
    └── agent/
        ├── schema.ts             # Zod schema + LangGraph AgentState
        ├── nodes.ts              # 5 agent node functions
        ├── graph.ts              # StateGraph wiring + routing
        └── types.ts              # Shared client-safe TypeScript types
```

---

## License

MIT
