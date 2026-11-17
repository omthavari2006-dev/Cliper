import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BIN_DIR = path.join(__dirname, '..', 'bin');
const CLIPS_DIR = path.join(__dirname, '..', 'clips');
const localYtdlp = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const YTDLP_PATH = fs.existsSync(localYtdlp) ? localYtdlp : 'yt-dlp';

// Ensure clips directory exists
if (!fs.existsSync(CLIPS_DIR)) {
  fs.mkdirSync(CLIPS_DIR, { recursive: true });
}

export function formatHms(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function isClipReady(clipId) {
  const filename = `${clipId}.mp4`;
  const outputPath = path.join(CLIPS_DIR, filename);
  const isWriting = fs.existsSync(`${outputPath}.part`) || fs.existsSync(`${outputPath}.faststart.mp4`);
  return !isWriting && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10000;
}

/**
 * Fast direct-stream remux to guarantee 100% browser-compatible MP4 container with faststart moov atom
 */
export async function ensureBrowserFaststartMp4(filePath) {
  const FFMPEG_PATH = fs.existsSync(path.join(BIN_DIR, 'ffmpeg.exe'))
    ? path.join(BIN_DIR, 'ffmpeg.exe')
    : 'ffmpeg';

  const tempPath = filePath + '.faststart.mp4';
  return new Promise((resolve) => {
    const args = [
      '-y',
      '-i', filePath,
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-movflags', '+faststart',
      tempPath
    ];

    const proc = spawn(FFMPEG_PATH, args, { windowsHide: true });
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(tempPath) && fs.statSync(tempPath).size > 1000) {
        try {
          fs.unlinkSync(filePath);
          fs.renameSync(tempPath, filePath);
          resolve(true);
        } catch {
          resolve(false);
        }
      } else {
        if (fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch {}
        }
        resolve(false);
      }
    });
    proc.on('error', () => resolve(false));
  });
}

const pendingRenders = new Map();

/**
 * Cuts a real, standalone MP4 clip from YouTube using yt-dlp + ffmpeg
 */
export async function renderClip({ videoId, startTime, endTime, title = 'clip' }) {
  const startSec = Math.max(0, Math.floor(startTime));
  const endSec = Math.max(startSec + 5, Math.floor(endTime));
  const duration = endSec - startSec;

  const clipId = `clip_${videoId}_${startSec}_${endSec}`;
  const filename = `${clipId}.mp4`;
  const outputPath = path.join(CLIPS_DIR, filename);

  // Return cached clip if already rendered
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10000) {
    console.log(`[Cliper Cache Hit] Returning existing clip: ${filename}`);
    return {
      success: true,
      clipId,
      filename,
      duration,
      outputPath,
      streamUrl: `/api/clip/stream/${filename}`,
      downloadUrl: `/api/clip/download/${filename}?title=${encodeURIComponent(title)}`,
      cached: true
    };
  }

  // Deduplicate in-flight render calls for the exact same clip
  if (pendingRenders.has(clipId)) {
    console.log(`[Cliper In-Flight] Joining ongoing render for: ${filename}`);
    return pendingRenders.get(clipId);
  }

  const startHms = formatHms(startSec);
  const endHms = formatHms(endSec);
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  console.log(`[Cliper Render] Generating cut clip: ${startHms} to ${endHms} (${duration}s)`);

  const args = [
    ...(fs.existsSync(BIN_DIR) ? ['--ffmpeg-location', BIN_DIR] : []),
    '--js-runtimes', 'node',
    // Maximum quality possible: 1080p/4K AVC1/H.264 + AAC audio or best available merged into MP4
    '-f', 'bestvideo[vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
    '--merge-output-format', 'mp4',
    '--download-sections', `*${startHms}-${endHms}`,
    '--no-playlist',
    '--no-warnings',
    '-o', outputPath,
    videoUrl
  ];

  const renderPromise = new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, args, {
      windowsHide: true
    });

    let stdoutData = '';
    let stderrData = '';
    let isDone = false;

    // 90-second safety watchdog prevents hanging processes from blocking the pipeline
    const timeout = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        try { proc.kill('SIGKILL'); } catch {}
        reject(new Error(`Clip render timed out after 90 seconds (${filename})`));
      }
    }, 90000);

    proc.stdout.on('data', (d) => {
      stdoutData += d.toString();
    });

    proc.stderr.on('data', (d) => {
      stderrData += d.toString();
    });

    proc.on('close', async (code) => {
      if (isDone) return;
      isDone = true;
      clearTimeout(timeout);

      if (code === 0 && fs.existsSync(outputPath)) {
        // Fast direct bitstream copy into ISOBMFF MP4 with moov atom at beginning
        await ensureBrowserFaststartMp4(outputPath);
        console.log(`[Cliper Render Success] Created browser-ready MP4: ${filename}`);
        resolve({
          success: true,
          clipId,
          filename,
          duration,
          outputPath,
          streamUrl: `/api/clip/stream/${filename}`,
          downloadUrl: `/api/clip/download/${filename}?title=${encodeURIComponent(title)}`,
          cached: false
        });
      } else {
        console.error(`[Cliper Render Error] Exit code ${code}:`, stderrData || stdoutData);
        reject(new Error(`Failed to generate video clip: ${stderrData || stdoutData || 'Unknown error'}`));
      }
    });

    proc.on('error', (err) => {
      if (isDone) return;
      isDone = true;
      clearTimeout(timeout);
      console.error('[Cliper Spawn Error]:', err);
      reject(err);
    });
  });

  pendingRenders.set(clipId, renderPromise);
  try {
    return await renderPromise;
  } finally {
    pendingRenders.delete(clipId);
  }
}

/**
 * Cuts clips with concurrency control (2 workers at a time)
 */
export async function cutClipsBatch(videoId, clips, concurrency = 2) {
  const results = new Array(clips.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < clips.length) {
      const idx = currentIndex++;
      const c = clips[idx];
      try {
        const rendered = await renderClip({
          videoId,
          startTime: c.startTime,
          endTime: c.endTime,
          title: c.title
        });
        results[idx] = {
          ...c,
          ready: true,
          streamUrl: rendered.streamUrl,
          downloadUrl: rendered.downloadUrl,
          clipId: rendered.clipId
        };
      } catch (err) {
        console.error(`[Cliper Batch Cut Error] Clip ${c.id}:`, err.message);
        results[idx] = {
          ...c,
          ready: false,
          error: err.message
        };
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, clips.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}
