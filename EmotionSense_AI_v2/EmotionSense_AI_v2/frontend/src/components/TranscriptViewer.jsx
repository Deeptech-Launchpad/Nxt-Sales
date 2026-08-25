/**
 * TranscriptViewer — renders per-segment transcript with speaker badges and emotion tags.
 *
 * Each row shows:
 *   [timestamp] [SPEAKER badge] [transcript text]  [emotion badge + confidence]
 *
 * Speaker colors cycle through a fixed palette so SPEAKER_00 is always blue,
 * SPEAKER_01 always purple, etc. — making it easy to follow multi-speaker calls.
 */

// One palette entry per speaker (cycles when > 4 speakers)
const SPEAKER_PALETTE = [
  "border-blue-500   text-blue-300   bg-blue-500/10",
  "border-purple-500 text-purple-300 bg-purple-500/10",
  "border-green-500  text-green-300  bg-green-500/10",
  "border-orange-500 text-orange-300 bg-orange-500/10",
];

const EMOTION_STYLE = {
  anger:    "bg-red-500/15    text-red-300",
  disgust:  "bg-purple-600/15 text-purple-300",
  fear:     "bg-orange-500/15 text-orange-300",
  joy:      "bg-green-500/15  text-green-300",
  neutral:  "bg-gray-600/20   text-gray-400",
  sadness:  "bg-blue-500/15   text-blue-300",
  surprise: "bg-yellow-500/15 text-yellow-300",
};

const EMOTION_EMOJI = {
  anger: "😠", disgust: "🤢", fear: "😨",
  joy: "😊", neutral: "😐", sadness: "😢", surprise: "😲",
};

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TranscriptViewer({ segments }) {
  if (!segments?.length) {
    return <p className="text-gray-500 text-sm">No transcript segments available.</p>;
  }

  // Map each unique speaker ID to a palette index — order by first appearance
  const speakerMap = {};
  let nextIdx = 0;
  for (const seg of segments) {
    if (!(seg.speaker in speakerMap)) speakerMap[seg.speaker] = nextIdx++;
  }

  return (
    <div className="space-y-2 max-h-[520px] overflow-y-auto pr-2">
      {segments.map((seg) => {
        const palIdx   = speakerMap[seg.speaker] % SPEAKER_PALETTE.length;
        const spStyle  = SPEAKER_PALETTE[palIdx];
        const emotion  = seg.final_emotion?.dominant ?? "neutral";
        const emStyle  = EMOTION_STYLE[emotion] ?? EMOTION_STYLE.neutral;
        const conf     = ((seg.final_emotion?.confidence ?? 0) * 100).toFixed(0);
        const label    = seg.speaker_label || seg.speaker;

        return (
          <div
            key={seg.id}
            className="flex items-start gap-3 py-2 border-b border-gray-800/60 last:border-0 group"
          >
            {/* Timestamp — monospace, dim until hovered */}
            <span className="text-xs font-mono text-gray-600 group-hover:text-gray-400 pt-0.5 w-12 shrink-0 transition-colors">
              {fmt(seg.start)}
            </span>

            {/* Speaker badge */}
            <span className={`text-xs border rounded-full px-2 py-0.5 shrink-0 ${spStyle}`}>
              {label}
            </span>

            {/* Transcript text — takes all remaining width */}
            <p className="text-gray-200 text-sm leading-relaxed flex-1 min-w-0">
              {seg.text || <em className="text-gray-600">[inaudible]</em>}
            </p>

            {/* Emotion tag */}
            <span className={`text-xs rounded-full px-2.5 py-0.5 shrink-0 ${emStyle}`}>
              {EMOTION_EMOJI[emotion]} {emotion} {conf}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
