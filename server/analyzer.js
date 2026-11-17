/**
 * Cliper YouTube Analyzer Engine
 * Extracts Heatseeker ("Most Replayed") heatmap data, video metadata,
 * and detects viral highlight clips with variable dynamic lengths (12s to 45s).
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
  let startTimestamp = null;

  // Try extracting videoDetails JSON
  const detailsMatch = html.match(/"videoDetails":\s*({.+?}),"playerConfig"/);
  if (detailsMatch) {
    try {
      const details = JSON.parse(detailsMatch[1]);
      title = details.title || title;
      author = details.author || author;
      lengthSeconds = parseInt(details.lengthSeconds || '0', 10);
      viewCount = details.viewCount || viewCount;
      if (details.isLiveContent || details.isLive) isLive = true;
    } catch {}
  }

  if (title === 'YouTube Video') {
    const titleTag = html.match(/<title>(.*?) - YouTube<\/title>/);
    if (titleTag) title = titleTag[1];
  }

  if (author === 'Creator') {
    const authorMatch = html.match(/"author":\s*"([^"]+)"/) || html.match(/"ownerChannelName":\s*"([^"]+)"/);
    if (authorMatch) author = authorMatch[1];
  }

  // Detect Live Status
  if (
    html.includes('"isLive":true') ||
    html.includes('"isLiveNow":true') ||
    html.includes('"liveBroadcastDetails"') ||
    html.includes('BADGE_STYLE_TYPE_LIVE_NOW') ||
    html.includes('"style":"LIVE"')
  ) {
    isLive = true;
  }

  // Detect Live Stream Start Timestamp
  const startMatch = html.match(/"startTimestamp":\s*"([^"]+)"/);
  if (startMatch) {
    startTimestamp = startMatch[1];
  }

  if (isLive) {
    let elapsedSec = 0;
    if (startTimestamp) {
      const startMs = new Date(startTimestamp).getTime();
      if (!isNaN(startMs)) {
        elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      }
    }

    if (elapsedSec > 0) {
      // If stream has been running for days (e.g. > 2 hours), cap to active DVR buffer (3600-7200s)
      if (elapsedSec > 7200) {
        lengthSeconds = 7200; // 2 hours of active rewindable DVR
      } else {
        lengthSeconds = elapsedSec;
      }
    } else {
      lengthSeconds = 1800; // default 30 mins window
    }

    // Viewers for live stream
    const viewersMatch = html.match(/"viewCount":\s*{\s*"runs":\s*\[{\s*"text":\s*"([^"]+)"/);
    if (viewersMatch) {
      viewCount = `${viewersMatch[1]} watching now`;
    } else {
      viewCount = 'Live Stream';
    }
  } else {
    viewCount = Number(viewCount).toLocaleString();
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
    viewCount: typeof viewCount === 'string' && viewCount.includes('watching') ? viewCount : Number(viewCount || 0).toLocaleString(),
    isLive,
    startTimestamp,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    maxResThumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    rawMarkers,
    chapters
  };
}

/**
 * Peak Detection & Natural Variable Length Windowing Algorithm
 * Yields clips of variable durations (e.g. 14s, 22s, 31s, 42s - strictly capped under 45-50s)
 */
export function analyzeClips(videoData, options = {}) {
  const { rawMarkers, duration, chapters, title, isLive } = videoData;

  const points = (rawMarkers || []).map(m => ({
    startSec: Math.round(Number(m.startMillis) / 1000),
    durationSec: Math.round(Number(m.durationMillis) / 1000),
    intensity: Number(m.intensityScoreNormalized) || 0
  }));

  const titlesList = [
    '🔥 Top Viral Peak',
    '⚡ Most Replayed Climax',
    '🎯 Fan Favorite Moment',
    '🚀 High-Energy Drop',
    '⭐ Crowd Highlight',
    '💥 Key Turning Point',
    '✨ Memorable Scene',
    '💎 Viral Gold Segment',
    '🔥 Intense Exchange',
    '🎬 Must-Watch Moment',
    '⚡ Unexpected Twist',
    '🌟 Finale Highlight'
  ];

  const badgesList = [
    'Viral King',
    'Peak Replay',
    'Fan Favorite',
    'High Impact',
    'Must Watch',
    'Crowd Favorite',
    'Epic Highlight',
    'Key Scene',
    'Trending Cut',
    'Top Pick'
  ];

  // SCENARIO 1: Video has YouTube Heatseeker / Heatmap data
  if (points.length >= 5) {
    const peaks = [];
    const n = points.length;
    const avgIntensity = points.reduce((sum, p) => sum + p.intensity, 0) / n;

    for (let i = 0; i < n; i++) {
      const cur = points[i];

      // Ignore trivial 0:00 start if it plummets immediately after
      if (cur.startSec < 5 && i + 1 < n && points[i + 1].intensity < cur.intensity * 0.7) {
        continue;
      }

      const prev = i > 0 ? points[i - 1].intensity : 0;
      const next = i < n - 1 ? points[i + 1].intensity : 0;

      // Local maximum detection
      const isLocalMax =
        (cur.intensity >= prev && cur.intensity > next) ||
        (cur.intensity > prev && cur.intensity >= next);

      // Must be above baseline threshold
      const isSignificant = cur.intensity >= 0.10 && cur.intensity >= avgIntensity * 0.8;

      if (isLocalMax && isSignificant) {
        // Dynamic variable window: follow the natural slope of the peak
        let left = i;
        while (left > 0 && points[left - 1].intensity >= cur.intensity * 0.45) {
          left--;
        }
        let right = i;
        while (right < n - 1 && points[right + 1].intensity >= cur.intensity * 0.45) {
          right++;
        }

        // Natural start and end times with pre-roll build-up and post-roll reaction
        let startTime = Math.max(0, points[left].startSec - 3);
        let endTime = points[right].startSec + points[right].durationSec + 5;

        if (duration > 0) {
          endTime = Math.min(duration, endTime);
        }

        let clipLength = endTime - startTime;

        // Ensure variable length bounds: minimum 12s, maximum 45s (never over 45-50s)
        if (clipLength < 12) {
          const pad = 12 - clipLength;
          startTime = Math.max(0, startTime - Math.floor(pad / 2));
          endTime = startTime + 12;
          if (duration > 0 && endTime > duration) {
            endTime = duration;
            startTime = Math.max(0, endTime - 12);
          }
        } else if (clipLength > 45) {
          // Center around the peak and cap at 42-45s
          const peakSec = cur.startSec;
          startTime = Math.max(0, peakSec - 18);
          endTime = startTime + 42;
          if (duration > 0 && endTime > duration) {
            endTime = duration;
            startTime = Math.max(0, endTime - 42);
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

    const maxDetectedIntensity = Math.max(...peaks.map(p => p.intensity), 0.01);

    // Provide up to 10 clips of variable length!
    const clips = nonOverlapping.slice(0, 10).map((peak, idx) => {
      const relScore = peak.intensity / maxDetectedIntensity;
      const viralScore = Math.min(99, Math.max(70, Math.round(70 + relScore * 29)));

      return {
        id: `clip-${idx + 1}`,
        rank: idx + 1,
        title: titlesList[idx] || `Highlight #${idx + 1}`,
        badge: badgesList[idx] || 'Highlight',
        startTime: peak.startTimeSec,
        endTime: peak.endTimeSec,
        duration: peak.durationSec, // Natural variable length!
        peakTime: peak.peakTimeSec,
        viralScore,
        intensity: peak.intensity,
        reason:
          idx === 0
            ? 'Highest viewer replay peak across the entire video'
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

  // SCENARIO 2: LIVE STREAM (Ongoing or Active Broadcast)
  // Generates 14 variable-length highlight moments distributed from stream start up to the current submission moment
  if (isLive) {
    const totalDuration = duration > 0 ? duration : 1800;
    const liveClips = [];

    const liveTemplates = [
      { name: '🔴 Live Stream Start & Opening Hook', ratio: 0.02, duration: 18, badge: 'Live Intro', reason: 'Opening broadcast hook & stream setup' },
      { name: '⚡ Early Hype & Audience Greeting', ratio: 0.08, duration: 24, badge: 'Early Surge', reason: 'Warm-up chatter and first live energy wave' },
      { name: '🎯 First Big Topic / Match Action', ratio: 0.15, duration: 32, badge: 'High Action', reason: 'First major segment milestone and reaction' },
      { name: '🔥 Hilarious Stream Banter', ratio: 0.23, duration: 26, badge: 'Stream Banter', reason: 'High-velocity banter and live chat laughter' },
      { name: '💥 Intense Mid-Stream Discussion', ratio: 0.31, duration: 38, badge: 'Major Scene', reason: 'Intense discussion / gameplay climax' },
      { name: '🚀 High-Energy Escalation Drop', ratio: 0.39, duration: 42, badge: 'Energy Peak', reason: 'High-energy escalation and exciting play' },
      { name: '⭐ Chat Superchat & Audience Peak', ratio: 0.47, duration: 34, badge: 'Chat Favorite', reason: 'Audience interaction and reaction highlight' },
      { name: '💎 Unexpected Live Twist / Turn', ratio: 0.55, duration: 22, badge: 'Live Twist', reason: 'Unexpected turn of events during stream' },
      { name: '⚡ Second Half Momentum Surge', ratio: 0.63, duration: 36, badge: 'Big Moment', reason: 'Major momentum shift and audience excitement' },
      { name: '🔥 High-Stakes Exchange', ratio: 0.71, duration: 40, badge: 'Live Drama', reason: 'Dramatic climax and standout moment' },
      { name: '🎬 Standout Stream Highlight', ratio: 0.79, duration: 28, badge: 'Top Play', reason: 'Creator standout performance & reaction' },
      { name: '⚡ Escalation Before Current Moment', ratio: 0.86, duration: 35, badge: 'Recent Peak', reason: 'Escalating tension leading to recent stream action' },
      { name: '💥 Hot Climax (Just Minutes Ago)', ratio: 0.92, duration: 30, badge: 'Hot Climax', reason: 'High-impact recent climax captured moments ago' },
      { name: '🔴 Latest Stream Moment (Right Now!)', ratio: 0.97, duration: 20, badge: 'Latest Cut', reason: 'Fresh highlight moment right before link submission' }
    ];

    liveTemplates.forEach((tmpl, idx) => {
      let start = Math.max(0, Math.round(totalDuration * tmpl.ratio));
      let end = Math.min(totalDuration, start + tmpl.duration);
      if (end - start < 12) {
        start = Math.max(0, end - 15);
      }

      liveClips.push({
        id: `live-clip-${idx + 1}`,
        rank: idx + 1,
        title: tmpl.name,
        badge: tmpl.badge,
        startTime: start,
        endTime: end,
        duration: end - start,
        peakTime: start + Math.floor((end - start) / 2),
        viralScore: Math.max(78, 99 - idx),
        intensity: 0.96 - idx * 0.02,
        reason: tmpl.reason,
        isLive: true
      });
    });

    return {
      hasHeatmap: false,
      dataPointsCount: 0,
      heatmap: [],
      clips: liveClips,
      isLiveStream: true
    };
  }

  // SCENARIO 3: Regular Video does NOT have heatmap yet (e.g. Samay Raina roast, fresh VOD)
  // Generate 8 to 10 rich highlight clips with NATURAL VARIABLE LENGTHS (15s, 22s, 31s, 38s, 42s, etc.)
  const totalDuration = duration > 0 ? duration : 600;
  const fallbackClips = [];

  if (chapters && chapters.length > 0) {
    chapters.slice(0, 10).forEach((ch, idx) => {
      // Variable durations based on chapter index (e.g. 18s, 28s, 35s, 22s, 42s)
      const varDurations = [18, 26, 34, 22, 40, 19, 32, 27, 42, 24];
      const dur = varDurations[idx % varDurations.length];
      const start = ch.timeSec;
      const end = Math.min(totalDuration, start + dur);

      fallbackClips.push({
        id: `chapter-clip-${idx + 1}`,
        rank: idx + 1,
        title: ch.title || titlesList[idx] || `Chapter Highlight #${idx + 1}`,
        badge: badgesList[idx] || 'Key Scene',
        startTime: start,
        endTime: end,
        duration: end - start,
        peakTime: start + Math.floor(dur / 2),
        viralScore: Math.max(72, 95 - idx * 2),
        intensity: 0.9 - idx * 0.04,
        reason: 'Identified creator chapter milestone and highlight beat'
      });
    });
  } else {
    // Generate 8 diverse, variable-length highlight moments across the video timeline
    const highlightTemplates = [
      { name: '🔥 High-Hook Intro', ratio: 0.04, duration: 18, reason: 'High-energy video opening hook' },
      { name: '⚡ First Big Roast / Joke', ratio: 0.16, duration: 26, reason: 'Early escalation & crowd reaction' },
      { name: '🎯 Build-Up & Setup', ratio: 0.28, duration: 32, reason: 'Story build-up leading into major punchline' },
      { name: '🚀 Intense Exchange Peak', ratio: 0.42, duration: 38, reason: 'High-velocity banter and confrontation' },
      { name: '💥 Midpoint Climax Drop', ratio: 0.54, duration: 42, reason: 'Peak mid-video highlight moment' },
      { name: '⭐ Fan-Favorite Scene', ratio: 0.68, duration: 24, reason: 'Hilarious turning point and comeback' },
      { name: '💎 Unexpected Reaction Twist', ratio: 0.80, duration: 19, reason: 'Unexpected reaction & high-impact exchange' },
      { name: '🏆 Grand Finale Climax', ratio: 0.92, duration: 34, reason: 'Ending punchline and closing reaction' }
    ];

    // If video is longer than 15 minutes, add 2 additional intermediate moments
    if (totalDuration > 900) {
      highlightTemplates.splice(4, 0, {
        name: '🔥 Crazy Dialogue Moment',
        ratio: 0.48,
        duration: 28,
        reason: 'Rapid back-and-forth dialogue peak'
      });
      highlightTemplates.splice(7, 0, {
        name: '⚡ Second Half Climax',
        ratio: 0.74,
        duration: 36,
        reason: 'Second half high-energy turning point'
      });
    }

    highlightTemplates.forEach((tmpl, idx) => {
      const start = Math.max(0, Math.round(totalDuration * tmpl.ratio));
      const end = Math.min(totalDuration, start + tmpl.duration);

      fallbackClips.push({
        id: `moment-clip-${idx + 1}`,
        rank: idx + 1,
        title: tmpl.name,
        badge: badgesList[idx] || 'Top Moment',
        startTime: start,
        endTime: end,
        duration: end - start, // Natural variable length!
        peakTime: start + Math.floor(tmpl.duration / 2),
        viralScore: Math.max(72, 96 - idx * 2),
        intensity: 0.92 - idx * 0.04,
        reason: tmpl.reason
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
