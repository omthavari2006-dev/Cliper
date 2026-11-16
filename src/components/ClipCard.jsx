import React from 'react';
import { Play, Flame, Clock, Sparkles, Check, Copy } from 'lucide-react';

export default function ClipCard({
  clip,
  isActive,
  onSelect,
  onExport
}) {
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getRankColor = (rank) => {
    switch (rank) {
      case 1:
        return 'from-amber-400 to-orange-500 text-amber-950 font-extrabold shadow-amber-500/20';
      case 2:
        return 'from-purple-400 to-indigo-500 text-purple-950 font-extrabold shadow-purple-500/20';
      case 3:
        return 'from-cyan-400 to-blue-500 text-cyan-950 font-extrabold shadow-cyan-500/20';
      default:
        return 'from-slate-600 to-slate-700 text-slate-100 font-bold';
    }
  };

  return (
    <div
      onClick={() => onSelect(clip)}
      className={`group relative rounded-xl p-4 cursor-pointer transition-all duration-200 border text-left ${
        isActive
          ? 'bg-purple-950/30 border-purple-500/80 shadow-[0_0_25px_-5px_rgba(139,92,246,0.3)] ring-1 ring-purple-500/50'
          : 'bg-[#101421]/80 hover:bg-[#161c2e]/90 border-slate-800/80 hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Rank Badge */}
          <div
            className={`w-7 h-7 rounded-lg bg-gradient-to-br flex items-center justify-center text-xs shadow-md ${getRankColor(
              clip.rank
            )}`}
          >
            #{clip.rank}
          </div>

          <div>
            <h4 className="font-semibold text-slate-100 text-sm flex items-center gap-1.5 group-hover:text-purple-300 transition-colors">
              {clip.title}
            </h4>
            <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3 text-slate-500" />
              {formatTime(clip.startTime)} - {formatTime(clip.endTime)} ({clip.duration}s)
            </span>
          </div>
        </div>

        {/* Viral Score Badge */}
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold">
            <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span>{clip.viralScore}%</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5">Viral Score</span>
        </div>
      </div>

      {/* Reason / Context */}
      <p className="text-xs text-slate-400 mt-2.5 line-clamp-1 italic">
        "{clip.reason}"
      </p>

      {/* Footer bar */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
        <span className="text-[11px] text-slate-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-purple-400" />
          Peak at <span className="font-mono text-purple-300">{formatTime(clip.peakTime)}</span>
        </span>

        <div className="flex items-center gap-2">
          {isActive ? (
            <span className="text-xs font-semibold text-purple-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
              Playing
            </span>
          ) : (
            <span className="text-xs text-slate-500 group-hover:text-slate-300 flex items-center gap-1 transition-colors">
              <Play className="w-3 h-3 fill-current" />
              Preview
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
