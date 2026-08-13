// --- Global Player State ---
let currentChatElement = null;
let wordSpans = [];
let currentWordIndex = 0;

let textChunks = [];
let chunkStartWordIndices = [];
let currentChunkIndex = 0;

let playerState = "IDLE"; // 'IDLE' | 'LOADING' | 'PLAYING' | 'PAUSED'
let controlBar = null;

// Inject Floating Glass Player Bar
function injectControlBar() {
    if (document.getElementById("kokoro-control-bar")) return;

    controlBar = document.createElement("div");
    controlBar.id = "kokoro-control-bar";
    controlBar.innerHTML = `
    <div class="kokoro-now-playing">
      <div class="kokoro-now-playing-text" id="kk-np-text">Select a chat to play...</div>
      <div class="kokoro-eq" id="kk-eq" style="display: none;">
        <div class="kokoro-eq-bar"></div>
        <div class="kokoro-eq-bar"></div>
        <div class="kokoro-eq-bar"></div>
      </div>
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

    // Bind Control Events
    document.getElementById("kk-play").onclick = togglePlayPause;
    document.getElementById("kk-rw").onclick = () => seekRelative(-10);
    document.getElementById("kk-ff").onclick = () => seekRelative(10);
    document.getElementById("kk-next").onclick = readNextChat;
    document.getElementById("kk-prev").onclick = readPreviousChat;

    const seekBar = document.getElementById("kk-seekbar");
    seekBar.oninput = handleSeekBarInput;

    makeDraggable(controlBar, document.getElementById("kk-drag"));
}

// Draggable Handler
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

// Process Response Text
function prepareFullResponse(element) {
    clearHighlights();
    currentChatElement = element;
    wordSpans = [];

    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false,
    );
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
        if (node.nodeValue.trim().length > 0) textNodes.push(node);
    }

    textNodes.forEach((textNode) => {
        const parent = textNode.parentNode;
        if (
            parent.tagName === "SPAN" &&
            parent.classList.contains("kokoro-word-span")
        )
            return;

        const words = textNode.nodeValue.split(/(\s+)/);
        const fragment = document.createDocumentFragment();

        words.forEach((word) => {
            if (word.trim().length > 0) {
                const span = document.createElement("span");
                span.className = "kokoro-word-span";
                span.innerText = word;
                fragment.appendChild(span);
                wordSpans.push(span);
            } else {
                fragment.appendChild(document.createTextNode(word));
            }
        });

        parent.replaceChild(fragment, textNode);
    });

    // Update Now Playing Title
    const snippet = element.innerText.slice(0, 35) + "...";
    document.getElementById("kk-np-text").innerText = snippet;

    buildSentenceChunks();
}

function buildSentenceChunks() {
    textChunks = [];
    chunkStartWordIndices = [];

    let currentChunkWords = [];
    let currentLength = 0;

    wordSpans.forEach((span, index) => {
        const word = span.innerText;
        currentChunkWords.push(word);
        currentLength += word.length + 1;

        const isSentenceEnd = /[.!?]$/.test(word.trim());
        if ((isSentenceEnd && currentLength > 80) || currentLength > 200) {
            if (textChunks.length === 0) chunkStartWordIndices.push(0);
            textChunks.push(currentChunkWords.join(" "));

            currentChunkWords = [];
            currentLength = 0;
            if (index + 1 < wordSpans.length) {
                chunkStartWordIndices.push(index + 1);
            }
        }
    });

    if (currentChunkWords.length > 0) {
        if (textChunks.length === 0) chunkStartWordIndices.push(0);
        textChunks.push(currentChunkWords.join(" "));
    }

    updateTotalTimeDisplay();
}

function speakFullResponse(chatElement) {
    window.speechSynthesis.cancel();
    setLoadingState(true);

    setTimeout(() => {
        prepareFullResponse(chatElement);
        currentChunkIndex = 0;
        currentWordIndex = 0;
        playChunk(0);
    }, 50);
}

function playChunk(index) {
    if (index >= textChunks.length) {
        clearHighlights();
        setPlayerState("IDLE");
        updateProgressUI(100);
        return;
    }

    currentChunkIndex = index;
    const chunkText = textChunks[index];
    const rate = parseFloat(document.getElementById("kk-speed").value || 1.0);

    const utterance = new SpeechSynthesisUtterance(chunkText);
    utterance.rate = rate;

    const baseWordIndex = chunkStartWordIndices[index] || 0;

    utterance.onstart = () => {
        setLoadingState(false);
        setPlayerState("PLAYING");
    };

    utterance.onboundary = (event) => {
        if (event.name === "word") {
            highlightWordAtOffset(baseWordIndex, event.charIndex);
        }
    };

    utterance.onend = () => {
        if (playerState === "PLAYING") {
            playChunk(index + 1);
        }
    };

    window.speechSynthesis.speak(utterance);
    if (currentChatElement) {
        currentChatElement.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
        });
    }
}

// Word-Level Glowing Highlight Sync
function highlightWordAtOffset(baseIndex, charIndex) {
    clearHighlights();

    let accumulatedLength = 0;
    for (let i = baseIndex; i < wordSpans.length; i++) {
        const wordLength = wordSpans[i].innerText.length;
        if (
            charIndex >= accumulatedLength &&
            charIndex < accumulatedLength + wordLength + 1
        ) {
            currentWordIndex = i;
            wordSpans[i].classList.add("kokoro-word-highlight");
            wordSpans[i].scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });

            // Calculate progress percentage
            const progressPercent = Math.floor(
                (currentWordIndex / Math.max(1, wordSpans.length - 1)) * 100,
            );
            updateProgressUI(progressPercent);
            break;
        }
        accumulatedLength += wordLength + 1;
    }
}

function clearHighlights() {
    wordSpans.forEach((span) => span.classList.remove("kokoro-word-highlight"));
}

// Player States
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
    const eq = document.getElementById("kk-eq");

    if (!playBtn) return;

    if (state === "PLAYING") {
        playBtn.innerText = "⏸";
        if (eq) eq.style.display = "flex";
    } else if (state === "PAUSED" || state === "IDLE") {
        playBtn.innerText = "▶";
        if (eq) eq.style.display = "none";
    }
}

// Seek Engine & Progress
function seekRelative(offsetWords) {
    if (!wordSpans.length) return;
    const targetIndex = Math.max(
        0,
        Math.min(wordSpans.length - 1, currentWordIndex + offsetWords),
    );
    seekToWordIndex(targetIndex);
}

function handleSeekBarInput(e) {
    if (!wordSpans.length) return;
    const pct = parseFloat(e.target.value);
    const targetIndex = Math.floor((pct / 100) * (wordSpans.length - 1));
    seekToWordIndex(targetIndex);
}

function seekToWordIndex(targetIndex) {
    currentWordIndex = targetIndex;

    let targetChunk = 0;
    for (let i = 0; i < chunkStartWordIndices.length; i++) {
        if (targetIndex >= chunkStartWordIndices[i]) {
            targetChunk = i;
        } else {
            break;
        }
    }

    window.speechSynthesis.cancel();
    setLoadingState(true);
    setTimeout(() => {
        playChunk(targetChunk);
    }, 50);
}

function updateProgressUI(pct) {
    const seekBar = document.getElementById("kk-seekbar");
    const timeCur = document.getElementById("kk-time-cur");
    if (seekBar) seekBar.value = pct;

    const totalWords = wordSpans.length || 1;
    const totalSecs = Math.floor(totalWords / 2.5);
    const currentSecs = Math.floor((pct / 100) * totalSecs);

    if (timeCur) timeCur.innerText = formatTime(currentSecs);
}

function updateTotalTimeDisplay() {
    const timeTot = document.getElementById("kk-time-tot");
    const totalWords = wordSpans.length || 0;
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
