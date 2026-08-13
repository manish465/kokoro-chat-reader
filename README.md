# Kokoro TTS Companion

A lightweight Chrome Extension that adds intuitive **Text-to-Speech (TTS)** controls to modern AI chat web interfaces. Read AI-generated responses out loud with full playback and custom controls—completely on demand.

---

## Features

- **Inline Read Buttons:** Automatically appends a `▶ Read` button to every assistant response on page load and during live streaming.
- **On-Demand Control Bar:** The persistent audio bar stays hidden on page load and only appears when you explicitly click a read button.
- **Full Audio Controls:**
    - Play / Pause / Resume
    - Rewind & Fast Forward (10-second skip)
    - Sequential Navigation (Jump to Next / Previous chat responses)
    - Dynamic Progress Seek Bar & Real-time Timer
- **Response Quick-Jump:** Dropdown selector to jump directly to any response in the chat thread.
- **Code Skipping Filter:** Toggle option to skip reading code blocks (`<pre>`, `<code>`) so you stay focused on explanations rather than raw syntax.
- **Variable Playback Speed:** Choose speeds ranging from `0.8x` to `1.5x`.
- **Movable & Compact UI:** Drag-and-drop the control bar anywhere on your screen or collapse it into mini mode.

---

## Installation

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click **Load unpacked** and select the root directory containing your extension files (`manifest.json`, `content.js`, etc.).

---

## How It Works

1. **Browse AI Web Apps:** Open any supported chat page (ChatGPT, Claude, DeepSeek, etc.).
2. **Click to Read:** Look for the inline `▶ Read #X` button at the top-left of any response.
3. **Control Audio:** Once clicked, the floating player bar will slide into view, allowing you to control playback speed, seek through the audio, or skip code snippets.
