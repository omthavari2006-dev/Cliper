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

// Progressive Streaming Analysis & Cutting Endpoint
// Streams video details immediately, then processes hour-by-hour (or segment-by-segment),
// cutting and streaming clips one-by-one so the user gets clips in real-time as analysis continues!
app.get('/api/analyze/stream', async (req, res) => {
  const { url } = req.query;
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

  let isClientConnected = true;
  req.on('close', () => {
    isClientConnected = false;
    console.log(`[Cliper Stream] Client disconnected for video: ${videoId}`);
  });

  const sendEvent = (event, data) => {
    if (!isClientConnected) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent('status', { message: 'Connecting to YouTube and extracting stream timeline...' });
    const videoData = await fetchYouTubeData(videoId);

    sendEvent('video', {
      id: videoData.videoId,
      title: videoData.title,
      author: videoData.author,
      duration: videoData.duration,
      viewCount: videoData.viewCount,
      isLive: videoData.isLive,
      startTimestamp: videoData.startTimestamp,
      thumbnail: videoData.thumbnail,
      maxResThumbnail: videoData.maxResThumbnail,
      hasHeatmap: (videoData.rawMarkers || []).length > 5
    });

    const totalDuration = videoData.duration > 0 ? videoData.duration : 1800;

    // Segment size: 1 hour (3600s), or ~20m chunks if video <= 1h
    const chunkSize = totalDuration <= 1800 ? totalDuration : (totalDuration <= 5400 ? 1800 : 3600);
    const totalSegments = Math.max(1, Math.ceil(totalDuration / chunkSize));

    sendEvent('status', {
      message: `Video is ${Math.round(totalDuration / 60)} minutes long (${totalSegments} timeline segment${totalSegments > 1 ? 's' : ''}). Starting progressive live clipping...`,
      totalSegments
    });

    let overallRank = 1;

    for (let segIdx = 0; segIdx < totalSegments; segIdx++) {
      if (!isClientConnected) break;

      const segStart = segIdx * chunkSize;
      const segEnd = Math.min(totalDuration, (segIdx + 1) * chunkSize);
      const segHourNum = segIdx + 1;

      sendEvent('stage', {
        segmentIndex: segIdx,
        totalSegments,
        hourNumber: segHourNum,
        startTimeSec: segStart,
        endTimeSec: segEnd,
        message: `Analyzing Hour ${segHourNum} (${formatHms(segStart)} to ${formatHms(segEnd)})... Searching for top jokes, action, and reckless highlights`
      });

      // Analyze this specific hour/segment
      const segMoments = analyzeSegment({
        videoData,
        segStart,
        segEnd,
        segIndex: segIdx,
        totalSegments
      });

      sendEvent('status', {
        message: `Hour ${segHourNum}: Found ${segMoments.length} highlight moments. Cutting 1080p clips now...`,
        segmentIndex: segIdx,
        hourNumber: segHourNum
      });

      // Cut clips one by one and stream each ready clip live as soon as it renders!
      for (const moment of segMoments) {
        if (!isClientConnected) break;

        sendEvent('clipping_progress', {
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

          // Push the ready clip immediately to the client!
          sendEvent('clip_ready', readyClip);
        } catch (cutErr) {
          console.error(`[Streaming Cutter Error]`, cutErr.message);
        }
      }

      sendEvent('segment_complete', {
        segmentIndex: segIdx,
        hourNumber: segHourNum,
        message: `Completed Hour ${segHourNum}! Moving to Hour ${segHourNum + 1}...`
      });
    }

    sendEvent('complete', {
      totalClips: overallRank - 1,
      message: 'All timeline hours analyzed and clips ready to watch/download!'
    });

    res.end();
  } catch (err) {
    console.error('[Analyze Stream Error]', err);
    sendEvent('error', { message: err.message || 'Error streaming video analysis' });
    res.end();
  }
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
