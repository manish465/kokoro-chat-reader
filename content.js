// --- State Management ---
let currentChatElement = null;
let fullTextWords = [];
let textChunks = [];
let currentChunkIndex = 0;
let currentWordIndex = 0;

let playerState = "IDLE"; // 'IDLE' | 'LOADING' | 'PLAYING' | 'PAUSED'
let controlBar = null;

// Periodically look for chat bubbles to append inline play buttons
setInterval(() => {
    injectInlinePlayButtons();
}, 1500);

function injectInlinePlayButtons() {
    const chats = getAllChatBubbles();
    chats.forEach((chat, index) => {
        if (chat.querySelector(".kokoro-inline-play-btn")) return;

        const btn = document.createElement("div");
        btn.className = "kokoro-inline-play-btn";
        btn.innerHTML = `▶ Read Response #${index + 1}`;
        btn.onclick = (e) => {
            e.stopPropagation();
            injectControlBar();
            speakFullResponse(chat);
        };

        chat.insertBefore(btn, chat.firstChild);
    });
}

// Inject Floating Control Bar
function injectControlBar() {
    if (document.getElementById("kokoro-control-bar")) return;

    controlBar = document.createElement("div");
    controlBar.id = "kokoro-control-bar";
    controlBar.innerHTML = `
    <div class="kokoro-now-playing" id="kk-np-box">
      <div class="kokoro-np-header">
        <div class="kokoro-now-playing-text" id="kk-np-text">Select response...</div>
        <span class="kokoro-dropdown-arrow">▼</span>
      </div>
      <div class="kokoro-response-dropdown" id="kk-dropdown"></div>
    </div>
    <div class="kokoro-top-row">
      <div class="kokoro-drag-handle" id="kk-drag" title="Drag to move">
        <svg width="12" height="16" viewBox="0 0 12 18" fill="currentColor">
          <circle cx="4" cy="4" r="1.5"/><circle cx="8" cy="4" r="1.5"/>
          <circle cx="4" cy="9" r="1.5"/><circle cx="8" cy="9" r="1.5"/>
          <circle cx="4" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
        </svg>
      </div>
      <button class="kokoro-btn" id="kk-prev" title="Previous Response">⏮</button>
      <button class="kokoro-btn" id="kk-rw" title="Rewind">⏪</button>
      <button class="kokoro-btn kokoro-btn-primary" id="kk-play" title="Play/Pause">▶</button>
      <button class="kokoro-btn" id="kk-ff" title="Forward">⏩</button>
      <button class="kokoro-btn" id="kk-next" title="Next Response">⏭</button>
      <select class="kokoro-speed-select" id="kk-speed">
        <option value="0.8">0.8x</option>
        <option value="1.0" selected>1.0x</option>
        <option value="1.25">1.25x</option>
        <option value="1.5">1.5x</option>
      </select>
    </div>
    <div class="kokoro-progress-container">
      <span id="kk-time-cur">0:00</span>
      <input type="range" class="kokoro-seek-bar" id="kk-seekbar" value="0" min="0" max="100" step="1" />
      <span id="kk-time-tot">0:00</span>
    </div>
  `;
    document.body.appendChild(controlBar);

    // Bind Events
    document.getElementById("kk-play").onclick = togglePlayPause;
    document.getElementById("kk-rw").onclick = () => seekRelative(-10);
    document.getElementById("kk-ff").onclick = () => seekRelative(10);
    document.getElementById("kk-next").onclick = readNextChat;
    document.getElementById("kk-prev").onclick = readPreviousChat;

    const npBox = document.getElementById("kk-np-box");
    npBox.onclick = toggleDropdown;

    const seekBar = document.getElementById("kk-seekbar");
    seekBar.oninput = handleSeekBarInput;

    makeDraggable(controlBar, document.getElementById("kk-drag"));
}

// Toggle & Populate Now Playing Dropdown List
function toggleDropdown(e) {
    e.stopPropagation();
    const dropdown = document.getElementById("kk-dropdown");
    const isVisible = dropdown.classList.contains("show");

    if (isVisible) {
        dropdown.classList.remove("show");
        return;
    }

    const chats = getAllChatBubbles();
    dropdown.innerHTML = "";

    chats.forEach((chat, index) => {
        const snippet =
            chat.innerText
                .replace(/▶ Read Response #\d+/, "")
                .trim()
                .slice(0, 45) + "...";
        const item = document.createElement("div");
        item.className =
            "kokoro-dropdown-item" +
            (chat === currentChatElement ? " active" : "");
        item.innerText = `${index + 1}. ${snippet}`;

        item.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.remove("show");
            speakFullResponse(chat);
        };

        dropdown.appendChild(item);
    });

    dropdown.classList.add("show");
}

// Draggable Engine
function makeDraggable(element, handle) {
    let offsetX = 0,
        offsetY = 0;

    handle.onmousedown = (e) => {
        e.preventDefault();
        const rect = element.getBoundingClientRect();

        element.style.top = rect.top + "px";
        element.style.left = rect.left + "px";
        element.style.bottom = "auto";
        element.style.right = "auto";

        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        document.onmousemove = (e) => {
            e.preventDefault();
            element.style.left = e.clientX - offsetX + "px";
            element.style.top = e.clientY - offsetY + "px";
        };

        document.onmouseup = () => {
            document.onmousemove = null;
            document.onmouseup = null;
        };
    };
}

// Prepare & Chunk Text (Clean, standard text retrieval without spans)
function prepareTextChunks(element) {
    currentChatElement = element;

    // Clone element to strip out inline play button text
    const clone = element.cloneNode(true);
    const inlineBtn = clone.querySelector(".kokoro-inline-play-btn");
    if (inlineBtn) inlineBtn.remove();

    const cleanText = clone.innerText.trim();
    fullTextWords = cleanText.split(/\s+/);

    // Update Now Playing Title Snippet
    const snippet = cleanText.slice(0, 35) + "...";
    document.getElementById("kk-np-text").innerText = snippet;

    // Highlight Active Inline Button State
    document
        .querySelectorAll(".kokoro-inline-play-btn")
        .forEach((btn) => btn.classList.remove("active"));
    const activeBtn = element.querySelector(".kokoro-inline-play-btn");
    if (activeBtn) activeBtn.classList.add("active");

    // Sentence Chunking
    textChunks = cleanText.match(/[^.!?]+[.!?]+|\S+/g) || [cleanText];
    updateTotalTimeDisplay();
}

function speakFullResponse(chatElement) {
    window.speechSynthesis.cancel();
    setLoadingState(true);

    setTimeout(() => {
        prepareTextChunks(chatElement);
        currentChunkIndex = 0;
        currentWordIndex = 0;
        playChunk(0);
    }, 50);
}

function playChunk(index) {
    if (index >= textChunks.length) {
        setPlayerState("IDLE");
        updateProgressUI(100);
        return;
    }

    currentChunkIndex = index;
    const chunkText = textChunks[index];
    const rate = parseFloat(document.getElementById("kk-speed").value || 1.0);

    const utterance = new SpeechSynthesisUtterance(chunkText);
    utterance.rate = rate;

    utterance.onstart = () => {
        setLoadingState(false);
        setPlayerState("PLAYING");
    };

    utterance.onboundary = (event) => {
        if (event.name === "word") {
            currentWordIndex += 1;
            const pct = Math.floor(
                (currentWordIndex / Math.max(1, fullTextWords.length)) * 100,
            );
            updateProgressUI(pct);
        }
    };

    utterance.onend = () => {
        if (playerState === "PLAYING") {
            playChunk(index + 1);
        }
    };

    window.speechSynthesis.speak(utterance);
}

// States Management
function togglePlayPause() {
    if (playerState === "PLAYING") {
        window.speechSynthesis.pause();
        setPlayerState("PAUSED");
    } else if (playerState === "PAUSED") {
        window.speechSynthesis.resume();
        setPlayerState("PLAYING");
    } else if (currentChatElement) {
        speakFullResponse(currentChatElement);
    }
}

function setLoadingState(isLoading) {
    const playBtn = document.getElementById("kk-play");
    if (!playBtn) return;

    if (isLoading) {
        playerState = "LOADING";
        playBtn.innerHTML = '<div class="kokoro-spinner"></div>';
    }
}

function setPlayerState(state) {
    playerState = state;
    const playBtn = document.getElementById("kk-play");
    if (!playBtn) return;

    if (state === "PLAYING") {
        playBtn.innerText = "⏸";
    } else if (state === "PAUSED" || state === "IDLE") {
        playBtn.innerText = "▶";
    }
}

// Seeking & Progress Bar
function seekRelative(offsetWords) {
    if (!fullTextWords.length) return;
    const targetIndex = Math.max(
        0,
        Math.min(fullTextWords.length - 1, currentWordIndex + offsetWords),
    );
    seekToWordIndex(targetIndex);
}

function handleSeekBarInput(e) {
    if (!fullTextWords.length) return;
    const pct = parseFloat(e.target.value);
    const targetIndex = Math.floor((pct / 100) * (fullTextWords.length - 1));
    seekToWordIndex(targetIndex);
}

function seekToWordIndex(targetIndex) {
    currentWordIndex = targetIndex;
    const chunkTarget = Math.floor(
        (targetIndex / fullTextWords.length) * textChunks.length,
    );

    window.speechSynthesis.cancel();
    setLoadingState(true);
    setTimeout(() => {
        playChunk(chunkTarget);
    }, 50);
}

function updateProgressUI(pct) {
    const seekBar = document.getElementById("kk-seekbar");
    const timeCur = document.getElementById("kk-time-cur");
    if (seekBar) seekBar.value = pct;

    const totalWords = fullTextWords.length || 1;
    const totalSecs = Math.floor(totalWords / 2.5);
    const currentSecs = Math.floor((pct / 100) * totalSecs);

    if (timeCur) timeCur.innerText = formatTime(currentSecs);
}

function updateTotalTimeDisplay() {
    const timeTot = document.getElementById("kk-time-tot");
    const totalWords = fullTextWords.length || 0;
    const totalSecs = Math.floor(totalWords / 2.5);
    if (timeTot) timeTot.innerText = formatTime(totalSecs);
}

function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function getAllChatBubbles() {
    return Array.from(
        document.querySelectorAll(
            '[data-message-author-role="assistant"], .font-claude-message, .ds-markdown',
        ),
    );
}

function readNextChat() {
    const chats = getAllChatBubbles();
    const idx = chats.indexOf(currentChatElement);
    if (idx < chats.length - 1) speakFullResponse(chats[idx + 1]);
}

function readPreviousChat() {
    const chats = getAllChatBubbles();
    const idx = chats.indexOf(currentChatElement);
    if (idx > 0) speakFullResponse(chats[idx - 1]);
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "READ_CURRENT_CHAT") {
        injectControlBar();
        const chats = getAllChatBubbles();
        if (chats.length) speakFullResponse(chats[chats.length - 1]);
    }
});
