import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { extractVideoId, fetchYouTubeData, analyzeClips } from './analyzer.js';
import { renderClip, cutClipsBatch, isClipReady } from './clipper.js';

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
