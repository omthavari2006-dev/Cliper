import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractVideoId, fetchYouTubeData, analyzeClips } from './analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Sample videos for quick 1-click testing
const SAMPLES = [
  {
    name: '🎵 Rick Astley - Never Gonna Give You Up',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    type: 'Music Video'
  },
  {
    name: '🎙️ Lex Fridman Podcast (Longform)',
    url: 'https://www.youtube.com/watch?v=jvqFAi7vkBc',
    type: 'Podcast'
  },
  {
    name: '🎮 MrBeast Challenge',
    url: 'https://www.youtube.com/watch?v=0e3GPea1Tyg',
    type: 'High-Energy Video'
  }
];

app.get('/api/samples', (req, res) => {
  res.json({ samples: SAMPLES });
});

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

    return res.json({
      success: true,
      video: {
        id: videoData.videoId,
        title: videoData.title,
        author: videoData.author,
        duration: videoData.duration,
        viewCount: videoData.viewCount,
        isLive: videoData.isLive,
        thumbnail: videoData.thumbnail,
        maxResThumbnail: videoData.maxResThumbnail
      },
      analysis: {
        hasHeatmap: analysis.hasHeatmap,
        dataPointsCount: analysis.dataPointsCount,
        heatmap: analysis.heatmap,
        clips: analysis.clips
      }
    });
  } catch (err) {
    console.error('[Cliper Error]', err);
    return res.status(500).json({
      error: err.message || 'Failed to analyze video. Please verify the URL or try again.'
    });
  }
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
