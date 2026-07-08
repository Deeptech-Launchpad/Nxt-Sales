import { useState, useEffect } from "react";
import AudioUploader from "./components/AudioUploader";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const HISTORY_KEY = "emotionsense_history";

const EMOTIONS = ["joy","neutral","sadness","anger","fear","disgust","surprise"];
const EMOTION_META = {
  anger:    { color: "#ef4444", bg: "rgba(239,68,68,0.12)",    emoji: "😠" },
  disgust:  { color: "#a855f7", bg: "rgba(168,85,247,0.12)",   emoji: "🤢" },
  fear:     { color: "#f97316", bg: "rgba(249,115,22,0.12)",   emoji: "😨" },
  joy:      { color: "#22c55e", bg: "rgba(34,197,94,0.12)",    emoji: "😊" },
  neutral:  { color: "#94a3b8", bg: "rgba(148,163,184,0.10)",  emoji: "😐" },
  sadness:  { color: "#3b82f6", bg: "rgba(59,130,246,0.12)",   emoji: "😢" },
  surprise: { color: "#eab308", bg: "rgba(234,179,8,0.12)",    emoji: "😲" },
};
const SPEAKER_COLORS = ["#6366f1","#0ea5e9","#22c55e","#f59e0b","#ec4899","#14b8a6"];

function fmt(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2,"0")}`;
}

// Aggregate emotion scores across all segments → percentage per emotion
function aggregateEmotions(segments) {
  if (!segments?.length) return {};
  const totals = {};
  for (const seg of segments) {
    const scores = seg.final_emotion?.scores ?? {};
    for (const [e, v] of Object.entries(scores)) {
      totals[e] = (totals[e] ?? 0) + v;
    }
  }
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(totals).map(([e, v]) => [e, (v / sum) * 100]));
}

export default function App() {
  const [file, setFile]       = useState(null);
  const [status, setStatus]   = useState("idle");
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]")); }
    catch { setHistory([]); }
  }, []);

  const handleFileSelected = (f) => { setFile(f); setResult(null); setError(null); setStatus("idle"); };

  const handleAnalyze = async () => {
    if (!file) return;
    setStatus("processing"); setError(null);
    const fd = new FormData(); fd.append("file", file);
    try {
      const res = await fetch(`${BACKEND_URL}/api/analyze`, { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (res.status === 429) throw new Error("Server busy — please wait.");
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data); setStatus("done");
      const entry = {
        id: Date.now(), filename: file.name, date: new Date().toISOString(),
        duration_sec: data.audio_duration_sec ?? 0,
        speakers: data.speakers?.length ?? 0,
        total_tokens: data.gemini_usage?.total_tokens ?? 0,
        cost_inr: data.gemini_usage?.cost_inr ?? 0,
        input_tokens: data.gemini_usage?.input_tokens ?? 0,
        output_tokens: data.gemini_usage?.output_tokens ?? 0,
        model: data.gemini_usage?.model ?? "gemini",
      };
      const updated = [entry, ...history].slice(0, 50);
      setHistory(updated);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    } catch (e) { setError(e.message); setStatus("error"); }
  };

  const usage      = result?.gemini_usage;
  const totalSpent = history.reduce((s, h) => s + (h.cost_inr ?? 0), 0);
  const emotions   = aggregateEmotions(result?.segments);
  const dominantEmotion = result?.segments?.length
    ? Object.entries(emotions).sort((a,b) => b[1]-a[1])[0]?.[0]
    : null;

  // speaker color map
  const spColorMap = {};
  if (result?.segments) {
    let i = 0;
    for (const s of result.segments)
      if (!(s.speaker in spColorMap)) spColorMap[s.speaker] = SPEAKER_COLORS[i++ % SPEAKER_COLORS.length];
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">

      {/* Header */}
      <header className="border-b border-gray-800/60 bg-gray-950/90 sticky top-0 z-20 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
            style={{ background: "linear-gradient(135deg,#6366f1,#22c55e)" }}>🎙️</div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">EmotionSense AI</p>
            <p className="text-xs text-gray-500">Call Recording Analyser</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {status === "done" && usage && (
              <span className="text-xs px-3 py-1 rounded-full font-medium"
                style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}>
                ₹{usage.cost_inr.toFixed(4)} · {usage.total_tokens.toLocaleString()} tokens
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8 space-y-5">

        {/* Upload */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
          <AudioUploader onFileSelected={handleFileSelected} selectedFile={file}
            onAnalyze={handleAnalyze} status={status} />
        </div>

        {/* Error */}
        {status === "error" && (
          <div className="rounded-xl px-5 py-4 text-sm"
            style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)" }}>
            <p className="font-semibold text-red-300">Analysis failed</p>
            <p className="text-red-400/80 text-xs mt-0.5">{error}</p>
          </div>
        )}

        {/* Results */}
        {status === "done" && result && (
          <>
            {/* Meta strip */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 px-1">
              <span>⏱ <b className="text-gray-300">{result.audio_duration_sec?.toFixed(1)}s</b></span>
              <span>👥 <b className="text-gray-300">{result.speakers?.length} speakers</b></span>
              <span>📝 <b className="text-gray-300">{result.segments?.length} lines</b></span>
              <span>⚡ <b className="text-gray-300">{(result.processing_time_ms/1000).toFixed(1)}s</b> to process</span>
            </div>

            {/* ── 1. CALL SUMMARY ── */}
            {result.call_summary && (
              <Section icon="📋" title="Call Summary" accent="#6366f1">
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-800/60">
                  {[
                    { label: "Who Answered",       value: result.call_summary.recipient },
                    { label: "Call Purpose",        value: result.call_summary.call_purpose },
                    { label: "Asked to Speak With", value: result.call_summary.inquired_personnel },
                    { label: "Outcome",             value: result.call_summary.outcome },
                  ].map(({ label, value }) => (
                    <div key={label} className="px-5 py-4">
                      <p className="text-xs text-gray-500 mb-1">{label}</p>
                      <p className="text-white text-sm font-medium">{value || "—"}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── 2. OVERALL EMOTIONS ── */}
            {Object.keys(emotions).length > 0 && (
              <Section icon="🎭" title="Overall Call Emotion" accent="#f59e0b">
                <div className="px-5 py-5 space-y-4">
                  {/* Dominant emotion hero */}
                  <div className="flex items-center gap-3 pb-4 border-b border-gray-800/60">
                    <span className="text-4xl">{EMOTION_META[dominantEmotion]?.emoji}</span>
                    <div>
                      <p className="text-xs text-gray-500">Dominant Emotion</p>
                      <p className="text-2xl font-bold capitalize" style={{ color: EMOTION_META[dominantEmotion]?.color }}>
                        {dominantEmotion}
                      </p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-xs text-gray-500">Score</p>
                      <p className="text-xl font-bold" style={{ color: EMOTION_META[dominantEmotion]?.color }}>
                        {emotions[dominantEmotion]?.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {/* Bars for all emotions */}
                  <div className="space-y-2">
                    {EMOTIONS
                      .map(e => ({ e, pct: emotions[e] ?? 0 }))
                      .sort((a, b) => b.pct - a.pct)
                      .map(({ e, pct }) => (
                        <div key={e} className="flex items-center gap-3">
                          <span className="text-sm w-20 text-gray-400 capitalize">{e}</span>
                          <div className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${pct.toFixed(1)}%`, background: EMOTION_META[e]?.color }} />
                          </div>
                          <span className="text-xs text-gray-400 w-10 text-right tabular-nums">{pct.toFixed(1)}%</span>
                        </div>
                      ))}
                  </div>
                </div>
              </Section>
            )}

            {/* ── 3. TRANSCRIPT ── */}
            {result.segments?.length > 0 && (
              <Section icon="📄" title="Extracted Transcript" accent="#0ea5e9">
                {/* Speaker legend */}
                <div className="px-5 pt-3 pb-2 flex flex-wrap gap-2 border-b border-gray-800/60">
                  {result.speakers?.map((sp, i) => (
                    <span key={sp} className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                      style={{ background: `${SPEAKER_COLORS[i%SPEAKER_COLORS.length]}18`,
                               color: SPEAKER_COLORS[i%SPEAKER_COLORS.length],
                               border: `1px solid ${SPEAKER_COLORS[i%SPEAKER_COLORS.length]}25` }}>
                      {sp}
                    </span>
                  ))}
                </div>

                <div className="divide-y divide-gray-800/40 max-h-[500px] overflow-y-auto">
                  {result.segments.map((seg) => {
                    const label   = seg.speaker_label || seg.speaker;
                    const spColor = spColorMap[seg.speaker] ?? "#94a3b8";
                    return (
                      <div key={seg.id} className="px-5 py-3 flex gap-3 hover:bg-white/[0.015] transition-colors">
                        <span className="text-xs font-mono text-gray-600 pt-0.5 w-10 flex-shrink-0">
                          {fmt(seg.start)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold mr-2" style={{ color: spColor }}>{label}</span>
                          <span className="text-sm text-gray-200 leading-relaxed">{seg.text}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Cost row */}
            {usage && (
              <p className="text-center text-xs text-gray-600">
                {usage.model} · {usage.input_tokens.toLocaleString()} in + {usage.output_tokens.toLocaleString()} out tokens
                · cost <span className="text-green-500 font-semibold">₹{usage.cost_inr.toFixed(4)}</span>
                <span className="ml-1 text-gray-700">(${usage.cost_usd.toFixed(6)})</span>
              </p>
            )}
          </>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="rounded-2xl border border-gray-800/60 overflow-hidden">
            <button onClick={() => setShowHistory(v => !v)}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-white/5 transition-colors text-sm">
              <span className="text-gray-400 font-medium">
                History <span className="text-gray-600 text-xs ml-1">({history.length})</span>
              </span>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-500">Total: <span className="text-green-400 font-semibold">₹{totalSpent.toFixed(4)}</span></span>
                <span className="text-gray-700">{showHistory ? "▲" : "▼"}</span>
              </div>
            </button>

            {showHistory && (
              <div className="border-t border-gray-800">
                <div className="flex justify-end px-5 py-2">
                  <button onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); }}
                    className="text-xs text-gray-600 hover:text-red-400 transition-colors">Clear all</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-600 border-b border-gray-800">
                        {["Date","File","Duration","Tokens","Cost (₹)"].map(h=>(
                          <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h,i) => (
                        <tr key={h.id} className="border-b border-gray-800/40 hover:bg-white/5">
                          <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                            {new Date(h.date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
                          </td>
                          <td className="px-4 py-2.5 text-gray-300 max-w-[130px] truncate" title={h.filename}>{h.filename}</td>
                          <td className="px-4 py-2.5 text-gray-400">{h.duration_sec?.toFixed(0)}s</td>
                          <td className="px-4 py-2.5 text-blue-400 font-medium">{h.total_tokens?.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-green-400 font-bold">₹{h.cost_inr?.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-700">
                        <td colSpan={3} className="px-4 py-2.5 text-gray-600">Total</td>
                        <td className="px-4 py-2.5 text-blue-400 font-bold">{history.reduce((s,h)=>s+(h.total_tokens??0),0).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-green-400 font-bold">₹{totalSpent.toFixed(4)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}

function Section({ icon, title, accent, children }) {
  return (
    <div className="rounded-2xl border border-gray-800/60 bg-gray-900/40 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-800/60 flex items-center gap-2"
        style={{ background: `linear-gradient(90deg,${accent}10,transparent)` }}>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
          style={{ background: `linear-gradient(135deg,${accent},${accent}99)` }}>{icon}</span>
        <h2 className="font-semibold text-white text-sm">{title}</h2>
      </div>
      {children}
    </div>
  );
}
