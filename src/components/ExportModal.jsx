import React, { useState } from 'react';
import { X, Copy, Check, Terminal, FileText, Download, ExternalLink } from 'lucide-react';

export default function ExportModal({
  isOpen,
  onClose,
  clip,
  video
}) {
  const [copiedType, setCopiedType] = useState(null);

  if (!isOpen || !clip || !video) return null;

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatHms = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;
  const startHms = formatHms(clip.startTime);
  const endHms = formatHms(clip.endTime);

  // High-performance yt-dlp section download command (downloads ONLY the clip seconds!)
  const ytdlpCommand = `yt-dlp --download-sections "*${startHms}-${endHms}" --force-keyframes-at-cuts "${videoUrl}" -o "${clip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4"`;

  // Standard FFmpeg stream cut command
  const ffmpegCommand = `ffmpeg -ss ${startHms} -to ${endHms} -i $(yt-dlp -g -f "best[ext=mp4]" "${videoUrl}") -c copy "${clip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4"`;

  // YouTube timestamp chapter format
  const chapterText = `${formatTime(clip.startTime)} - ${clip.title} (Peak at ${formatTime(clip.peakTime)})`;

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-xl bg-[#0e1320] border border-slate-700/80 rounded-2xl p-6 shadow-2xl flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Download className="w-5 h-5 text-purple-400" />
              Export & Download Clip
            </h3>
            <span className="text-xs text-slate-400">
              {clip.title} • {formatTime(clip.startTime)} to {formatTime(clip.endTime)} ({clip.duration}s)
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Option 1: Instant yt-dlp 1080p Segment Render */}
        <div className="flex flex-col gap-2 bg-[#141b2d] p-4 rounded-xl border border-purple-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-purple-400" />
              1-Click Ultra-Fast HD Clip Command (yt-dlp)
            </span>
            <button
              onClick={() => copyToClipboard(ytdlpCommand, 'ytdlp')}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-purple-600/80 hover:bg-purple-600 text-white font-medium transition-all"
            >
              {copiedType === 'ytdlp' ? <Check className="w-3.5 h-3.5 text-green-300" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedType === 'ytdlp' ? 'Copied!' : 'Copy Command'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Downloads <strong className="text-slate-200">only</strong> this exact {clip.duration}-second highlight at 1080p/4K without downloading the whole video:
          </p>
          <pre className="text-[11px] font-mono bg-black/60 p-2.5 rounded-lg text-emerald-400 overflow-x-auto border border-slate-800 select-all">
            {ytdlpCommand}
          </pre>
        </div>

        {/* Option 2: YouTube Description / Video Chapter */}
        <div className="flex flex-col gap-2 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-cyan-400" />
              YouTube Chapter / Timestamp
            </span>
            <button
              onClick={() => copyToClipboard(chapterText, 'chapter')}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-all"
            >
              {copiedType === 'chapter' ? <Check className="w-3.5 h-3.5 text-green-300" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedType === 'chapter' ? 'Copied!' : 'Copy Text'}
            </button>
          </div>
          <pre className="text-xs font-mono bg-black/40 p-2 rounded text-slate-300 border border-slate-800 select-all">
            {chapterText}
          </pre>
        </div>

        {/* Option 3: Direct Link to Peak on YouTube */}
        <div className="flex items-center justify-between pt-2">
          <a
            href={`https://www.youtube.com/watch?v=${video.id}&t=${clip.startTime}s`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 underline underline-offset-4"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open on YouTube at {formatTime(clip.startTime)}
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
