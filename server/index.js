import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { extractVideoId, fetchYouTubeData, analyzeClips, analyzeSegment } from './analyzer.js';
import { renderClip, cutClipsBatch, isClipReady, formatHms } from './clipper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const CLIPS_DIR = path.join(__dirname, '..', 'clips');

app.use(cors());
app.use(express.json());

// Sample videos for quick 1-click testing
const SAMPLES = [
  {
    name: '🔴 Live Stream (Al Jazeera English)',
    url: 'https://www.youtube.com/watch?v=gCNeDWCI0vo',
    type: 'Live Stream'
  },
  {
    name: '🔥 Samay Raina Roast',
    url: 'https://www.youtube.com/watch?v=UlK_W9PLSjw',
    type: 'Comedy Video'
  },
  {
    name: '🎵 Rick Astley - Never Gonna Give You Up',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    type: 'Music Video'
  },
  {
    name: '🎮 MrBeast Squid Game Challenge',
    url: 'https://www.youtube.com/watch?v=0e3GPea1Tyg',
    type: 'High-Energy Video'
  }
];

app.get('/api/samples', (req, res) => {
  res.json({ samples: SAMPLES });
});

// In-memory active video streaming sessions & caches
const activeSessions = new Map();
const videoDataCache = new Map();
const segmentClipsCache = new Map();

// Progressive Streaming Analysis & Cutting Endpoint
// Supports interactive Session Mode (hour-by-hour review & download)
// via ?segment=0, ?segment=1, etc.
app.get('/api/analyze/stream', async (req, res) => {
  const { url, segment } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Please provide a valid YouTube URL' });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: 'Could not parse a valid YouTube Video ID' });
  }

  // Configure Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send SSE keep-alive ping every 3 seconds so proxies/browsers NEVER time out
  const pingTimer = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {}
  }, 3000);

  const sendEventToRes = (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };

  let isClientConnected = true;
  req.on('close', () => {
    isClientConnected = false;
    clearInterval(pingTimer);
  });

  try {
    // 1. Fetch or load cached video metadata
    let videoData = videoDataCache.get(videoId);
    if (!videoData) {
      sendEventToRes('status', { message: 'Connecting to YouTube and reading stream timeline...' });
      videoData = await fetchYouTubeData(videoId);
      videoDataCache.set(videoId, videoData);
    }

    const totalDuration = videoData.duration > 0 ? videoData.duration : 1800;
    const chunkSize = totalDuration <= 1800 ? totalDuration : (totalDuration <= 5400 ? 1800 : 3600);
    const totalSegments = Math.max(1, Math.ceil(totalDuration / chunkSize));

    // Determine target segment (default to 0 if not provided or valid integer)
    const segParam = segment !== undefined && segment !== '' ? parseInt(segment, 10) : 0;
    const segIdx = Math.min(Math.max(0, isNaN(segParam) ? 0 : segParam), totalSegments - 1);
    const segStart = segIdx * chunkSize;
    const segEnd = Math.min(totalDuration, (segIdx + 1) * chunkSize);
    const segHourNum = segIdx + 1;
    const isLastSession = segHourNum >= totalSegments;

    // Send video metadata immediately
    sendEventToRes('video', {
      id: videoData.videoId,
      title: videoData.title,
      author: videoData.author,
      duration: videoData.duration,
      viewCount: videoData.viewCount,
      isLive: videoData.isLive,
      startTimestamp: videoData.startTimestamp,
      thumbnail: videoData.thumbnail,
      maxResThumbnail: videoData.maxResThumbnail,
      hasHeatmap: (videoData.rawMarkers || []).length > 5,
      totalSegments,
      currentSegment: segIdx,
      hourNumber: segHourNum,
      segStart,
      segEnd,
      chunkSize
    });

    const cacheKey = `${videoId}_seg_${segIdx}`;
    const cachedClips = segmentClipsCache.get(cacheKey);

    // 2. If this session was already processed, stream from cache immediately!
    if (cachedClips && cachedClips.length > 0) {
      sendEventToRes('status', {
        message: `Loaded ${cachedClips.length} ready clips for Session ${segHourNum} (${formatHms(segStart)} to ${formatHms(segEnd)})`,
        segmentIndex: segIdx,
        hourNumber: segHourNum,
        totalSegments
      });

      for (const clip of cachedClips) {
        sendEventToRes('clip_ready', clip);
      }

      sendEventToRes('session_complete', {
        segmentIndex: segIdx,
        hourNumber: segHourNum,
        totalSegments,
        isLastSession,
        nextHour: segHourNum + 1,
        clipsCount: cachedClips.length,
        message: `Session ${segHourNum} (${formatHms(segStart)} - ${formatHms(segEnd)}) Complete! Review & download your clips below.`
      });

      sendEventToRes('complete', {
        segmentIndex: segIdx,
        hourNumber: segHourNum,
        totalSegments,
        isLastSession,
        clipsCount: cachedClips.length,
        message: `Session ${segHourNum} Complete! Ready for review.`
      });

      clearInterval(pingTimer);
      return res.end();
    }

    // 3. Process & Cut Clips for this specific Hour Session!
    sendEventToRes('stage', {
      segmentIndex: segIdx,
      totalSegments,
      hourNumber: segHourNum,
      startTimeSec: segStart,
      endTimeSec: segEnd,
      message: `Analyzing Session ${segHourNum} of ${totalSegments} (${formatHms(segStart)} to ${formatHms(segEnd)})... Searching for top jokes, action, and reckless highlights`
    });

    const segMoments = analyzeSegment({
      videoData,
      segStart,
      segEnd,
      segIndex: segIdx,
      totalSegments
    });

    sendEventToRes('status', {
      message: `Session ${segHourNum}: Found ${segMoments.length} highlight moments. Cutting 1080p clips now...`,
      segmentIndex: segIdx,
      hourNumber: segHourNum
    });

    const readyClips = [];
    let overallRank = 1;

    for (const moment of segMoments) {
      if (!isClientConnected) break;

      sendEventToRes('clipping_progress', {
        title: moment.title,
        duration: moment.duration,
        startTime: moment.startTime,
        endTime: moment.endTime,
        rank: overallRank,
        hourNumber: segHourNum,
        message: `Cutting 1080p HD clip: ${moment.title} (${moment.duration}s)...`
      });

      try {
        const rendered = await renderClip({
          videoId,
          startTime: moment.startTime,
          endTime: moment.endTime,
          title: moment.title
        });

        const readyClip = {
          ...moment,
          rank: overallRank++,
          ready: true,
          clipId: rendered.clipId,
          streamUrl: rendered.streamUrl,
          downloadUrl: rendered.downloadUrl,
          hourNumber: segHourNum
        };

        readyClips.push(readyClip);
        sendEventToRes('clip_ready', readyClip);
      } catch (cutErr) {
        console.error(`[Streaming Cutter Error]`, cutErr.message);
      }
    }

    // Cache completed clips for this session
    segmentClipsCache.set(cacheKey, readyClips);

    sendEventToRes('session_complete', {
      segmentIndex: segIdx,
      hourNumber: segHourNum,
      totalSegments,
      isLastSession,
      nextHour: segHourNum + 1,
      clipsCount: readyClips.length,
      message: `Session ${segHourNum} (${formatHms(segStart)} - ${formatHms(segEnd)}) Complete! Review & download your clips below.`
    });

    sendEventToRes('complete', {
      segmentIndex: segIdx,
      hourNumber: segHourNum,
      totalSegments,
      isLastSession,
      clipsCount: readyClips.length,
      message: `Session ${segHourNum} Complete! Ready for review.`
    });

    clearInterval(pingTimer);
    res.end();
  } catch (err) {
    console.error('[Analyze Stream Error]', err);
    sendEventToRes('error', { message: err.message || 'Error streaming video analysis' });
    clearInterval(pingTimer);
    res.end();
  }
});

// Explicitly stop a streaming pipeline session
app.post('/api/analyze/stop', (req, res) => {
  const { videoId } = req.body;
  if (videoId && activeSessions.has(videoId)) {
    const session = activeSessions.get(videoId);
    session.isStopped = true;
    console.log(`[Cliper Stream] Session explicitly stopped by client for video: ${videoId}`);
  }
  res.json({ success: true, message: 'Pipeline session stopped' });
});

// Clear cached clips for a specific segment if user wants them removed from disk
app.post('/api/clips/clear-segment', (req, res) => {
  const { videoId, segmentIndex } = req.body;
  if (!videoId || segmentIndex === undefined) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  const cacheKey = `${videoId}_seg_${segmentIndex}`;
  if (segmentClipsCache.has(cacheKey)) {
    const clips = segmentClipsCache.get(cacheKey) || [];
    for (const clip of clips) {
      if (clip.clipId) {
        const filePath = path.join(CLIPS_DIR, `${clip.clipId}.mp4`);
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch {}
        }
      }
    }
    segmentClipsCache.delete(cacheKey);
    console.log(`[Cliper Cache] Cleared disk files for ${cacheKey}`);
  }
  res.json({ success: true, message: `Cleared Session ${segmentIndex + 1} clips from disk` });
});

// Analyze YouTube video and auto-cut ALL variable-length highlight clips
app.post('/api/analyze', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Please provide a valid YouTube URL or Video ID' });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: 'Could not parse a valid YouTube Video ID from the link' });
  }

  try {
    console.log(`[Cliper] Analyzing YouTube Video: ${videoId}`);
    const videoData = await fetchYouTubeData(videoId);
    const analysis = analyzeClips(videoData);

    const allClips = analysis.clips;
    console.log(`[Cliper] Found ${allClips.length} highlight moments for ${videoId}`);

    // Fast, snappy delivery: Pre-cut top 2 clips so user gets immediate playback in ~4s
    const priorityBatch = allClips.slice(0, 2);
    const backgroundBatch = allClips.slice(2);

    console.log(`[Cliper] Cutting priority batch (${priorityBatch.length} clips)...`);
    const renderedPriority = await cutClipsBatch(videoId, priorityBatch, 2);

    // Prepare response with all clips
    const fullClipsList = [
      ...renderedPriority,
      ...backgroundBatch.map(c => {
        const clipId = `clip_${videoId}_${c.startTime}_${c.endTime}`;
        const filename = `${clipId}.mp4`;
        const ready = isClipReady(clipId);
        return {
          ...c,
          ready,
          clipId,
          streamUrl: `/api/clip/stream/${filename}`,
          downloadUrl: `/api/clip/download/${filename}?title=${encodeURIComponent(c.title)}`
        };
      })
    ];

    // Trigger remaining clips in background queue so they are ready one by one
    if (backgroundBatch.length > 0) {
      setTimeout(() => {
        console.log(`[Cliper Background Queue] Processing ${backgroundBatch.length} remaining clips...`);
        cutClipsBatch(videoId, backgroundBatch, 2).catch(e =>
          console.error('[Cliper Background Queue Error]:', e.message)
        );
      }, 50);
    }

    return res.json({
      success: true,
      video: {
        id: videoData.videoId,
        title: videoData.title,
        author: videoData.author,
        duration: videoData.duration,
        viewCount: videoData.viewCount,
        isLive: videoData.isLive,
        startTimestamp: videoData.startTimestamp,
        thumbnail: videoData.thumbnail,
        maxResThumbnail: videoData.maxResThumbnail
      },
      analysis: {
        hasHeatmap: analysis.hasHeatmap,
        dataPointsCount: analysis.dataPointsCount,
        heatmap: analysis.heatmap,
        clips: fullClipsList,
        isLiveStream: Boolean(analysis.isLiveStream || videoData.isLive)
      }
    });
  } catch (err) {
    console.error('[Cliper Error]', err);
    return res.status(500).json({
      error: err.message || 'Failed to analyze video and cut clips. Please verify the URL.'
    });
  }
});

// Check if a background clip has finished rendering
app.get('/api/clip/check/:clipId', (req, res) => {
  const { clipId } = req.params;
  const ready = isClipReady(clipId);
  res.json({
    clipId,
    ready,
    streamUrl: `/api/clip/stream/${clipId}.mp4`,
    downloadUrl: `/api/clip/download/${clipId}.mp4`
  });
});

// Generate / cut a single standalone MP4 clip on-demand
app.post('/api/clip/generate', async (req, res) => {
  const { videoId, startTime, endTime, title } = req.body;
  if (!videoId || startTime === undefined || endTime === undefined) {
    return res.status(400).json({ error: 'Missing required clip parameters' });
  }

  try {
    const result = await renderClip({ videoId, startTime, endTime, title });
    return res.json(result);
  } catch (err) {
    console.error('[Cliper Generate Error]', err);
    return res.status(500).json({ error: err.message || 'Failed to cut video clip' });
  }
});

// Stream standalone MP4 video for HTML5 <video> player with byte ranges
app.get('/api/clip/stream/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(CLIPS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Clip file not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4'
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Direct download endpoint with friendly filename
app.get('/api/clip/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(CLIPS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Clip file not found' });
  }

  const downloadName = (req.query.title ? `${req.query.title}.mp4` : filename)
    .replace(/[^a-zA-Z0-9_\-\. ]/g, '_');

  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('Content-Type', 'video/mp4');
  fs.createReadStream(filePath).pipe(res);
});

// Serve frontend build if dist exists
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).send('Cliper API server is running. Start the frontend with npm run dev:client');
    }
  });
});

app.listen(PORT, () => {
  console.log(`[Cliper Server] Running on http://localhost:${PORT}`);
});
