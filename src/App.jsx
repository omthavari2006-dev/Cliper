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
  ArrowRight,
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

  // Hour-by-Hour Interactive Session States
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [totalSegments, setTotalSegments] = useState(1);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [isLastSession, setIsLastSession] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(new Set());

  // Dynamic filter and sorting states
  const [readyClipIds, setReadyClipIds] = useState(new Set());
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'ready' | 'queued'
  const [sortBy, setSortBy] = useState('viral'); // 'viral' | 'timeline'
  const [searchQuery, setSearchQuery] = useState('');

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

  const startSession = (segIdx = 0, targetUrl = null) => {
    const inputUrl = targetUrl || url;
    if (!inputUrl.trim()) return;

    // Close any previous event source connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setLoading(true);
    setIsSessionComplete(false);
    setError(null);
    setActiveSegmentIndex(segIdx);
    setReadyClipIds(new Set());
    setFilterTab('all');
    setSearchQuery('');
    setStreamingStatus(`Connecting & starting Session ${segIdx + 1} (Hour ${segIdx + 1})...`);

    // Clear previous hour's clips from view, as requested!
    setResult(prev => {
      if (!prev) return null;
      return {
        ...prev,
        analysis: {
          ...prev.analysis,
          clips: []
        }
      };
    });

    // Connect to progressive real-time SSE streaming endpoint for this specific session/hour
    const eventSource = new EventSource(`/api/analyze/stream?url=${encodeURIComponent(inputUrl)}&segment=${segIdx}`);
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
        setTotalSegments(video.totalSegments || 1);
        setResult(prev => ({
          video,
          analysis: {
            hasHeatmap: video.hasHeatmap,
            heatmap: [],
            clips: prev?.video?.id === video.id ? (prev.analysis?.clips || []) : [],
            isLiveStream: video.isLive
          }
        }));
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

    eventSource.addEventListener('session_complete', (e) => {
      try {
        const data = JSON.parse(e.data);
        setIsSessionComplete(true);
        setIsLastSession(Boolean(data.isLastSession));
        setCompletedSessions(prev => new Set([...prev, data.segmentIndex]));
        setStreamingStatus(data.message || `Session ${data.hourNumber} Complete! Review & download clips below.`);
        setLoading(false);
        eventSource.close();
      } catch {}
    });

    eventSource.addEventListener('complete', (e) => {
      try {
        const data = JSON.parse(e.data);
        setIsSessionComplete(true);
        setIsLastSession(Boolean(data.isLastSession));
        setLoading(false);
        eventSource.close();
      } catch {}
    });

    // Server-sent fatal error event with JSON payload
    eventSource.addEventListener('error', (e) => {
      try {
        if (e.data) {
          const errData = JSON.parse(e.data);
          setError(errData.message || 'Error occurred while streaming clips');
          setLoading(false);
          eventSource.close();
        }
      } catch {}
    });

    // Network-level error handler: allows automatic browser reconnection
    eventSource.onerror = () => {
      // readyState: 0 = CONNECTING (reconnecting), 1 = OPEN, 2 = CLOSED
      if (eventSource.readyState === 2) {
        setLoading(false);
      }
    };
  };

  const handleAnalyze = (targetUrl = null) => {
    startSession(0, targetUrl);
  };

  const handleNextSession = () => {
    const nextSeg = activeSegmentIndex + 1;
    if (nextSeg < totalSegments) {
      startSession(nextSeg);
    }
  };

  const handleStopStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (result?.video?.id) {
      fetch('/api/analyze/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: result.video.id })
      }).catch(() => {});
    }
    setLoading(false);
    setIsSessionComplete(true);
    setStreamingStatus(`Session ${activeSegmentIndex + 1} stopped. All extracted clips are ready below.`);
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

  // Filter & sort clips
  const displayedClips = [...rawClips]
    .filter(c => {
      const isReady = c.ready || readyClipIds.has(c.clipId);
      if (filterTab === 'ready' && !isReady) return false;
      if (filterTab === 'queued' && isReady) return false;

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
                    <span>Cutting Hour {activeSegmentIndex + 1}...</span>
                  </>
                ) : (
                  <>
                    <Scissors className="w-4 h-4" />
                    <span>Start Session 1 (Hour 1)</span>
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
                      startSession(0, s.url);
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
              <h3 className="font-bold text-slate-100 text-base">Connecting to YouTube & Initializing Session 1...</h3>
              <p className="text-xs text-purple-300 mt-1 font-medium">
                {streamingStatus || 'Extracting timeline and preparing hour-by-hour clip engine...'}
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
            {/* Live Pipeline Active Banner */}
            {loading && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-950/80 via-slate-900/90 to-indigo-950/80 border border-purple-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center shrink-0">
                    <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-cyan-300 uppercase tracking-wider bg-cyan-950/80 border border-cyan-500/40 px-2 py-0.5 rounded-md">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                        Session {activeSegmentIndex + 1} of {totalSegments} Active
                      </span>
                      <span className="text-xs text-purple-300 font-bold">
                        Hour {activeSegmentIndex + 1}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 font-medium">{streamingStatus}</p>
                  </div>
                </div>
                <button
                  onClick={handleStopStream}
                  className="px-3.5 py-1.5 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold shadow-md transition-all shrink-0 hover:scale-105"
                >
                  Stop Session & Keep Clips ({rawClips.length})
                </button>
              </div>
            )}

            {/* Session Complete: Review & Advance to Next Session Banner */}
            {isSessionComplete && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/90 via-slate-900 to-purple-950/90 border border-emerald-500/50 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fadeIn">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-950 border border-emerald-500/50 text-emerald-300 text-[11px] font-extrabold uppercase tracking-wide">
                        Session {activeSegmentIndex + 1} (Hour {activeSegmentIndex + 1}) Ready for Review
                      </span>
                      <span className="text-xs text-slate-300 font-semibold">
                        {rawClips.length} Shorts Clips Generated
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      Review and download the clips you want below. When you're ready, click "Start Next Session" to remove these and cut Hour {activeSegmentIndex + 2}!
                    </p>
                  </div>
                </div>

                {!isLastSession ? (
                  <button
                    onClick={handleNextSession}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-extrabold text-xs sm:text-sm shadow-xl shadow-purple-900/50 flex items-center justify-center gap-2 transition-all hover:scale-105 shrink-0"
                  >
                    <span>Start Next Session: Hour {activeSegmentIndex + 2} of {totalSegments}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="px-4 py-2 rounded-xl bg-purple-950/80 border border-purple-500/50 text-purple-200 text-xs font-bold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>All {totalSegments} Timeline Hours Completed!</span>
                  </div>
                )}
              </div>
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
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-950/60 border border-purple-500/40 text-purple-300 text-xs font-semibold">
                  <Clock className="w-4 h-4 text-purple-400" />
                  Session {activeSegmentIndex + 1} of {totalSegments} (Hour {activeSegmentIndex + 1})
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  {readyCount} Clips Ready to Watch
                </span>
              </div>
            </div>

            {/* Session Stepper / Timeline Bar */}
            {totalSegments > 1 && (
              <div className="glass-panel p-3 sm:p-4 rounded-2xl border border-slate-800 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold text-slate-200">
                      Session Timeline: <span className="text-purple-300 font-extrabold">Hour {activeSegmentIndex + 1} of {totalSegments}</span>
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {completedSessions.size} of {totalSegments} Hours Reviewed
                  </span>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  {Array.from({ length: totalSegments }, (_, i) => {
                    const isCurrent = i === activeSegmentIndex;
                    const isDone = completedSessions.has(i);
                    return (
                      <button
                        key={i}
                        onClick={() => !loading && startSession(i)}
                        disabled={loading && isCurrent}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                          isCurrent
                            ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-900/50 scale-105'
                            : isDone
                            ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                            : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        {isCurrent && loading ? (
                          <RefreshCw className="w-3 h-3 animate-spin text-cyan-300" />
                        ) : isDone ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                        )}
                        <span>Hour {i + 1}</span>
                        <span className="text-[10px] opacity-70">
                          ({i.toString().padStart(2, '0')}:00)
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* DIRECT EDITED CLIPS GALLERY */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-1">
                <div className="flex items-center gap-2">
                  <Film className="w-5 h-5 text-purple-400" />
                  <h3 className="font-extrabold text-slate-100 text-lg">
                    Session {activeSegmentIndex + 1} Clips ({rawClips.length}) • Hour {activeSegmentIndex + 1} of {totalSegments}
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  {result.video.isLive
                    ? `Hour ${activeSegmentIndex + 1} live stream timeline scanned • 13s–36s viral Shorts clips • Watch or download`
                    : `Hour ${activeSegmentIndex + 1} video timeline scanned • 13s–36s viral Shorts clips • Watch or download`}
                </span>
              </div>

              {/* Comprehensive Filter Bar */}
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
                      All Session Clips ({rawClips.length})
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
                        Timeline Order
                      </button>
                    </div>
                  </div>

                  {/* Search query box */}
                  <div className="relative flex items-center min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5" />
                    <input
                      type="text"
                      placeholder="Filter session clips..."
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
                  <p className="font-semibold text-slate-300">
                    {loading ? `Cutting clips for Session ${activeSegmentIndex + 1} (Hour ${activeSegmentIndex + 1})...` : 'No clips match your current filter.'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {loading ? 'Clips will appear here in real-time as they finish rendering.' : 'Try selecting "All Session Clips" or clearing the search query.'}
                  </p>
                </div>
              )}

              {/* Bottom Action CTA: Start Next Session */}
              {isSessionComplete && !isLastSession && (
                <div className="flex justify-center pt-6 pb-6">
                  <button
                    onClick={handleNextSession}
                    className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-extrabold text-sm sm:text-base shadow-2xl shadow-purple-900/60 flex items-center gap-3 transition-all hover:scale-105"
                  >
                    <span>Done Reviewing Hour {activeSegmentIndex + 1}? Start Next Session (Hour {activeSegmentIndex + 2} of {totalSegments})</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
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
