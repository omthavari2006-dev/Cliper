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
  Zap,
  Timer,
  Download,
  Film
} from 'lucide-react';
import WaveformChart from './components/WaveformChart.jsx';
import DirectClipCard from './components/DirectClipCard.jsx';

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
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

    // Step animation for smooth progress feedback
    const t1 = setTimeout(() => setLoadingStep(2), 600);
    const t2 = setTimeout(() => setLoadingStep(3), 1400);

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
        throw new Error(data.error || 'Failed to analyze and cut video clips');
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingStep(0);
    }
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
                  Dynamic Clip Cutter
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Extracts All Highlight Moments in Maximum 1080p HD Quality (Variable Lengths)</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 px-3 py-1 rounded-full bg-slate-900 border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              Max Quality (1080p Full HD) • Variable Length (12s–45s)
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        {/* Search & URL Input Hero */}
        <section className="flex flex-col items-center text-center max-w-3xl mx-auto w-full gap-4 pt-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-950/50 border border-purple-800/40 text-purple-300 text-xs font-semibold shadow-inner">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            Maximum Quality (1080p Full HD) • Variable Lengths (12s–45s) • Direct MP4 Downloads
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Extract <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">All Viral Highlight Moments</span> in Maximum Quality
          </h2>
          <p className="text-sm text-slate-400 max-w-xl">
            Paste any YouTube video or stream link. Cliper finds all interesting peaks across the video, cuts them into variable-length standalone video clips (12s to 45s) rendered in pristine 1080p Full HD, and hands you the ready-to-download MP4s!
          </p>

          {/* Input Box */}
          <div className="w-full mt-2 relative flex flex-col gap-3">
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
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-bold text-sm shadow-lg shadow-purple-900/40 transition-all flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Cutting Clips...</span>
                  </>
                ) : (
                  <>
                    <Scissors className="w-4 h-4" />
                    <span>Cut & Give Me All Clips</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Sample Buttons */}
            {samples.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="text-slate-500">Try Sample:</span>
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
            <div className="w-14 h-14 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin flex items-center justify-center">
              <Scissors className="w-6 h-6 text-purple-400" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-100 text-base">Detecting & Slicing All Highlight Clips...</h3>
              <p className="text-xs text-slate-400 mt-1">
                {loadingStep === 1 && 'Scanning timeline for all peak replay & high-energy moments...'}
                {loadingStep === 2 && 'Calculating natural variable durations (12s to 45s) for each moment...'}
                {loadingStep === 3 && 'Slicing video files into standalone MP4s ready to download...'}
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
              <strong className="block font-semibold mb-0.5">Could not cut clips:</strong>
              {error}
            </div>
          </div>
        )}

        {/* Results: Direct Cut Clips Gallery! */}
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
                        Full Video: {formatDuration(result.video.duration)}
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

              {/* Status Badge */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  {result.analysis.clips.length} Standalone Highlight Clips Available
                </span>
              </div>
            </div>

            {/* Interactive Heatmap Waveform (Visual Reference Only) */}
            {result.analysis.heatmap && result.analysis.heatmap.length > 0 && (
              <div className="glass-panel p-4 rounded-2xl border border-slate-800/90 shadow-xl">
                <WaveformChart
                  heatmap={result.analysis.heatmap}
                  duration={result.video.duration}
                  activeClip={result.analysis.clips[0]}
                />
              </div>
            )}

            {/* DIRECT EDITED CLIPS GALLERY */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-2">
                  <Film className="w-5 h-5 text-purple-400" />
                  <h3 className="font-extrabold text-slate-100 text-lg">
                    Your Cut Video Clips ({result.analysis.clips.length})
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  Variable lengths (12s to 45s) • No YouTube embeds • Watch or download directly
                </span>
              </div>

              {/* Grid of Cut Clips */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {result.analysis.clips.map((clip, index) => (
                  <DirectClipCard
                    key={clip.id || index}
                    clip={clip}
                    rank={index + 1}
                    videoId={result.video.id}
                  />
                ))}
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
              <h3 className="font-bold text-slate-200 text-sm">Finds All Interesting Moments</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Doesn't stop at just 4 clips. Scans the entire video and extracts 8 to 10+ peak moments across the whole video.
              </p>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-slate-800/80 flex flex-col gap-2">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <h3 className="font-bold text-slate-200 text-sm">Natural Variable Lengths</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Clips adjust naturally to the moment (12s, 19s, 28s, 36s, 42s) while staying strictly under 45-50s.
              </p>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-slate-800/80 flex flex-col gap-2">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm">
                3
              </div>
              <h3 className="font-bold text-slate-200 text-sm">Pristine Maximum Quality</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Renders and cuts in maximum available source quality (1080p 60fps Full HD) with studio AAC audio, 9:16 Shorts framing, and 1-click MP4 download.
              </p>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#080b12] py-6 mt-auto text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Cliper • Standalone Video Clip Generator</span>
          <span>Variable Lengths (12s to 45s) • Direct MP4 Clips</span>
        </div>
      </footer>
    </div>
  );
}
