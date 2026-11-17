import React, { useState, useEffect, useRef } from 'react';
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
  const [streamingStatus, setStreamingStatus] = useState('');
  const [currentStage, setCurrentStage] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [samples, setSamples] = useState([]);
  const eventSourceRef = useRef(null);

  // Dynamic filter and sorting states for handling 40-65+ clips seamlessly
  const [readyClipIds, setReadyClipIds] = useState(new Set());
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'ready' | 'queued'
  const [sortBy, setSortBy] = useState('viral'); // 'viral' | 'timeline'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHour, setSelectedHour] = useState('all');

  // Fetch samples on mount
  useEffect(() => {
    fetch('/api/samples')
      .then(res => res.json())
      .then(data => {
        if (data.samples) setSamples(data.samples);
      })
      .catch(() => {});

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleAnalyze = (targetUrl = null) => {
    const inputUrl = targetUrl || url;
    if (!inputUrl.trim()) return;

    // Close any previous event source connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setLoading(true);
    setError(null);
    setStreamingStatus('Connecting to YouTube and reading stream timeline...');
    setCurrentStage(null);
    setResult(null);
    setReadyClipIds(new Set());
    setFilterTab('all');
    setSelectedHour('all');
    setSearchQuery('');

    // Connect to progressive real-time SSE streaming endpoint
    const eventSource = new EventSource(`/api/analyze/stream?url=${encodeURIComponent(inputUrl)}`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('status', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.message) setStreamingStatus(data.message);
      } catch {}
    });

    eventSource.addEventListener('video', (e) => {
      try {
        const video = JSON.parse(e.data);
        setResult({
          video,
          analysis: {
            hasHeatmap: video.hasHeatmap,
            heatmap: [],
            clips: [],
            isLiveStream: video.isLive
          }
        });
      } catch {}
    });

    eventSource.addEventListener('stage', (e) => {
      try {
        const data = JSON.parse(e.data);
        setCurrentStage(data);
        if (data.message) setStreamingStatus(data.message);
      } catch {}
    });

    eventSource.addEventListener('clipping_progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.message) setStreamingStatus(data.message);
      } catch {}
    });

    eventSource.addEventListener('clip_ready', (e) => {
      try {
        const clip = JSON.parse(e.data);
        setReadyClipIds(prev => new Set([...prev, clip.clipId]));
        setResult(prev => {
          if (!prev) return prev;
          const existing = prev.analysis.clips || [];
          if (existing.some(c => c.clipId === clip.clipId)) return prev;
          return {
            ...prev,
            analysis: {
              ...prev.analysis,
              clips: [...existing, clip]
            }
          };
        });
      } catch {}
    });

    eventSource.addEventListener('segment_complete', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.message) setStreamingStatus(data.message);
      } catch {}
    });

    eventSource.addEventListener('complete', (e) => {
      try {
        const data = JSON.parse(e.data);
        setStreamingStatus(data.message || 'All timeline hours analyzed and clips ready!');
        setLoading(false);
        eventSource.close();
      } catch {}
    });

    eventSource.addEventListener('error', (e) => {
      try {
        if (e.data) {
          const errData = JSON.parse(e.data);
          setError(errData.message || 'Error occurred while streaming clips');
        } else {
          setLoading(false);
        }
      } catch {
        setLoading(false);
      }
      eventSource.close();
    });
  };

  const handleStopStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setLoading(false);
    setStreamingStatus('Live pipeline stopped. All extracted clips are ready below.');
  };

  const handleClipReady = (clipId) => {
    setReadyClipIds(prev => new Set([...prev, clipId]));
  };

  const formatDuration = (secs) => {
    if (!secs || secs <= 0) return '0:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const rawClips = result?.analysis?.clips || [];
  const readyCount = rawClips.filter(c => c.ready || readyClipIds.has(c.clipId)).length;
  const queuedCount = Math.max(0, rawClips.length - readyCount);

  // Total hours in video (for hour tabs when video is multi-hour)
  const totalHours = result?.video?.duration ? Math.ceil(result.video.duration / 3600) : 0;

  // Filter & sort clips
  const displayedClips = [...rawClips]
    .filter(c => {
      const isReady = c.ready || readyClipIds.has(c.clipId);
      if (filterTab === 'ready' && !isReady) return false;
      if (filterTab === 'queued' && isReady) return false;

      if (selectedHour !== 'all') {
        const hourNum = parseInt(selectedHour, 10);
        const clipHour = Math.floor(c.startTime / 3600);
        if (clipHour !== hourNum) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = c.title.toLowerCase().includes(q);
        const matchesBadge = c.badge?.toLowerCase().includes(q);
        const matchesRank = String(c.rank).includes(q);
        if (!matchesTitle && !matchesBadge && !matchesRank) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'timeline') {
        return a.startTime - b.startTime;
      }
      return (b.viralScore || 0) - (a.viralScore || 0);
    });

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
                  Shorts & Highlight Cutter
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Extracts Shorts-Ready Highlight Moments in 1080p HD (Mostly 6s–15s, Some Big)</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 px-3 py-1 rounded-full bg-slate-900 border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              Shorts-Ready (Mostly 6s–15s, Some Big) • 1080p Full HD
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
            Shorts-Optimized • Mostly Short & Punchy (6s–15s) with Selected Big Moments • 1080p HD
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Extract <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">Shorts-Ready Viral Clips</span> in Seconds
          </h2>
          <p className="text-sm text-slate-400 max-w-xl">
            Paste any YouTube video or stream link. Cliper cuts peak replay moments into viral Shorts-ready video clips (mostly punchy 6s to 15s clips, with occasional longer narrative moments), rendered in pristine 1080p Full HD with 9:16 vertical crop.
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

        {/* Initial Connecting State (shown only before video metadata arrives) */}
        {loading && !result && (
          <div className="w-full max-w-xl mx-auto glass-panel p-6 rounded-2xl border border-purple-500/40 shadow-2xl flex flex-col items-center gap-4 animate-fadeIn">
            <div className="w-14 h-14 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin flex items-center justify-center">
              <Scissors className="w-6 h-6 text-purple-400" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-100 text-base">Connecting to YouTube & Initializing Pipeline...</h3>
              <p className="text-xs text-purple-300 mt-1 font-medium">
                {streamingStatus || 'Extracting timeline and preparing progressive live clip engine...'}
              </p>
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

        {/* Results: Progressive Real-Time Cut Clips Gallery! */}
        {result && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            {/* Live Progressive Pipeline Banner */}
            {loading ? (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-950/80 via-slate-900/90 to-indigo-950/80 border border-purple-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center shrink-0">
                    <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-cyan-300 uppercase tracking-wider bg-cyan-950/80 border border-cyan-500/40 px-2 py-0.5 rounded-md">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                        Live Pipeline Active
                      </span>
                      <span className="text-xs text-purple-300 font-bold">
                        {currentStage ? `Hour ${currentStage.hourNumber} of ${currentStage.totalSegments}` : 'Progressive Stream'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 font-medium">{streamingStatus}</p>
                  </div>
                </div>
                <button
                  onClick={handleStopStream}
                  className="px-3.5 py-1.5 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold shadow-md transition-all shrink-0 hover:scale-105"
                >
                  Stop Pipeline & Keep Clips ({rawClips.length})
                </button>
              </div>
            ) : (
              streamingStatus && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300 shadow">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{streamingStatus}</span>
                </div>
              )
            )}
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
                    {result.video.isLive && (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-950/80 border border-red-500/60 text-red-300 text-[11px] font-bold animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        LIVE STREAM
                      </span>
                    )}
                    <span className="font-semibold text-purple-300">{result.video.author}</span>
                    {result.video.duration > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {result.video.isLive ? 'Streamed Duration' : 'Full Duration'}: <strong className="text-purple-300 font-mono">{formatDuration(result.video.duration)}</strong>
                      </span>
                    )}
                    {result.video.viewCount && (
                      <span className="flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                        {result.video.viewCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Badge & Dynamic Live Counts */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 shrink-0">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  {rawClips.length} Highlight Clips Across Full Duration
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                  {readyCount} Ready Now • {queuedCount} Queued
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
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-1">
                <div className="flex items-center gap-2">
                  <Film className="w-5 h-5 text-purple-400" />
                  <h3 className="font-extrabold text-slate-100 text-lg">
                    {result.video.isLive ? 'All Live Stream Highlight Clips' : 'All Video Highlight Clips'} ({rawClips.length})
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  {result.video.isLive
                    ? 'Full broadcast timeline scanned • Variable Shorts lengths (mostly 6s–15s, some big) • Queued & ready one-by-one'
                    : 'Full video timeline scanned • Variable Shorts lengths (mostly 6s–15s, some big) • Watch or download directly'}
                </span>
              </div>

              {/* Comprehensive Filter & Navigation Bar */}
              <div className="glass-panel p-3 rounded-xl border border-slate-800 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Status Filter Tabs */}
                  <div className="flex items-center bg-slate-900/90 p-1 rounded-lg border border-slate-800 text-xs">
                    <button
                      onClick={() => setFilterTab('all')}
                      className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                        filterTab === 'all'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      All Clips ({rawClips.length})
                    </button>
                    <button
                      onClick={() => setFilterTab('ready')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                        filterTab === 'ready'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ready to Watch ({readyCount})
                    </button>
                    <button
                      onClick={() => setFilterTab('queued')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                        filterTab === 'queued'
                          ? 'bg-cyan-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      In Queue ({queuedCount})
                    </button>
                  </div>

                  {/* Sort Order Switcher */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 font-medium">Sort By:</span>
                    <div className="flex items-center bg-slate-900/90 p-1 rounded-lg border border-slate-800">
                      <button
                        onClick={() => setSortBy('viral')}
                        className={`flex items-center gap-1 px-3 py-1 rounded-md transition-all ${
                          sortBy === 'viral'
                            ? 'bg-purple-600 text-white font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Flame className="w-3 h-3 text-amber-400" />
                        Top Viral Score
                      </button>
                      <button
                        onClick={() => setSortBy('timeline')}
                        className={`flex items-center gap-1 px-3 py-1 rounded-md transition-all ${
                          sortBy === 'timeline'
                            ? 'bg-purple-600 text-white font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Clock className="w-3 h-3 text-cyan-400" />
                        Timeline Order (0:00 → End)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Search & Timeline Hour Filter */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
                  {/* Jump to Hour selector for long videos */}
                  {totalHours > 1 ? (
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      <span className="text-slate-400 font-medium mr-1">Timeline Hour:</span>
                      <button
                        onClick={() => setSelectedHour('all')}
                        className={`px-2 py-1 rounded text-xs transition-colors ${
                          selectedHour === 'all'
                            ? 'bg-purple-600 text-white font-bold'
                            : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                        }`}
                      >
                        All Hours
                      </button>
                      {Array.from({ length: totalHours }, (_, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedHour(String(i))}
                          className={`px-2 py-1 rounded text-xs transition-colors ${
                            selectedHour === String(i)
                              ? 'bg-purple-600 text-white font-bold'
                              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                          }`}
                        >
                          Hour {i + 1}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">
                      Showing highlights detected across the full video duration
                    </div>
                  )}

                  {/* Search query box */}
                  <div className="relative flex items-center min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5" />
                    <input
                      type="text"
                      placeholder="Filter clips by title, hour..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-slate-900/90 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Grid of Cut Clips */}
              {displayedClips.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {displayedClips.map((clip, index) => (
                    <DirectClipCard
                      key={clip.clipId || clip.id || index}
                      clip={{
                        ...clip,
                        ready: Boolean(clip.ready || readyClipIds.has(clip.clipId))
                      }}
                      rank={clip.rank || index + 1}
                      videoId={result.video.id}
                      onReady={handleClipReady}
                    />
                  ))}
                </div>
              ) : (
                <div className="glass-card p-8 rounded-2xl text-center text-slate-400 text-sm border border-slate-800 flex flex-col items-center gap-2">
                  <Scissors className="w-8 h-8 text-slate-600" />
                  <p className="font-semibold text-slate-300">No clips match your current filter.</p>
                  <p className="text-xs text-slate-500">Try selecting "All Clips" or clearing the search query.</p>
                </div>
              )}
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
