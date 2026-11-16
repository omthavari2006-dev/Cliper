import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Smartphone,
  Monitor,
  Flame,
  Clock,
  Copy,
  Check,
  Play,
  RotateCcw,
  Sparkles,
  Scissors,
  RefreshCw
} from 'lucide-react';

export default function DirectClipCard({ clip, rank, videoId }) {
  const [aspectRatio, setAspectRatio] = useState('9-16'); // default to 9:16 vertical for Shorts/TikTok!
  const [copied, setCopied] = useState(false);
  const [isReady, setIsReady] = useState(Boolean(clip.ready));
  const [cutting, setCutting] = useState(false);
  const videoRef = useRef(null);

  // Poll for background cut completion if not ready initially
  useEffect(() => {
    if (isReady || !clip.clipId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/clip/check/${clip.clipId}`);
        const data = await res.json();
        if (data.ready) {
          setIsReady(true);
          setCutting(false);
          clearInterval(interval);
        }
      } catch {}
    }, 2000);

    return () => clearInterval(interval);
  }, [clip.clipId, isReady]);

  const handleManualCut = async () => {
    setCutting(true);
    try {
      const res = await fetch('/api/clip/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          startTime: clip.startTime,
          endTime: clip.endTime,
          title: clip.title
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsReady(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCutting(false);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const copyTimestamps = () => {
    const text = `${formatTime(clip.startTime)} - ${formatTime(clip.endTime)}: ${clip.title}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-card rounded-2xl border border-slate-800 p-4 flex flex-col gap-3 shadow-xl hover:border-purple-500/50 transition-all text-left">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-extrabold text-xs text-white shadow-md">
            #{rank}
          </div>
          <div>
            <h4 className="font-bold text-slate-100 text-sm line-clamp-1">{clip.title}</h4>
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-500" />
              Time: <strong className="text-purple-300 font-mono">{formatTime(clip.startTime)} – {formatTime(clip.endTime)}</strong>
            </span>
          </div>
        </div>

        {/* Dynamic Duration, Quality & Score */}
        <div className="flex flex-col items-end shrink-0 gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-[10px] font-extrabold tracking-wide">
              1080p HD
            </span>
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold">
              <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>{clip.duration}s</span>
            </div>
          </div>
          <span className="text-[10px] text-slate-500 font-semibold">
            {clip.viralScore}% Score
          </span>
        </div>
      </div>

      {/* Aspect Ratio Switcher */}
      <div className="flex items-center justify-between text-xs pt-1">
        <span className="text-[11px] text-slate-400 font-medium">Framing:</span>
        <div className="flex items-center bg-slate-900/90 rounded-lg p-0.5 border border-slate-800">
          <button
            onClick={() => setAspectRatio('9-16')}
            className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-all ${
              aspectRatio === '9-16'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3 h-3" />
            9:16 Shorts
          </button>
          <button
            onClick={() => setAspectRatio('16-9')}
            className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-all ${
              aspectRatio === '16-9'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-3 h-3" />
            16:9 Wide
          </button>
        </div>
      </div>

      {/* Standalone Cut Video Player */}
      <div className="relative w-full bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center min-h-[260px] max-h-[380px]">
        {isReady && clip.streamUrl ? (
          aspectRatio === '9-16' ? (
            /* 9:16 Vertical phone framing */
            <div className="relative w-full aspect-[9/14] sm:aspect-[9/16] max-h-[380px] overflow-hidden flex items-center justify-center bg-black">
              {/* Blurred background video */}
              <video
                src={clip.streamUrl}
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover blur-xl opacity-40 pointer-events-none scale-125"
              />
              {/* Phone notch badge */}
              <div className="absolute top-2 z-20 px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] text-purple-300 font-mono flex items-center gap-1.5">
                <span className="text-cyan-400 font-bold">1080p HD</span>
                <span>•</span>
                <span>{clip.duration}s Clip</span>
              </div>
              {/* Center video */}
              <div className="relative z-10 w-full aspect-video">
                <video
                  ref={videoRef}
                  src={clip.streamUrl}
                  controls
                  loop
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          ) : (
            /* 16:9 Landscape framing */
            <div className="w-full aspect-video rounded-xl overflow-hidden bg-black flex items-center justify-center">
              <video
                ref={videoRef}
                src={clip.streamUrl}
                controls
                loop
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
          )
        ) : (
          <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center gap-3">
            {cutting ? (
              <>
                <RefreshCw className="w-6 h-6 text-purple-400 animate-spin" />
                <span className="font-semibold text-purple-300">Slicing {clip.duration}s video clip...</span>
              </>
            ) : (
              <>
                <Scissors className="w-6 h-6 text-slate-500" />
                <span className="text-slate-400">Queueing {clip.duration}s clip in background</span>
                <button
                  onClick={handleManualCut}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  Cut Now (2s)
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom Download & Action Bar */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
        <button
          onClick={copyTimestamps}
          className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Timestamp'}
        </button>

        {isReady && clip.downloadUrl ? (
          <a
            href={clip.downloadUrl}
            download
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 transition-all text-center"
          >
            <Download className="w-3.5 h-3.5" />
            Download MP4 • 1080p HD ({clip.duration}s)
          </a>
        ) : (
          <button
            onClick={handleManualCut}
            disabled={cutting}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600/80 hover:bg-purple-600 text-white font-bold text-xs shadow-md transition-all text-center disabled:opacity-50"
          >
            <Scissors className="w-3.5 h-3.5" />
            {cutting ? 'Cutting...' : `Ready Clip (${clip.duration}s)`}
          </button>
        )}
      </div>
    </div>
  );
}
