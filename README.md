# 🎬 Cliper - AI YouTube Heatmap & Viral Highlight Clip Generator

**Cliper** is a modern full-stack web application that takes any YouTube video or live stream link, extracts YouTube's raw **Heatseeker ("Most Replayed")** data, analyzes viewer re-watch density, and creates viral short-form clips (15s–60s) ready for YouTube Shorts, TikTok, and Instagram Reels.

---

## ✨ Features

- **🔥 Heatseeker Replay Extraction**: Directly parses YouTube's 100-slice replay intensity timeline without needing API keys or quota limits.
- **📈 Interactive Waveform Visualizer**: Smooth SVG replay graph displaying the entire video's engagement curve with scrub tooltips and seekable timestamps.
- **🎯 Dynamic Peak Windowing**: Automatically detects local climax points, calculating the hook lead-in context and reaction aftermath to frame cohesive 15–60s highlights.
- **📱 9:16 Vertical Previewer**: Switch between **16:9 Landscape**, **9:16 Vertical (Shorts/TikTok/Reels)** with ambient blur, and **1:1 Square**.
- **⚡ Instant In-Browser Playback**: Preview clips instantly via YouTube's synchronized player without waiting for multi-gigabyte video downloads.
- **🛠️ Fine-Tuning Controls**: Nudge start and end timestamps (`-5s`, `-1s`, `+1s`, `+5s`) with real-time player preview.
- **🚀 1-Click HD Export**: Generates ultra-fast `yt-dlp` commands that download *only* the specific highlight seconds at 1080p/4K without downloading the whole video, plus formatted chapter timestamps.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
- **Frontend**: `http://localhost:5173`
- **Backend API**: `http://localhost:3001`

### 3. Or Run Production Mode
```bash
npm run build
npm start
```
Access the application at `http://localhost:3001`.

---

## 📁 Project Structure

```
Cliper/
├── server/
│   ├── index.js          # Express API server (Static serving & endpoints)
│   └── analyzer.js       # Heatseeker parsing & peak detection engine
├── src/
│   ├── components/
│   │   ├── WaveformChart.jsx   # Interactive SVG replay waveform
│   │   ├── ClipPlayer.jsx      # Video player with 16:9 & 9:16 framing
│   │   ├── ClipCard.jsx        # Ranked clip cards with viral scores
│   │   └── ExportModal.jsx     # Export dialog (yt-dlp command, chapters)
│   ├── App.jsx           # Main Dashboard and state management
│   ├── index.css         # Tailwind & glassmorphism styling
│   └── main.jsx          # React entrypoint
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## 🛠️ How It Works Under the Hood

1. **Watch Page Fetching:** The backend queries YouTube using modern browser headers to inspect `macroMarkersListEntity` (`MARKER_TYPE_HEATMAP`).
2. **Local Peak Detection:** The algorithm scans the 100 intensity values to find local maxima while filtering initial video watch drop-offs.
3. **Context Windowing:** Expands around the peak (45% slope threshold) to capture both the context before and the reaction after the peak.
4. **Live Stream Fallback:** For newly broadcast streams or videos where YouTube is still generating the heatmap, Cliper detects chapters or falls back to golden-ratio highlight segments.
