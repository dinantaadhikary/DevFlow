import { useState } from "react";
import { api } from "../services/api";

type Feature = "explain" | "readme" | "docs" | "tests" | "pr-summary";

const FEATURES: { key: Feature; label: string; placeholder: string; field: string }[] = [
  { key: "explain", label: "Explain Code", placeholder: "Paste a code snippet...", field: "code" },
  { key: "readme", label: "Generate README", placeholder: "Describe the project (stack, purpose, setup)...", field: "context" },
  { key: "docs", label: "Generate Docs", placeholder: "Paste a function or module...", field: "code" },
  { key: "tests", label: "Generate Tests", placeholder: "Paste code to test...", field: "code" },
  { key: "pr-summary", label: "Summarize PR", placeholder: "Paste a diff...", field: "diff" },
];

export default function AiToolsPage() {
  const [active, setActive] = useState<Feature>("explain");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState(false);

  const current = FEATURES.find((f) => f.key === active)!;

  async function run() {
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post(`/ai/${active}`, { [current.field]: input });
      setResult(data.result);
      setCached(data.cached);
    } catch {
      setResult("Something went wrong generating this. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">AI Developer Tools</h2>

      <div className="flex gap-2 mb-4 flex-wrap">
        {FEATURES.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setActive(f.key);
              setResult(null);
            }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
              active === f.key
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={current.placeholder}
        rows={10}
        className="w-full font-mono text-sm p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      <button
        onClick={run}
        disabled={loading}
        className="mt-3 bg-brand-600 hover:bg-brand-700 text-white font-medium px-4 py-2 rounded-lg text-sm disabled:opacity-50"
      >
        {loading ? "Generating..." : `Run ${current.label}`}
      </button>

      {result && (
        <div className="mt-6 bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700">Result</h3>
            {cached && <span className="text-xs text-slate-400">served from cache</span>}
          </div>
          <pre className="whitespace-pre-wrap text-sm text-slate-800 font-sans">{result}</pre>
        </div>
      )}
    </div>
  );
}
