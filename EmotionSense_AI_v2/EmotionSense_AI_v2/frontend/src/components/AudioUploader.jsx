/**
 * AudioUploader — drag-and-drop file input with validation.
 *
 * Uses native HTML5 drag events (no external library needed).
 * Validates file type and size client-side before the API call.
 * Passes the selected File object up to App.jsx via onFileSelected.
 */
import { useState, useRef, useCallback } from "react";

const ACCEPTED_TYPES = new Set([
  "audio/mpeg",   "audio/wav",  "audio/x-wav",
  "audio/mp4",    "audio/ogg",  "audio/flac",  "audio/x-flac",
]);
const MAX_SIZE_MB = 50;

export default function AudioUploader({ onFileSelected, selectedFile, onAnalyze, status }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const validate = (file) => {
    if (!ACCEPTED_TYPES.has(file.type)) {
      alert(`Unsupported file type: ${file.type}.\nPlease upload an MP3, WAV, M4A, OGG, or FLAC file.`);
      return false;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: ${MAX_SIZE_MB} MB.`);
      return false;
    }
    return true;
  };

  // Called when a file is dropped onto the zone
  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped && validate(dropped)) onFileSelected(dropped);
    },
    [onFileSelected]
  );

  // Keep drag state in sync for visual highlight
  const handleDragOver  = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = ()  => setIsDragging(false);

  // Called when the user picks a file via the file picker dialog
  const handleFileInput = (e) => {
    const selected = e.target.files[0];
    if (selected && validate(selected)) onFileSelected(selected);
    e.target.value = ""; // reset so the same file can be re-selected
  };

  const isProcessing = ["uploading", "processing"].includes(status);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isProcessing && inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && !isProcessing && inputRef.current?.click()}
        className={[
          "relative border-2 border-dashed rounded-2xl p-14 text-center transition-all select-none",
          isDragging
            ? "border-blue-500 bg-blue-500/10 scale-[1.01]"
            : "border-gray-700 hover:border-gray-500 bg-gray-900",
          isProcessing ? "cursor-not-allowed opacity-60 pointer-events-none" : "cursor-pointer",
        ].join(" ")}
      >
        {/* Hidden native file input */}
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.wav,.m4a,.ogg,.flac"
          className="sr-only"
          onChange={handleFileInput}
          disabled={isProcessing}
        />

        {selectedFile ? (
          /* File selected state */
          <div className="space-y-2">
            <div className="text-5xl">🎵</div>
            <p className="text-white font-semibold text-lg">{selectedFile.name}</p>
            <p className="text-gray-400 text-sm">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB &nbsp;·&nbsp; {selectedFile.type}
            </p>
            <p className="text-gray-600 text-xs mt-1">Click or drop to replace</p>
          </div>
        ) : (
          /* Empty state */
          <div className="space-y-2">
            <div className="text-5xl">☁️</div>
            <p className="text-gray-300 font-semibold text-lg">Drag & drop your audio file here</p>
            <p className="text-gray-500 text-sm">or click to browse</p>
            <p className="text-gray-700 text-xs mt-3">MP3 · WAV · M4A · OGG · FLAC &nbsp;— up to 50 MB</p>
          </div>
        )}
      </div>

      {/* Analyze button — only shown when a file is selected */}
      {selectedFile && (
        <button
          onClick={onAnalyze}
          disabled={isProcessing}
          className={[
            "w-full py-3 rounded-xl font-semibold text-white text-base transition-all",
            isProcessing
              ? "bg-blue-800 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-500 active:scale-[0.99] shadow-lg shadow-blue-900/40",
          ].join(" ")}
        >
          {isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              {/* Spinning loader SVG — no extra icon library needed */}
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {status === "uploading" ? "Uploading file…" : "Running AI analysis…"}
            </span>
          ) : (
            "🔍 Analyze Emotion"
          )}
        </button>
      )}
    </div>
  );
}
