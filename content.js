// --- State & Settings ---
let currentChatElement = null;
let textChunks = [];
let chunkSpanGroups = []; // Stores arrays of <span> elements grouped per chunk
let currentChunkIndex = 0;

// Configuration: Set how many sentences to combine per playback chunk
const SENTENCES_PER_CHUNK = 7;

let playerState = "IDLE"; // 'IDLE' | 'LOADING' | 'PLAYING' | 'PAUSED'
let controlBar = null;

let isSkipCodeEnabled = true;
let isAutoScrollEnabled = true;

// Progress & Timer Tracking
let timerInterval = null;
let currentElapsedSecs = 0;
let estimatedTotalSecs = 0;

// Load Saved Preferences on startup
loadUserPreferences();

// Initial scan for inline Read buttons & line targeting
injectInlinePlayButtons();
setupLineSelectionListeners();
setupMutationObserver();

// Periodic backup scan
setInterval(() => {
    injectInlinePlayButtons();
}, 1500);

// Comprehensive & nested-safe chat bubble detector
function getAllChatBubbles() {
    const selectors = [
        '[data-message-author-role="assistant"]',
        ".font-claude-message",
        ".ds-markdown",
        "message-content",
        ".model-response-text",
        ".assistant-message",
    ];

    let nodes = Array.from(document.querySelectorAll(selectors.join(", ")));

    // Filter out duplicate or nested elements
    return nodes.filter((node) => {
        return !nodes.some(
            (parent) => parent !== node && parent.contains(node),
        );
    });
}

function injectInlinePlayButtons() {
    const chats = getAllChatBubbles();
    chats.forEach((chat, index) => {
        chat.classList.add("kokoro-chat-clearfix");

        if (chat.querySelector(".kokoro-inline-play-btn")) return;

        const btn = document.createElement("button");
        btn.className = "kokoro-inline-play-btn";
        btn.type = "button";
        btn.innerHTML = `▶ Read #${index + 1}`;
        btn.title = "Read this response from start";

        btn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            injectControlBar();
            speakFullResponse(chat, 0);
        };

        chat.insertBefore(btn, chat.firstChild);
    });
}

// Zero-layout-shift line targeting
function setupLineSelectionListeners() {
    document.body.addEventListener("click", (e) => {
        const target = e.target;

        if (target.classList.contains("kokoro-line-jump-btn")) {
            e.stopPropagation();
            e.preventDefault();

            const lineElem = target.closest(".kokoro-line-target");
            const chatElem = lineElem
                ? lineElem.closest(
                      '[data-message-author-role="assistant"], .font-claude-message, .ds-markdown, message-content',
                  )
                : null;

            if (lineElem && chatElem) {
                injectControlBar();
                speakFromLine(chatElem, lineElem);
            }
        }
    });

    // Attach hover targets cleanly without shifting text
    document.body.addEventListener("mouseover", (e) => {
        const blockElem = e.target.closest(
            "p, li, h1, h2, h3, h4, h5, h6, blockquote",
        );
        if (!blockElem) return;

        const chat = blockElem.closest(
            '[data-message-author-role="assistant"], .font-claude-message, .ds-markdown, message-content',
        );
        if (!chat) return;

        if (!blockElem.classList.contains("kokoro-line-target")) {
            blockElem.classList.add("kokoro-line-target");

            const jumpBtn = document.createElement("button");
            jumpBtn.className = "kokoro-line-jump-btn";
            jumpBtn.type = "button";
            jumpBtn.innerText = "📍 Start";
            jumpBtn.title = "Start reading from this section";

            blockElem.appendChild(jumpBtn);
        }
    });
}

// MutationObserver for live response streaming
function setupMutationObserver() {
    const observer = new MutationObserver(() => {
        injectInlinePlayButtons();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

// Inject Floating Control Bar ONLY on user interaction
function injectControlBar() {
    if (document.getElementById("kokoro-control-bar")) return;

    controlBar = document.createElement("div");
    controlBar.id = "kokoro-control-bar";
    controlBar.innerHTML = `
    <div class="kokoro-now-playing" id="kk-np-box">
      <div class="kokoro-np-header">
        <div class="kokoro-now-playing-text" id="kk-np-text">Select response...</div>
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
      <button class="kokoro-btn kokoro-btn-toggle ${isAutoScrollEnabled ? "active" : ""}" id="kk-scroll-toggle-mini" title="Toggle Auto Scroll">📜</button>
      <button class="kokoro-btn" id="kk-prev" title="Previous Response">⏮</button>
      <button class="kokoro-btn" id="kk-rw" title="-10s Rewind">⏪</button>
      <button class="kokoro-btn kokoro-btn-primary" id="kk-play" title="Play/Pause">▶</button>
      <button class="kokoro-btn" id="kk-ff" title="+10s Forward">⏩</button>
      <button class="kokoro-btn" id="kk-next" title="Next Response">⏭</button>
      <button class="kokoro-btn" id="kk-locate" title="Jump to active reading sentence">🎯</button>
      <button class="kokoro-btn" id="kk-mini-toggle" title="Minimize/Expand">_</button>
    </div>

    <div class="kokoro-settings-row">
      <select class="kokoro-speed-select" id="kk-speed" title="Speed">
        <option value="0.8">0.8x</option>
        <option value="1.0" selected>1.0x</option>
        <option value="1.25">1.25x</option>
        <option value="1.5">1.5x</option>
      </select>
      <button class="kokoro-btn kokoro-btn-toggle ${isSkipCodeEnabled ? "active" : ""}" id="kk-code-toggle" title="Skip Code Blocks">&lt;/&gt; Code</button>
      <button class="kokoro-btn kokoro-btn-toggle ${isAutoScrollEnabled ? "active" : ""}" id="kk-scroll-toggle" title="Toggle Auto Scroll">📜 Scroll: ${isAutoScrollEnabled ? "ON" : "OFF"}</button>
    </div>

    <div class="kokoro-progress-container">
      <span id="kk-time-cur">0:00</span>
      <input type="range" class="kokoro-seek-bar" id="kk-seekbar" value="0" min="0" max="100" step="0.1" />
      <span id="kk-time-tot">0:00</span>
    </div>
  `;
    document.body.appendChild(controlBar);

    // Restore saved position
    chrome.storage.local.get(["playerPosLeft", "playerPosTop"], (res) => {
        if (res.playerPosLeft && res.playerPosTop) {
            controlBar.style.left = res.playerPosLeft;
            controlBar.style.top = res.playerPosTop;
            controlBar.style.bottom = "auto";
            controlBar.style.right = "auto";
        }
    });

    // Bind Control Events
    document.getElementById("kk-play").onclick = togglePlayPause;
    document.getElementById("kk-rw").onclick = () => seekRelative(-10);
    document.getElementById("kk-ff").onclick = () => seekRelative(10);
    document.getElementById("kk-next").onclick = readNextChat;
    document.getElementById("kk-prev").onclick = readPreviousChat;
    document.getElementById("kk-locate").onclick = () =>
        highlightAndScrollSentence(currentChunkIndex, true);
    document.getElementById("kk-mini-toggle").onclick = toggleMiniMode;

    const speedSelect = document.getElementById("kk-speed");
    chrome.storage.local.get(["speed"], (res) => {
        if (res.speed) speedSelect.value = res.speed;
    });

    speedSelect.onchange = (e) => {
        savePreference("speed", e.target.value);
    };

    const codeToggle = document.getElementById("kk-code-toggle");
    codeToggle.onclick = () => {
        isSkipCodeEnabled = !isSkipCodeEnabled;
        codeToggle.classList.toggle("active", isSkipCodeEnabled);
        savePreference("skipCode", isSkipCodeEnabled);
    };

    const scrollToggle = document.getElementById("kk-scroll-toggle");
    const scrollToggleMini = document.getElementById("kk-scroll-toggle-mini");

    const toggleAutoScrollState = () => {
        isAutoScrollEnabled = !isAutoScrollEnabled;
        if (scrollToggle) {
            scrollToggle.classList.toggle("active", isAutoScrollEnabled);
            scrollToggle.innerText = `📜 Scroll: ${isAutoScrollEnabled ? "ON" : "OFF"}`;
        }
        if (scrollToggleMini) {
            scrollToggleMini.classList.toggle("active", isAutoScrollEnabled);
        }
        savePreference("autoScroll", isAutoScrollEnabled);
    };

    if (scrollToggle) scrollToggle.onclick = toggleAutoScrollState;
    if (scrollToggleMini) scrollToggleMini.onclick = toggleAutoScrollState;

    document.getElementById("kk-seekbar").oninput = handleSeekBarInput;

    makeDraggable(controlBar, document.getElementById("kk-drag"));
}

// Mini Mode Toggle
function toggleMiniMode() {
    controlBar.classList.toggle("mini");
    const miniBtn = document.getElementById("kk-mini-toggle");
    miniBtn.innerText = controlBar.classList.contains("mini") ? "▢" : "_";
}

// Preferences Storage Helpers
function savePreference(key, val) {
    if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [key]: val });
    }
}

function loadUserPreferences() {
    if (!chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(["skipCode", "autoScroll"], (res) => {
        if (res.skipCode !== undefined) isSkipCodeEnabled = res.skipCode;
        if (res.autoScroll !== undefined) isAutoScrollEnabled = res.autoScroll;
    });
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
            savePreference("playerPosLeft", element.style.left);
            savePreference("playerPosTop", element.style.top);
            document.onmousemove = null;
            document.onmouseup = null;
        };
    };
}

// Clean Text Extractor
function getCleanTextFromChat(element) {
    const clone = element.cloneNode(true);
    clone
        .querySelectorAll(".kokoro-inline-play-btn, .kokoro-line-jump-btn")
        .forEach((btn) => btn.remove());

    if (isSkipCodeEnabled) {
        const codeBlocks = clone.querySelectorAll("pre, code");
        codeBlocks.forEach((block) => {
            block.innerText = " [Code snippet skipped] ";
        });
    }

    return clone.innerText.trim();
}

function getCleanTextFromLine(element) {
    const clone = element.cloneNode(true);
    clone
        .querySelectorAll(".kokoro-inline-play-btn, .kokoro-line-jump-btn")
        .forEach((btn) => btn.remove());
    return clone.innerText.trim();
}

// Clean text specifically for spoken output (stripping quote marks & markdown noise)
function cleanTextForSpeech(text) {
    if (!text) return "";
    return text
        .replace(/["'“”‘’`]/g, "") // Remove quotes/backticks so TTS doesn't speak them
        .replace(/[*_~#]/g, "") // Strip markdown formatting symbols
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();
}

// Wrap ALL text nodes into sentence spans without skipping single-sentence elements
function wrapSentencesInChat(element) {
    // Clear previous wrappers if re-reading
    element.querySelectorAll(".kokoro-sentence-span").forEach((span) => {
        const parent = span.parentNode;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
    });

    // Expand selectors to catch headers, table cells, definition items, etc.
    const textBlocks = element.querySelectorAll(
        "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, dt, dd, div",
    );

    textBlocks.forEach((block) => {
        // Skip code blocks if option enabled
        if (isSkipCodeEnabled && block.closest("pre, code")) return;

        // Traverse DOM node tree cleanly
        const walk = document.createTreeWalker(
            block,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function (node) {
                    const parent = node.parentNode;
                    if (
                        parent &&
                        parent.classList &&
                        (parent.classList.contains("kokoro-line-jump-btn") ||
                            parent.classList.contains("kokoro-inline-play-btn"))
                    ) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return node.textContent.trim().length > 0
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT;
                },
            },
            false,
        );

        const textNodes = [];
        let node;
        while ((node = walk.nextNode())) {
            // Avoid double-processing if already inside a sentence span
            if (!node.parentNode.classList.contains("kokoro-sentence-span")) {
                textNodes.push(node);
            }
        }

        textNodes.forEach((tNode) => {
            const rawText = tNode.textContent;
            // Split by sentence-ending punctuation while preserving spaces
            const sentences = rawText.split(/(?<=[.!?])\s+/);

            const fragment = document.createDocumentFragment();

            sentences.forEach((sent, idx) => {
                if (!sent) return;
                const span = document.createElement("span");
                span.className = "kokoro-sentence-span";
                // Preserve trailing whitespace for seamless inline rendering
                span.textContent =
                    sent + (idx < sentences.length - 1 ? " " : "");
                fragment.appendChild(span);
            });

            if (tNode.parentNode && fragment.childNodes.length > 0) {
                tNode.parentNode.replaceChild(fragment, tNode);
            }
        });
    });
}

// Prepare Text Chunks grouped 3-4 sentences at a time
function prepareTextChunks(element) {
    currentChatElement = element;
    wrapSentencesInChat(element);

    const cleanText = getCleanTextFromChat(element);
    const fullTextWords = cleanText.split(/\s+/);

    // Set Now Playing Title
    const snippet = cleanText.slice(0, 35) + "...";
    const npText = document.getElementById("kk-np-text");
    if (npText) npText.innerText = snippet;

    // Active Button State
    document
        .querySelectorAll(".kokoro-inline-play-btn")
        .forEach((btn) => btn.classList.remove("active"));
    const activeBtn = element.querySelector(".kokoro-inline-play-btn");
    if (activeBtn) activeBtn.classList.add("active");

    // Estimate total time
    const speed = parseFloat(document.getElementById("kk-speed")?.value || 1.0);
    estimatedTotalSecs = Math.max(
        1,
        Math.round(fullTextWords.length / 3 / speed),
    );

    const timeTot = document.getElementById("kk-time-tot");
    if (timeTot) timeTot.innerText = formatTime(estimatedTotalSecs);

    // Gather all sentence spans
    const sentenceSpans = Array.from(
        element.querySelectorAll(".kokoro-sentence-span"),
    );

    textChunks = [];
    chunkSpanGroups = [];

    if (sentenceSpans.length > 0) {
        // Group spans into batches of 3-4 sentences
        for (let i = 0; i < sentenceSpans.length; i += SENTENCES_PER_CHUNK) {
            const group = sentenceSpans.slice(i, i + SENTENCES_PER_CHUNK);
            const combinedText = group
                .map((span) => span.textContent)
                .join(" ");

            textChunks.push(combinedText);
            chunkSpanGroups.push(group);
        }
    } else {
        textChunks = [cleanText];
        chunkSpanGroups = [];
    }
}

// Highlight & Auto-Scroll for multi-sentence chunk groups
function highlightAndScrollSentence(chunkIndex, forceScroll = false) {
    if (!currentChatElement) return;

    // Clear previous active reading highlights
    document.querySelectorAll(".kokoro-active-reading-glow").forEach((el) => {
        el.classList.remove("kokoro-active-reading-glow");
    });

    const activeSpans = chunkSpanGroups[chunkIndex];

    if (activeSpans && activeSpans.length > 0) {
        // Highlight all spans in the active chunk group together
        activeSpans.forEach((span) =>
            span.classList.add("kokoro-active-reading-glow"),
        );

        // Auto-scroll to the first sentence span of the active group
        if (isAutoScrollEnabled || forceScroll) {
            activeSpans[0].scrollIntoView({
                behavior: "smooth",
                block: "center",
            });
        }
    }
}

// Play multi-sentence chunk
function playChunk(index) {
    if (index >= textChunks.length) {
        stopTimer();
        setPlayerState("IDLE");
        currentElapsedSecs = estimatedTotalSecs;
        updateProgressUI();
        return;
    }

    currentChunkIndex = index;
    const rawChunkText = textChunks[index];
    const rate = parseFloat(document.getElementById("kk-speed")?.value || 1.0);

    // Highlight and scroll to the active 3-4 sentence group
    highlightAndScrollSentence(index);

    // Clean quotes and markdown artifacts BEFORE sending to speech engine
    const spokenText = cleanTextForSpeech(rawChunkText);

    // If chunk contained only stripped symbols, advance smoothly to the next chunk
    if (!spokenText) {
        playChunk(index + 1);
        return;
    }

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.rate = rate;

    utterance.onstart = () => {
        setLoadingState(false);
        setPlayerState("PLAYING");
        startTimer();
    };

    utterance.onend = () => {
        if (playerState === "PLAYING") playChunk(index + 1);
    };

    utterance.onerror = () => {
        if (playerState === "PLAYING") playChunk(index + 1);
    };

    window.speechSynthesis.speak(utterance);
}

function speakFullResponse(chatElement, startChunkIndex = 0) {
    stopTimer();
    window.speechSynthesis.cancel();
    setLoadingState(true);

    setTimeout(() => {
        prepareTextChunks(chatElement);
        const startIdx = Math.max(
            0,
            Math.min(startChunkIndex, textChunks.length - 1),
        );
        currentChunkIndex = startIdx;

        const ratio = textChunks.length > 0 ? startIdx / textChunks.length : 0;
        currentElapsedSecs = ratio * estimatedTotalSecs;

        playChunk(startIdx);
    }, 50);
}

function speakFromLine(chatElement, lineElement) {
    prepareTextChunks(chatElement);

    let matchedIndex = -1;

    // 1. Direct DOM Node Matching: Find the sentence span inside the clicked line
    const targetSpan = lineElement.classList.contains("kokoro-sentence-span")
        ? lineElement
        : lineElement.querySelector(".kokoro-sentence-span");

    if (targetSpan) {
        matchedIndex = chunkSpanGroups.findIndex((group) =>
            group.includes(targetSpan),
        );
    }

    // 2. Fallback Normalized Text Search: If direct DOM match wasn't found
    if (matchedIndex === -1) {
        const cleanLineText = getCleanTextFromLine(lineElement)
            .replace(/[^a-zA-Z0-9\s]/g, "")
            .toLowerCase()
            .trim();

        if (cleanLineText) {
            matchedIndex = textChunks.findIndex((chunk) => {
                const cleanChunk = chunk
                    .replace(/[^a-zA-Z0-9\s]/g, "")
                    .toLowerCase();
                return (
                    cleanChunk.includes(cleanLineText) ||
                    cleanLineText.includes(cleanChunk.slice(0, 20))
                );
            });
        }
    }

    if (matchedIndex === -1) matchedIndex = 0;

    speakFullResponse(chatElement, matchedIndex);
}

// Timer Engine
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

    const pct = estimatedTotalSecs
        ? (currentElapsedSecs / estimatedTotalSecs) * 100
        : 0;

    if (seekBar) seekBar.value = Math.min(100, pct);
    if (timeCur) timeCur.innerText = formatTime(Math.floor(currentElapsedSecs));
}

// Play/Pause State Management
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
        speakFullResponse(currentChatElement, currentChunkIndex);
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

function readNextChat() {
    const chats = getAllChatBubbles();
    const idx = chats.indexOf(currentChatElement);
    if (idx < chats.length - 1) speakFullResponse(chats[idx + 1], 0);
}

function readPreviousChat() {
    const chats = getAllChatBubbles();
    const idx = chats.indexOf(currentChatElement);
    if (idx > 0) speakFullResponse(chats[idx - 1], 0);
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "READ_CURRENT_CHAT") {
        injectControlBar();
        const chats = getAllChatBubbles();
        if (chats.length) speakFullResponse(chats[chats.length - 1], 0);
    }
});
