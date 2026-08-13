// --- State Management ---
let currentChatElement = null;
let textChunks = [];
let currentChunkIndex = 0;

let playerState = "IDLE"; // 'IDLE' | 'LOADING' | 'PLAYING' | 'PAUSED'
let controlBar = null;

// Progress & Timer Tracking
let timerInterval = null;
let currentElapsedSecs = 0;
let estimatedTotalSecs = 0;

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
      <button class="kokoro-btn" id="kk-rw" title="-10s Rewind">⏪</button>
      <button class="kokoro-btn kokoro-btn-primary" id="kk-play" title="Play/Pause">▶</button>
      <button class="kokoro-btn" id="kk-ff" title="+10s Forward">⏩</button>
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
      <input type="range" class="kokoro-seek-bar" id="kk-seekbar" value="0" min="0" max="100" step="0.1" />
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

// Toggle & Populate Dropdown
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

// Prepare & Chunk Text
function prepareTextChunks(element) {
    currentChatElement = element;

    const clone = element.cloneNode(true);
    const inlineBtn = clone.querySelector(".kokoro-inline-play-btn");
    if (inlineBtn) inlineBtn.remove();

    const cleanText = clone.innerText.trim();
    const fullTextWords = cleanText.split(/\s+/);

    // Title Snippet
    const snippet = cleanText.slice(0, 35) + "...";
    document.getElementById("kk-np-text").innerText = snippet;

    // Highlight Active Inline Button
    document
        .querySelectorAll(".kokoro-inline-play-btn")
        .forEach((btn) => btn.classList.remove("active"));
    const activeBtn = element.querySelector(".kokoro-inline-play-btn");
    if (activeBtn) activeBtn.classList.add("active");

    // Estimate total time dynamically based on word count & playback speed
    const speed = parseFloat(document.getElementById("kk-speed").value || 1.0);
    estimatedTotalSecs = Math.max(
        1,
        Math.round(fullTextWords.length / 3 / speed),
    );

    const timeTot = document.getElementById("kk-time-tot");
    if (timeTot) timeTot.innerText = formatTime(estimatedTotalSecs);

    // Sentence Chunking
    textChunks = cleanText.match(/[^.!?]+[.!?]+|\S+/g) || [cleanText];
}

function speakFullResponse(chatElement) {
    stopTimer();
    window.speechSynthesis.cancel();
    setLoadingState(true);

    setTimeout(() => {
        prepareTextChunks(chatElement);
        currentChunkIndex = 0;
        currentElapsedSecs = 0;
        playChunk(0);
    }, 50);
}

function playChunk(index) {
    if (index >= textChunks.length) {
        stopTimer();
        setPlayerState("IDLE");
        currentElapsedSecs = estimatedTotalSecs;
        updateProgressUI();
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
        startTimer();
    };

    utterance.onend = () => {
        if (playerState === "PLAYING") {
            playChunk(index + 1);
        }
    };

    utterance.onerror = () => {
        if (playerState === "PLAYING") {
            playChunk(index + 1);
        }
    };

    window.speechSynthesis.speak(utterance);
}

// Timer Engine for Seek Bar and Time Display
function startTimer() {
    if (timerInterval) return;

    timerInterval = setInterval(() => {
        if (playerState === "PLAYING") {
            currentElapsedSecs += 0.1;
            if (currentElapsedSecs > estimatedTotalSecs) {
                currentElapsedSecs = estimatedTotalSecs;
            }
            updateProgressUI();
        }
    }, 100);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateProgressUI() {
    const seekBar = document.getElementById("kk-seekbar");
    const timeCur = document.getElementById("kk-time-cur");

    const pct = (currentElapsedSecs / estimatedTotalSecs) * 100;

    if (seekBar) seekBar.value = Math.min(100, pct);
    if (timeCur) timeCur.innerText = formatTime(Math.floor(currentElapsedSecs));
}

// States Management
function togglePlayPause() {
    if (playerState === "PLAYING") {
        window.speechSynthesis.pause();
        stopTimer();
        setPlayerState("PAUSED");
    } else if (playerState === "PAUSED") {
        window.speechSynthesis.resume();
        startTimer();
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

// Seeking Handling
function seekRelative(secondsOffset) {
    if (!estimatedTotalSecs) return;
    const targetTime = Math.max(
        0,
        Math.min(estimatedTotalSecs, currentElapsedSecs + secondsOffset),
    );
    seekToTime(targetTime);
}

function handleSeekBarInput(e) {
    if (!estimatedTotalSecs) return;
    const pct = parseFloat(e.target.value);
    const targetTime = (pct / 100) * estimatedTotalSecs;
    seekToTime(targetTime);
}

function seekToTime(targetTimeSecs) {
    currentElapsedSecs = targetTimeSecs;

    // Calculate corresponding chunk index based on target time ratio
    const ratio = currentElapsedSecs / estimatedTotalSecs;
    const targetChunk = Math.floor(ratio * textChunks.length);

    stopTimer();
    window.speechSynthesis.cancel();
    setLoadingState(true);
    updateProgressUI();

    setTimeout(() => {
        playChunk(Math.min(textChunks.length - 1, targetChunk));
    }, 50);
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
