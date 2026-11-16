import React, { useState, useEffect } from 'react';
import {
  Scissors,
  Sparkles,
  Play,
  Flame,
  Search,
  ExternalLink,
  Clock,
  Eye,
  CheckCircle2,
  AlertCircle,
  Radio,
  Tv,
  Share2,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  Zap
} from 'lucide-react';
import WaveformChart from './components/WaveformChart.jsx';
import ClipCard from './components/ClipCard.jsx';
import ClipPlayer from './components/ClipPlayer.jsx';
import ExportModal from './components/ExportModal.jsx';

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [activeClip, setActiveClip] = useState(null);
  const [exportClip, setExportClip] = useState(null);
  const [samples, setSamples] = useState([]);

  // Fetch samples on mount
  useEffect(() => {
    fetch('/api/samples')
      .then(res => res.json())
      .then(data => {
        if (data.samples) setSamples(data.samples);
      })
      .catch(() => {});
  }, []);

  const handleAnalyze = async (targetUrl = null) => {
    const inputUrl = targetUrl || url;
    if (!inputUrl.trim()) return;

    setLoading(true);
    setError(null);
    setLoadingStep(1);

    // Step animation for smooth user experience
    const t1 = setTimeout(() => setLoadingStep(2), 700);
    const t2 = setTimeout(() => setLoadingStep(3), 1500);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl })
      });

      clearTimeout(t1);
      clearTimeout(t2);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze video');
      }

      setResult(data);
      if (data.analysis.clips && data.analysis.clips.length > 0) {
        setActiveClip(data.analysis.clips[0]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingStep(0);
    }
  };

  const handleUpdateActiveClip = (updated) => {
    setActiveClip(updated);
    if (result && result.analysis && result.analysis.clips) {
      const newClips = result.analysis.clips.map(c => (c.id === updated.id ? updated : c));
      setResult({
        ...result,
        analysis: {
          ...result.analysis,
          clips: newClips
        }
      });
    }
  };

  const handleSeekFromChart = (seekSec) => {
    if (!activeClip) return;
    // Reposition active clip around this timestamp
    const half = Math.round(activeClip.duration / 2);
    const newStart = Math.max(0, seekSec - half);
    const newEnd = newStart + activeClip.duration;
    handleUpdateActiveClip({
      ...activeClip,
      startTime: newStart,
      endTime: newEnd,
      peakTime: seekSec
    });
  };

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#07090e] text-slate-100 selection:bg-purple-600/40">
      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-[#0c101a]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-400 p-[1px] shadow-lg shadow-purple-900/30">
              <div className="w-full h-full bg-[#0d1220] rounded-[11px] flex items-center justify-center">
                <Scissors className="w-5 h-5 text-purple-400 -rotate-45" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-purple-300 bg-clip-text text-transparent">
                  Cliper
                </h1>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wide">
                  Heatmap AI
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">YouTube Most Replayed Highlight Extractor</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 px-3 py-1 rounded-full bg-slate-900 border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Heatseeker Engine Ready
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        {/* Search & URL Input Hero */}
        <section className="flex flex-col items-center text-center max-w-3xl mx-auto w-full gap-4 pt-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-950/50 border border-purple-800/40 text-purple-300 text-xs font-semibold shadow-inner">
            <Zap className="w-3.5 h-3.5 text-purple-400" />
            Turn 2-Hour Videos & Streams into Viral 30-Second Clips in Seconds
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Find the <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">Most Replayed</span> Parts of Any YouTube Video
          </h2>
          <p className="text-sm text-slate-400 max-w-xl">
            Paste any YouTube video or live stream link. Cliper extracts YouTube's raw Heatseeker graph, detects local climax peaks, and creates viral short-form clips instantly.
          </p>

          {/* Input Box */}
          <div className="w-full mt-2 relative">
            <div className="relative flex items-center bg-[#101421] border-2 border-slate-700/80 focus-within:border-purple-500 rounded-2xl p-1.5 shadow-2xl transition-all">
              <div className="pl-3 text-slate-400">
                <Search className="w-5 h-5 text-purple-400" />
              </div>
              <input
                type="text"
                placeholder="Paste YouTube Video or Live Stream URL (e.g. https://www.youtube.com/watch?v=...)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                className="w-full bg-transparent px-3 py-2.5 text-sm sm:text-base text-slate-100 placeholder:text-slate-500 focus:outline-none"
              />
              <button
                onClick={() => handleAnalyze()}
                disabled={loading || !url.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-semibold text-sm shadow-lg shadow-purple-900/40 transition-all flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Extract Clips</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Sample Buttons */}
            {samples.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-3 text-xs">
                <span className="text-slate-500">Quick Test:</span>
                {samples.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setUrl(s.url);
                      handleAnalyze(s.url);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors flex items-center gap-1"
                  >
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Loading Progress State */}
        {loading && (
          <div className="w-full max-w-xl mx-auto glass-panel p-6 rounded-2xl border border-purple-500/40 shadow-2xl flex flex-col items-center gap-4 animate-fadeIn">
            <div className="w-12 h-12 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin flex items-center justify-center">
              <Scissors className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-100 text-base">Analyzing Video Highlights...</h3>
              <p className="text-xs text-slate-400 mt-1">
                {loadingStep === 1 && 'Connecting to YouTube & fetching metadata...'}
                {loadingStep === 2 && 'Extracting YouTube Heatseeker ("Most Replayed") graph points...'}
                {loadingStep === 3 && 'Running peak detection and framing optimal 15-60s clip windows...'}
              </p>
            </div>

            <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden mt-1">
              <div
                className="bg-gradient-to-r from-purple-500 to-cyan-400 h-full transition-all duration-500"
                style={{ width: `${loadingStep * 33}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="max-w-2xl mx-auto w-full p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <strong className="block font-semibold mb-0.5">Could not process video:</strong>
              {error}
            </div>
          </div>
        )}

        {/* Results Dashboard */}
        {result && !loading && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            {/* Video Overview Bar */}
            <div className="glass-panel p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-slate-800">
              <div className="flex items-center gap-4">
                <img
                  src={result.video.thumbnail}
                  alt={result.video.title}
                  className="w-24 sm:w-28 aspect-video rounded-xl object-cover border border-slate-700 shadow-md"
                />
                <div>
                  <h3 className="font-bold text-slate-100 text-sm sm:text-base line-clamp-1">
                    {result.video.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
                    <span className="font-semibold text-purple-300">{result.video.author}</span>
                    {result.video.duration > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {formatDuration(result.video.duration)}
                      </span>
                    )}
                    {result.video.viewCount && (
                      <span className="flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                        {result.video.viewCount} views
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Badges */}
              <div className="flex items-center gap-2 shrink-0">
                {result.analysis.hasHeatmap ? (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Heatmap Verified ({result.analysis.dataPointsCount} pts)
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-950/60 border border-amber-500/40 text-amber-300 text-xs font-semibold">
                    <Radio className="w-4 h-4 text-amber-400 animate-pulse" />
                    Smart Segments Mode
                  </span>
                )}
              </div>
            </div>

            {/* Interactive Heatmap Waveform Visualizer */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800/90 shadow-xl">
              <WaveformChart
                heatmap={result.analysis.heatmap}
                duration={result.video.duration}
                activeClip={activeClip}
                onSeek={handleSeekFromChart}
              />
            </div>

            {/* Main Interactive Studio Grid (Player on Left, Clip Ranks on Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Player & Aspect Framing (7 cols) */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                <ClipPlayer
                  videoId={result.video.id}
                  clip={activeClip}
                  onUpdateClip={handleUpdateActiveClip}
                  onOpenExport={(clip) => setExportClip(clip)}
                />
              </div>

              {/* Right Column: Ranked Clips Showcase (5 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-1">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <h3 className="font-bold text-slate-200 text-sm">
                      Top Detected Clips ({result.analysis.clips.length})
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500">Ranked by Replay Peaks</span>
                </div>

                <div className="flex flex-col gap-3 max-h-[640px] overflow-y-auto pr-1">
                  {result.analysis.clips.map((clip) => (
                    <ClipCard
                      key={clip.id}
                      clip={clip}
                      isActive={activeClip?.id === clip.id}
                      onSelect={(selected) => setActiveClip(selected)}
                      onExport={(selected) => setExportClip(selected)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Feature Explainer (Shown when idle before search) */}
        {!result && !loading && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
            <div className="glass-card p-5 rounded-2xl border border-slate-800/80 flex flex-col gap-2">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <h3 className="font-bold text-slate-200 text-sm">Heatseeker Analysis</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Extracts YouTube's 100 timeline intensity data points to identify exact moments where viewers replay, rewind, and re-watch.
              </p>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-slate-800/80 flex flex-col gap-2">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <h3 className="font-bold text-slate-200 text-sm">Dynamic Peak Windowing</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Automatically calculates the hook lead-in context and reaction aftermath, generating perfect 15-to-60 second viral clip boundaries.
              </p>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-slate-800/80 flex flex-col gap-2">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
                3
              </div>
              <h3 className="font-bold text-slate-200 text-sm">9:16 Vertical Preview & Export</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Preview in phone aspect ratio for Shorts, TikTok, and Reels. Export timestamps or 1-click ultra-fast 1080p rendering commands.
              </p>
            </div>
          </section>
        )}
      </main>

      {/* Export Modal */}
      {exportClip && result && (
        <ExportModal
          isOpen={Boolean(exportClip)}
          onClose={() => setExportClip(null)}
          clip={exportClip}
          video={result.video}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#080b12] py-6 mt-auto text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Cliper • AI Most Replayed YouTube Highlight Generator</span>
          <span>Works with YouTube Videos, Shorts & Live Stream VODs</span>
        </div>
      </footer>
    </div>
  );
}
