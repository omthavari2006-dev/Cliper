import React, { useState, useRef } from 'react';
import { Flame, Star, Sparkles } from 'lucide-react';

export default function WaveformChart({
  heatmap = [],
  duration = 0,
  activeClip = null,
  onSeek = null
}) {
  const containerRef = useRef(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  if (!heatmap || heatmap.length === 0) {
    return (
      <div className="w-full h-32 rounded-xl glass-card flex flex-col items-center justify-center text-slate-400 p-4 border border-dashed border-slate-700/60">
        <Sparkles className="w-6 h-6 text-purple-400 mb-2 animate-pulse" />
        <span className="text-sm font-medium">Heatseeker graph is generating on YouTube</span>
        <span className="text-xs text-slate-500 mt-1">Smart segment highlights used instead</span>
      </div>
    );
  }

  const formatTime = (secs) => {
    if (!secs || secs <= 0) return '0:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const videoDuration = duration > 0 ? duration : heatmap[heatmap.length - 1].startSec + 10;

  // Chart dimensions
  const width = 1000;
  const height = 140;
  const paddingBottom = 24;
  const graphHeight = height - paddingBottom;

  // Find max intensity for relative scaling
  const maxIntensity = Math.max(...heatmap.map(p => p.intensity), 0.01);

  // Generate SVG path points
  const points = heatmap.map((p, idx) => {
    const x = (p.startSec / videoDuration) * width;
    // Invert Y so highest intensity is at the top
    const normalized = p.intensity / maxIntensity;
    const y = graphHeight - normalized * (graphHeight - 20);
    return { x, y, raw: p };
  });

  // Construct smooth SVG path
  let pathD = `M 0,${graphHeight} `;
  points.forEach((pt, i) => {
    if (i === 0) {
      pathD += `L ${pt.x},${pt.y} `;
    } else {
      // Bezier curve smoothing
      const prev = points[i - 1];
      const cx = (prev.x + pt.x) / 2;
      pathD += `Q ${prev.x},${prev.y} ${cx},${(prev.y + pt.y) / 2} `;
    }
  });
  const lastPt = points[points.length - 1];
  pathD += `L ${lastPt.x},${lastPt.y} L ${width},${graphHeight} Z`;

  // Highlight window for active clip
  let clipHighlight = null;
  if (activeClip) {
    const startX = Math.max(0, (activeClip.startTime / videoDuration) * width);
    const endX = Math.min(width, (activeClip.endTime / videoDuration) * width);
    const clipWidth = Math.max(4, endX - startX);
    clipHighlight = {
      startX,
      clipWidth,
      peakX: (activeClip.peakTime / videoDuration) * width
    };
  }

  // Handle click on chart to seek
  const handleClick = (e) => {
    if (!containerRef.current || !onSeek) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const seekSec = Math.round(ratio * videoDuration);
    onSeek(seekSec);
  };

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, mouseX / rect.width));
    const currentSec = Math.round(ratio * videoDuration);

    // Find nearest point
    const closest = heatmap.reduce((prev, curr) => {
      return Math.abs(curr.startSec - currentSec) < Math.abs(prev.startSec - currentSec) ? curr : prev;
    }, heatmap[0]);

    setHoveredPoint({
      sec: currentSec,
      ratio,
      x: mouseX,
      intensity: closest ? Math.round(closest.intensity * 100) : 0
    });
  };

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-slate-200">YouTube Replay Heatmap</span>
          <span className="text-slate-500">({heatmap.length} data points analyzed)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-purple-300">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block shadow-sm shadow-purple-500/50"></span>
            Active Clip Region
          </span>
          <span className="flex items-center gap-1.5 text-cyan-300">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block shadow-sm shadow-cyan-400/50"></span>
            Replay Intensity
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredPoint(null)}
        className="relative w-full h-[140px] bg-[#0c101a] border border-slate-800 rounded-xl overflow-hidden cursor-crosshair group select-none shadow-inner"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          <defs>
            {/* Heatmap Area Gradient */}
            <linearGradient id="heatGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.75" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#4c1d95" stopOpacity="0.05" />
            </linearGradient>

            {/* Stroke Line Gradient */}
            <linearGradient id="strokeGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="50%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>

            {/* Clip Highlight Glow */}
            <linearGradient id="clipGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1="0" y1={graphHeight * 0.25} x2={width} y2={graphHeight * 0.25} stroke="#1e293b" strokeDasharray="3 3" />
          <line x1="0" y1={graphHeight * 0.5} x2={width} y2={graphHeight * 0.5} stroke="#1e293b" strokeDasharray="3 3" />
          <line x1="0" y1={graphHeight * 0.75} x2={width} y2={graphHeight * 0.75} stroke="#1e293b" strokeDasharray="3 3" />

          {/* Highlight active clip region */}
          {clipHighlight && (
            <g>
              <rect
                x={clipHighlight.startX}
                y="0"
                width={clipHighlight.clipWidth}
                height={graphHeight}
                fill="url(#clipGlow)"
                className="transition-all duration-300"
              />
              <line
                x1={clipHighlight.startX}
                y1="0"
                x2={clipHighlight.startX}
                y2={graphHeight}
                stroke="#a855f7"
                strokeWidth="2"
              />
              <line
                x1={clipHighlight.startX + clipHighlight.clipWidth}
                y1="0"
                x2={clipHighlight.startX + clipHighlight.clipWidth}
                y2={graphHeight}
                stroke="#a855f7"
                strokeWidth="2"
              />
              {/* Peak indicator dot */}
              <circle
                cx={clipHighlight.peakX}
                cy={graphHeight * 0.2}
                r="4"
                fill="#f59e0b"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </g>
          )}

          {/* Heatmap filled shape */}
          <path d={pathD} fill="url(#heatGradient)" />

          {/* Top contour line */}
          <path
            d={pathD.substring(0, pathD.indexOf('L ' + width))}
            fill="none"
            stroke="url(#strokeGradient)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Timeline markers at the bottom */}
          {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
            <text
              key={i}
              x={r * (width - 40) + 5}
              y={height - 6}
              fill="#64748b"
              fontSize="10"
              fontFamily="monospace"
            >
              {formatTime(r * videoDuration)}
            </text>
          ))}
        </svg>

        {/* Hover scrub line & tooltip */}
        {hoveredPoint && (
          <div
            className="absolute top-0 bottom-6 pointer-events-none flex flex-col items-center"
            style={{ left: `${hoveredPoint.x}px` }}
          >
            <div className="w-[1px] h-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]"></div>
            <div className="absolute top-2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md border border-cyan-500/50 text-slate-100 text-[11px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap flex items-center gap-1.5">
              <span className="font-mono text-cyan-300">{formatTime(hoveredPoint.sec)}</span>
              <span className="text-slate-500">•</span>
              <span className="text-amber-400 font-semibold">{hoveredPoint.intensity}% replayed</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
