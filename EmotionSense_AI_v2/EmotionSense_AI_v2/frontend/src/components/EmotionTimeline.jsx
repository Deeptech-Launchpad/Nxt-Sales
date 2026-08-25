/**
 * EmotionTimeline — stacked bar chart of emotion scores over time.
 *
 * X axis: segment start time (mm:ss)
 * Y axis: emotion score 0–100 %
 * Bars: stacked, one color per emotion — full bar always sums to 100 %
 *
 * Built with Recharts (BarChart + StackedId).
 * No additional charting libraries needed beyond what's in package.json.
 */
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const EMOTIONS = ["anger", "disgust", "fear", "joy", "neutral", "sadness", "surprise"];

const EMOTION_COLORS = {
  anger:    "#ef4444",
  disgust:  "#a855f7",
  fear:     "#f97316",
  joy:      "#22c55e",
  neutral:  "#64748b",
  sadness:  "#3b82f6",
  surprise: "#eab308",
};

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Custom tooltip card — shows all emotion scores for the hovered segment
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const speaker = payload[0]?.payload?.speaker;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs shadow-xl min-w-[160px]">
      <p className="text-gray-300 font-semibold mb-1">⏱ {label}</p>
      {speaker && <p className="text-gray-400 mb-2">{speaker}</p>}
      {payload
        .filter((p) => p.value > 0.5)
        .sort((a, b) => b.value - a.value)
        .map((p) => (
          <div key={p.dataKey} className="flex justify-between gap-4">
            <span style={{ color: p.fill }}>{p.dataKey}</span>
            <span className="text-gray-300 font-mono">{p.value.toFixed(1)}%</span>
          </div>
        ))}
    </div>
  );
}

export default function EmotionTimeline({ segments }) {
  if (!segments?.length) {
    return <p className="text-gray-500 text-sm">No data to display.</p>;
  }

  // Build chart data: one entry per segment, emotion scores scaled to %
  const data = segments.map((seg) => {
    const scores = seg.final_emotion?.scores ?? {};
    const row = {
      time:    fmt(seg.start),
      speaker: seg.speaker?.replace("SPEAKER_", "S") ?? "",
    };
    for (const e of EMOTIONS) {
      row[e] = parseFloat(((scores[e] ?? 0) * 100).toFixed(1));
    }
    // Fix floating-point rounding so the stacked bar always sums to exactly 100
    const total = EMOTIONS.reduce((s, e) => s + row[e], 0);
    if (total > 0 && Math.abs(total - 100) > 0.01) {
      const largest = EMOTIONS.reduce((a, b) => (row[a] >= row[b] ? a : b));
      row[largest] = parseFloat((row[largest] + (100 - total)).toFixed(1));
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 4 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis
          dataKey="time"
          stroke="#4b5563"
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          stroke="#4b5563"
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          tickFormatter={(v) => `${Math.round(v)}%`}
          domain={[0, 100]}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#ffffff10" }} />
        <Legend
          wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }}
          iconType="circle"
          iconSize={8}
        />
        {EMOTIONS.map((e) => (
          <Bar
            key={e}
            dataKey={e}
            stackId="emotions"          // stacking all emotions into a single 100%-tall bar
            fill={EMOTION_COLORS[e]}
            opacity={0.88}
            isAnimationActive={false}   // disable animation for performance on long transcripts
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
