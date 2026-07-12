"use client";

import { useState } from "react";
import type { FounderScores } from "@/lib/agent/types";

// ────────────────────────────────────────────────────────────
// Types mirroring what the API returns
// ────────────────────────────────────────────────────────────
type ResearchResult = {
  companyName: string;
  queriesRun: string[];
  scores: FounderScores;
  finalReasoning: string;
};

// ────────────────────────────────────────────────────────────
// Score card config
// ────────────────────────────────────────────────────────────
const CATEGORIES: {
  key: keyof Omit<FounderScores, "weightedTotal" | "verdict">;
  label: string;
  weight: string;
}[] = [
  { key: "trackRecord",  label: "Track Record",   weight: "30%" },
  { key: "domainFit",    label: "Domain Fit",      weight: "25%" },
  { key: "teamVelocity", label: "Team Velocity",   weight: "25%" },
  { key: "conviction",   label: "Conviction",      weight: "20%" },
];

// ────────────────────────────────────────────────────────────
// Verdict banner colour
// ────────────────────────────────────────────────────────────
const VERDICT_STYLES: Record<FounderScores["verdict"], string> = {
  "Invest":         "bg-green-100 border-green-500 text-green-900",
  "Pass with note": "bg-yellow-100 border-yellow-500 text-yellow-900",
  "Pass":           "bg-gray-100 border-gray-500 text-gray-900",
  "Inconclusive":   "bg-blue-100 border-blue-500 text-blue-900",
};

const VERDICT_LABEL_STYLES: Record<FounderScores["verdict"], string> = {
  "Invest":         "bg-green-500 text-white",
  "Pass with note": "bg-yellow-500 text-white",
  "Pass":           "bg-gray-500 text-white",
  "Inconclusive":   "bg-blue-500 text-white",
};

// Score badge colour
function scoreBadgeClass(score: number): string {
  if (score >= 7) return "bg-green-100 text-green-800";
  if (score >= 4) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

// ────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────
export default function Home() {
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [queries, setQueries]   = useState<string[]>([]);
  const [result, setResult]     = useState<ResearchResult | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const handleResearch = async () => {
    if (!company.trim()) return;

    setLoading(true);
    setResult(null);
    setError(null);
    setQueries([]);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: company.trim() }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || "Something went wrong.");
        return;
      }

      setQueries(json.data.queriesRun ?? []);
      setResult(json.data);
    } catch (e: any) {
      setError(e.message || "Network error.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleResearch();
  };

  return (
    <main className="min-h-screen bg-white text-gray-900 font-sans">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">

        {/* ── Header ── */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            AI Investment Research Agent
          </h1>
          <p className="text-sm text-gray-500">
            Evaluates founding teams — not just market opportunity.
          </p>
        </div>

        {/* ── Scope disclaimer ── */}
        <div className="border border-amber-200 bg-amber-50 rounded px-4 py-3 text-sm text-amber-800">
          <strong>⚠ Designed for early-stage startups (0–5 years old).</strong>{" "}
          Scores for established public companies (Google, Microsoft, Apple) will be unreliable —
          their founding signals are 20–50 years old, buried under corporate noise, and the
          co-founder departure rule penalises normal long-term leadership transitions.
          <span className="block mt-1 text-amber-700">
            Try: <button onClick={() => setCompany("Cursor")} className="underline hover:no-underline cursor-pointer">Cursor</button>
            {" · "}
            <button onClick={() => setCompany("Perplexity")} className="underline hover:no-underline cursor-pointer">Perplexity</button>
            {" · "}
            <button onClick={() => setCompany("Linear")} className="underline hover:no-underline cursor-pointer">Linear</button>
            {" · "}
            <button onClick={() => setCompany("Replit")} className="underline hover:no-underline cursor-pointer">Replit</button>
          </span>
        </div>

        {/* ── Input ── */}
        <div className="flex gap-2">
          <input
            id="company-input"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter company name (e.g. Notion, Stripe, Linear)"
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            disabled={loading}
          />
          <button
            id="research-btn"
            onClick={handleResearch}
            disabled={loading || !company.trim()}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded disabled:opacity-40 hover:bg-gray-700"
          >
            {loading ? "Researching…" : "Research"}
          </button>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="border border-red-300 bg-red-50 text-red-800 text-sm rounded px-4 py-3">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* ── Loading: query list ── */}
        {loading && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Running searches… <span className="font-normal normal-case text-gray-400">(this takes ~60–90 seconds)</span>
            </p>
            {queries.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Generating queries…</p>
            ) : (
              <ul className="space-y-1 text-sm text-gray-700 list-disc list-inside">
                {queries.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Results ── */}
        {result && (
          <div className="space-y-8">

            {/* Queries run */}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Searches run for "{result.companyName}"
              </p>
              <ul className="space-y-0.5 text-sm text-gray-600 list-disc list-inside">
                {result.queriesRun.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>

            {/* Score cards — 2×2 grid */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Founder Execution Scores
              </p>
              <div className="grid grid-cols-2 gap-4">
                {CATEGORIES.map(({ key, label, weight }) => {
                  const cat = result.scores[key];
                  return (
                    <div
                      key={key}
                      className="border border-gray-200 rounded p-4 space-y-2"
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{label}</span>
                        <span className="text-xs text-gray-400">{weight}</span>
                      </div>

                      {/* Score badge */}
                      <div>
                        <span
                          className={`inline-block text-sm font-bold px-2 py-0.5 rounded ${scoreBadgeClass(cat.score)}`}
                        >
                          {cat.score} / 10
                        </span>
                      </div>

                      {/* Raw evidence — truncated to 2 lines */}
                      <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                        {cat.rawEvidence || "No evidence found."}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Verdict banner */}
            <div
              className={`border-l-4 rounded p-5 space-y-2 ${VERDICT_STYLES[result.scores.verdict]}`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded ${VERDICT_LABEL_STYLES[result.scores.verdict]}`}
                >
                  {result.scores.verdict}
                </span>
                <span className="text-sm font-semibold">
                  Weighted Score: {result.scores.weightedTotal} / 10
                </span>
              </div>
              <p className="text-sm leading-relaxed">
                {result.finalReasoning}
              </p>
            </div>

          </div>
        )}
      </div>
    </main>
  );
}
