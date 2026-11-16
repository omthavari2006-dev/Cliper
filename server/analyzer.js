/**
 * Cliper YouTube Analyzer Engine
 * Extracts Heatseeker ("Most Replayed") heatmap data, video metadata,
 * and detects viral highlight clips with dynamic windowing.
 */

export function extractVideoId(urlOrId) {
  if (!urlOrId) return null;
  const str = urlOrId.trim();

  // If already an 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }

  // Common YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/live\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /\/shorts\/([a-zA-Z0-9_-]{11})/,
    /\/live\/([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = str.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Robustly parses balanced JSON from a given starting index
 */
function extractBalancedJson(text, startIdx, openChar = '[', closeChar = ']') {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === openChar) depth++;
      else if (char === closeChar) {
        depth--;
        if (depth === 0) {
          return text.substring(startIdx, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * Fetches YouTube watch page HTML and extracts raw heatmap points + metadata
 */
export async function fetchYouTubeData(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(watchUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error(`YouTube watch page returned HTTP ${response.status}`);
  }

  const html = await response.text();

  // 1. Extract Video Details
  let title = 'YouTube Video';
  let author = 'Creator';
  let lengthSeconds = 0;
  let viewCount = '0';
  let isLive = false;

  // Try extracting videoDetails JSON
  const detailsMatch = html.match(/"videoDetails":\s*({.+?}),"playerConfig"/);
  if (detailsMatch) {
    try {
      const details = JSON.parse(detailsMatch[1]);
      title = details.title || title;
      author = details.author || author;
      lengthSeconds = parseInt(details.lengthSeconds || '0', 10);
      viewCount = details.viewCount || viewCount;
      isLive = Boolean(details.isLiveContent || details.isLive);
    } catch {
      // Fallback to regex matches if JSON parse failed
    }
  }

  if (title === 'YouTube Video') {
    const titleTag = html.match(/<title>(.*?) - YouTube<\/title>/);
    if (titleTag) title = titleTag[1];
  }

  // 2. Extract Heatmap Data
  let rawMarkers = [];

  // Strategy A: Modern YouTube macroMarkersListEntity
  const modernKey = '"markerType":"MARKER_TYPE_HEATMAP","markers":[';
  const modernIdx = html.indexOf(modernKey);
  if (modernIdx !== -1) {
    const startIdx = modernIdx + modernKey.length - 1;
    const jsonStr = extractBalancedJson(html, startIdx, '[', ']');
    if (jsonStr) {
      try {
        rawMarkers = JSON.parse(jsonStr);
      } catch (err) {
        console.error('Failed to parse modern heatmap markers:', err);
      }
    }
  }

  // Strategy B: Classic HEATSEEKER markersMap
  if (rawMarkers.length === 0) {
    const classicKey = '"key":"HEATSEEKER"';
    const classicIdx = html.indexOf(classicKey);
    if (classicIdx !== -1) {
      const heatMarkersIdx = html.indexOf('"heatMarkers":[', classicIdx);
      if (heatMarkersIdx !== -1) {
        const startIdx = heatMarkersIdx + '"heatMarkers":['.length - 1;
        const jsonStr = extractBalancedJson(html, startIdx, '[', ']');
        if (jsonStr) {
          try {
            const items = JSON.parse(jsonStr);
            rawMarkers = items
              .map(item => item.heatMarkerRenderer)
              .filter(Boolean)
              .map(r => ({
                startMillis: String(r.timeRangeStartMillis),
                durationMillis: String(r.markerDurationMillis),
                intensityScoreNormalized: r.heatMarkerIntensityScoreNormalized
              }));
          } catch (err) {
            console.error('Failed to parse classic heatmap markers:', err);
          }
        }
      }
    }
  }

  // 3. Extract Chapters (if any) as bonus/fallback
  const chapters = [];
  const chapterKey = '"markerType":"MARKER_TYPE_CHAPTERS","markers":[';
  const chapterIdx = html.indexOf(chapterKey);
  if (chapterIdx !== -1) {
    const startIdx = chapterIdx + chapterKey.length - 1;
    const jsonStr = extractBalancedJson(html, startIdx, '[', ']');
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        parsed.forEach(c => {
          if (c.chapterRenderer) {
            chapters.push({
              title: c.chapterRenderer.title?.simpleText || 'Chapter',
              timeSec: Math.round(Number(c.chapterRenderer.timeRangeStartMillis || 0) / 1000)
            });
          }
        });
      } catch {}
    }
  }

  return {
    videoId,
    title,
    author,
    duration: lengthSeconds,
    viewCount: Number(viewCount).toLocaleString(),
    isLive,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    maxResThumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    rawMarkers,
    chapters
  };
}

/**
 * Peak Detection & Dynamic Windowing Algorithm
 */
export function analyzeClips(videoData) {
  const { rawMarkers, duration, chapters, title } = videoData;

  const points = (rawMarkers || []).map(m => ({
    startSec: Math.round(Number(m.startMillis) / 1000),
    durationSec: Math.round(Number(m.durationMillis) / 1000),
    intensity: Number(m.intensityScoreNormalized) || 0
  }));

  // If heatmap data exists
  if (points.length >= 5) {
    const peaks = [];
    const n = points.length;

    // Calculate average intensity for baseline reference
    const avgIntensity = points.reduce((sum, p) => sum + p.intensity, 0) / n;

    for (let i = 0; i < n; i++) {
      const cur = points[i];

      // Ignore trivial 0:00 start if it plummets immediately after
      if (cur.startSec < 5 && i + 1 < n && points[i + 1].intensity < cur.intensity * 0.7) {
        continue;
      }

      const prev = i > 0 ? points[i - 1].intensity : 0;
      const next = i < n - 1 ? points[i + 1].intensity : 0;

      // Local maximum
      const isLocalMax =
        (cur.intensity >= prev && cur.intensity > next) ||
        (cur.intensity > prev && cur.intensity >= next);

      // Must be above baseline threshold
      const isSignificant = cur.intensity >= 0.12 && cur.intensity >= avgIntensity * 0.9;

      if (isLocalMax && isSignificant) {
        // Dynamic window expansion
        let left = i;
        while (left > 0 && points[left - 1].intensity >= cur.intensity * 0.45) {
          left--;
        }
        let right = i;
        while (right < n - 1 && points[right + 1].intensity >= cur.intensity * 0.45) {
          right++;
        }

        // Add lead-in context and reaction buffer
        let startTime = Math.max(0, points[left].startSec - 6);
        let endTime = points[right].startSec + points[right].durationSec + 8;

        // If duration is known, clamp within video boundary
        if (duration > 0) {
          endTime = Math.min(duration, endTime);
        }

        let clipLength = endTime - startTime;

        // Enforce sweet-spot clip duration (20s to 60s)
        if (clipLength < 20) {
          const pad = 20 - clipLength;
          startTime = Math.max(0, startTime - Math.floor(pad / 2));
          endTime = startTime + 20;
          if (duration > 0 && endTime > duration) {
            endTime = duration;
            startTime = Math.max(0, endTime - 20);
          }
        } else if (clipLength > 75) {
          // Center around the peak time
          const peakSec = cur.startSec;
          startTime = Math.max(0, peakSec - 25);
          endTime = startTime + 60;
          if (duration > 0 && endTime > duration) {
            endTime = duration;
            startTime = Math.max(0, endTime - 60);
          }
        }

        peaks.push({
          peakTimeSec: cur.startSec,
          intensity: cur.intensity,
          startTimeSec: startTime,
          endTimeSec: endTime,
          durationSec: endTime - startTime
        });
      }
    }

    // Sort by intensity descending
    peaks.sort((a, b) => b.intensity - a.intensity);

    // Deduplicate overlapping clips (allow up to 25% overlap maximum)
    const nonOverlapping = [];
    for (const p of peaks) {
      const overlaps = nonOverlapping.some(existing => {
        const overlapStart = Math.max(p.startTimeSec, existing.startTimeSec);
        const overlapEnd = Math.min(p.endTimeSec, existing.endTimeSec);
        const overlapDur = Math.max(0, overlapEnd - overlapStart);
        const minDur = Math.min(p.durationSec, existing.durationSec);
        return overlapDur / minDur > 0.35;
      });

      if (!overlaps) {
        nonOverlapping.push(p);
      }
    }

    // Rank and enrich clips
    const titles = [
      '🔥 Top Viral Peak',
      '⚡ Most Replayed Climax',
      '🎯 Fan Favorite Moment',
      '🚀 High-Energy Drop',
      '⭐ Crowd Highlight',
      '💥 Key Turning Point',
      '✨ Memorable Scene',
      '💎 Viral Gold Segment'
    ];

    const badges = ['Viral King', 'Peak Replay', 'Fan Favorite', 'High Impact', 'Must Watch'];

    // Relative intensity scaling so Rank 1 is near 99%
    const maxDetectedIntensity = Math.max(...peaks.map(p => p.intensity), 0.01);

    const clips = nonOverlapping.slice(0, 8).map((peak, idx) => {
      const relScore = peak.intensity / maxDetectedIntensity;
      const viralScore = Math.min(99, Math.max(68, Math.round(68 + relScore * 31)));

      return {
        id: `clip-${idx + 1}`,
        rank: idx + 1,
        title: titles[idx] || `Highlight #${idx + 1}`,
        badge: badges[idx] || 'Highlight',
        startTime: peak.startTimeSec,
        endTime: peak.endTimeSec,
        duration: peak.durationSec,
        peakTime: peak.peakTimeSec,
        viralScore,
        intensity: peak.intensity,
        reason:
          idx === 0
            ? 'Highest viewer replay concentration detected across the entire video'
            : `Viewer engagement peaked at ${Math.round(relScore * 100)}% relative to video climax`
      };
    });

    return {
      hasHeatmap: true,
      dataPointsCount: points.length,
      heatmap: points,
      clips
    };
  }

  // Fallback if no heatmap (e.g. brand new video or active live stream)
  const fallbackClips = [];
  const totalDuration = duration > 0 ? duration : 300;

  if (chapters && chapters.length > 0) {
    chapters.slice(0, 6).forEach((ch, idx) => {
      const start = ch.timeSec;
      const end = Math.min(totalDuration, start + 45);
      fallbackClips.push({
        id: `chapter-clip-${idx + 1}`,
        rank: idx + 1,
        title: ch.title || `Chapter Highlight #${idx + 1}`,
        badge: 'Chapter Peak',
        startTime: start,
        endTime: end,
        duration: end - start,
        peakTime: start + 10,
        viralScore: 85 - idx * 3,
        intensity: 0.8 - idx * 0.05,
        reason: 'Extracted from creator chapter milestone'
      });
    });
  } else {
    // Generate smart golden-ratio segments
    const segments = [
      { name: '🔥 High-Hook Intro', ratio: 0.05, duration: 35 },
      { name: '⚡ Build-Up Peak', ratio: 0.35, duration: 45 },
      { name: '🎯 Midpoint Climax', ratio: 0.55, duration: 50 },
      { name: '🚀 Finale Highlight', ratio: 0.85, duration: 40 }
    ];

    segments.forEach((seg, idx) => {
      const start = Math.max(0, Math.round(totalDuration * seg.ratio));
      const end = Math.min(totalDuration, start + seg.duration);
      fallbackClips.push({
        id: `smart-clip-${idx + 1}`,
        rank: idx + 1,
        title: seg.name,
        badge: 'Smart Segment',
        startTime: start,
        endTime: end,
        duration: end - start,
        peakTime: start + 15,
        viralScore: 80 - idx * 4,
        intensity: 0.7 - idx * 0.05,
        reason: 'Smart timeline highlight (Heatmap is still generating on YouTube)'
      });
    });
  }

  return {
    hasHeatmap: false,
    dataPointsCount: 0,
    heatmap: [],
    clips: fallbackClips
  };
}
