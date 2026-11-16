import React, { useState } from 'react';
import {
  Smartphone,
  Monitor,
  Square,
  Clock,
  RotateCcw,
  Download,
  Share2,
  ExternalLink,
  Sliders,
  Flame,
  Check,
  Copy
} from 'lucide-react';

export default function ClipPlayer({
  videoId,
  clip,
  onUpdateClip,
  onOpenExport
}) {
  const [aspectRatio, setAspectRatio] = useState('16-9'); // '16-9', '9-16', '1-1'
  const [copied, setCopied] = useState(false);

  if (!clip) {
    return (
      <div className="w-full aspect-video glass-panel rounded-2xl flex flex-col items-center justify-center text-slate-500">
        <Monitor className="w-10 h-10 mb-2 stroke-[1.5]" />
        <span>Select any clip to preview</span>
      </div>
    );
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const adjustStart = (delta) => {
    const newStart = Math.max(0, clip.startTime + delta);
    if (newStart < clip.endTime - 5) {
      onUpdateClip({
        ...clip,
        startTime: newStart,
        duration: clip.endTime - newStart
      });
    }
  };

  const adjustEnd = (delta) => {
    const newEnd = Math.max(clip.startTime + 5, clip.endTime + delta);
    onUpdateClip({
      ...clip,
      endTime: newEnd,
      duration: newEnd - clip.startTime
    });
  };

  const copyTimestamps = () => {
    const text = `${formatTime(clip.startTime)} - ${formatTime(clip.endTime)}: ${clip.title}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // YouTube embed URL with start and end times
  const embedUrl = `https://www.youtube.com/embed/${videoId}?start=${clip.startTime}&end=${clip.endTime}&autoplay=1&rel=0&modestbranding=1`;

  return (
    <div className="flex flex-col gap-4">
      {/* Top Player Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111624] p-3 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Framing Preview:
          </span>
          <div className="flex items-center bg-slate-900/90 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => setAspectRatio('16-9')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                aspectRatio === '16-9'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              16:9 Landscape
            </button>
            <button
              onClick={() => setAspectRatio('9-16')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                aspectRatio === '9-16'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              9:16 Shorts / Reel
            </button>
            <button
              onClick={() => setAspectRatio('1-1')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                aspectRatio === '1-1'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
              1:1 Square
            </button>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={copyTimestamps}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-xs font-medium text-slate-300 hover:text-white transition-all border border-slate-700/60"
            title="Copy timestamp for YouTube chapters or video editor"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy Timestamps'}
          </button>

          <button
            onClick={() => onOpenExport(clip)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-semibold text-white shadow-md shadow-purple-900/30 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Export Clip
          </button>
        </div>
      </div>

      {/* Video Container with Dynamic Framing */}
      <div className="relative w-full bg-[#0a0d15] rounded-2xl border border-slate-800/90 overflow-hidden flex items-center justify-center p-2 min-h-[360px] md:min-h-[440px]">
        {aspectRatio === '16-9' && (
          <div className="w-full aspect-video rounded-xl overflow-hidden shadow-2xl bg-black">
            <iframe
              key={`${clip.id}-${clip.startTime}-${clip.endTime}`}
              src={embedUrl}
              title={clip.title}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {aspectRatio === '9-16' && (
          <div className="relative w-[270px] sm:w-[300px] aspect-[9/16] rounded-2xl overflow-hidden border-2 border-purple-500/40 shadow-2xl bg-black flex items-center justify-center">
            {/* Phone notch bar decoration */}
            <div className="absolute top-2 z-20 w-24 h-4 bg-slate-900/80 rounded-full border border-slate-700/50 flex items-center justify-center pointer-events-none">
              <span className="w-2 h-2 rounded-full bg-slate-700"></span>
            </div>

            {/* Blurred ambient background to fill vertical sides */}
            <iframe
              src={embedUrl}
              className="absolute inset-0 w-full h-full scale-[2.2] blur-xl opacity-40 pointer-events-none"
              title="background-blur"
            />

            {/* Centered video */}
            <div className="relative z-10 w-full aspect-video">
              <iframe
                key={`${clip.id}-${clip.startTime}-${clip.endTime}`}
                src={embedUrl}
                title={clip.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            {/* Overlay badge */}
            <div className="absolute bottom-3 left-3 right-3 z-20 pointer-events-none flex items-center justify-between text-[11px] text-white/90 bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10">
              <span className="font-semibold truncate max-w-[170px]">{clip.title}</span>
              <span className="font-mono text-amber-300">{clip.duration}s</span>
            </div>
          </div>
        )}

        {aspectRatio === '1-1' && (
          <div className="relative w-[340px] aspect-square rounded-2xl overflow-hidden border-2 border-purple-500/40 shadow-2xl bg-black flex items-center justify-center">
            <iframe
              src={embedUrl}
              className="absolute inset-0 w-full h-full scale-[1.8] blur-xl opacity-40 pointer-events-none"
              title="background-blur-sq"
            />
            <div className="relative z-10 w-full aspect-video">
              <iframe
                key={`${clip.id}-${clip.startTime}-${clip.endTime}`}
                src={embedUrl}
                title={clip.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}
      </div>

      {/* Clip Fine-Tuning & Trimming Controls */}
      <div className="bg-[#111624] p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-slate-200">Fine-Tune Clip Window</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Current Clip Length:</span>
            <span className="font-mono font-bold text-purple-300 px-2 py-0.5 rounded bg-purple-950/60 border border-purple-800/50">
              {clip.duration} seconds
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Start Time Adjuster */}
          <div className="flex items-center justify-between bg-slate-900/80 p-3 rounded-lg border border-slate-800">
            <div>
              <span className="text-[11px] text-slate-500 block uppercase font-semibold">Start Time</span>
              <span className="font-mono text-base font-bold text-slate-100">
                {formatTime(clip.startTime)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => adjustStart(-5)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 hover:text-white"
                title="Subtract 5 seconds"
              >
                -5s
              </button>
              <button
                onClick={() => adjustStart(-1)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 hover:text-white"
                title="Subtract 1 second"
              >
                -1s
              </button>
              <button
                onClick={() => adjustStart(1)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 hover:text-white"
                title="Add 1 second"
              >
                +1s
              </button>
              <button
                onClick={() => adjustStart(5)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 hover:text-white"
                title="Add 5 seconds"
              >
                +5s
              </button>
            </div>
          </div>

          {/* End Time Adjuster */}
          <div className="flex items-center justify-between bg-slate-900/80 p-3 rounded-lg border border-slate-800">
            <div>
              <span className="text-[11px] text-slate-500 block uppercase font-semibold">End Time</span>
              <span className="font-mono text-base font-bold text-slate-100">
                {formatTime(clip.endTime)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => adjustEnd(-5)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 hover:text-white"
                title="Subtract 5 seconds"
              >
                -5s
              </button>
              <button
                onClick={() => adjustEnd(-1)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 hover:text-white"
                title="Subtract 1 second"
              >
                -1s
              </button>
              <button
                onClick={() => adjustEnd(1)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 hover:text-white"
                title="Add 1 second"
              >
                +1s
              </button>
              <button
                onClick={() => adjustEnd(5)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 hover:text-white"
                title="Add 5 seconds"
              >
                +5s
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
