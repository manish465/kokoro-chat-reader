// --- State Management ---
let currentChatElement = null;
let wordSpans = [];
let currentWordIndex = 0;

// Chunking state
let textChunks = [];
let currentChunkIndex = 0;
let chunkStartWordIndices = [];

// Floating Control Bar Instance
let controlBar = null;

// Inject / Render Floating Glass Bar
function injectControlBar() {
    if (document.getElementById("kokoro-control-bar")) return;

    controlBar = document.createElement("div");
    controlBar.id = "kokoro-control-bar";
    controlBar.innerHTML = `
    <div class="kokoro-drag-handle" id="kk-drag" title="Drag bar">
      <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor">
        <circle cx="4" cy="4" r="1.5"/><circle cx="8" cy="4" r="1.5"/>
        <circle cx="4" cy="9" r="1.5"/><circle cx="8" cy="9" r="1.5"/>
        <circle cx="4" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
      </svg>
    </div>
    <button class="kokoro-btn" id="kk-prev" title="Previous Response">⏮</button>
    <button class="kokoro-btn" id="kk-rw" title="Rewind 5s">⏪</button>
    <button class="kokoro-btn kokoro-btn-primary" id="kk-play" title="Play/Pause">▶</button>
    <button class="kokoro-btn" id="kk-ff" title="Forward 5s">⏩</button>
    <button class="kokoro-btn" id="kk-next" title="Next Response">⏭</button>
    <select class="kokoro-speed-select" id="kk-speed">
      <option value="0.8">0.8x</option>
      <option value="1.0" selected>1.0x</option>
      <option value="1.25">1.25x</option>
      <option value="1.5">1.5x</option>
    </select>
  `;
    document.body.appendChild(controlBar);

    // Bind Events
    document.getElementById("kk-play").onclick = togglePlayPause;
    document.getElementById("kk-rw").onclick = () => seekWords(-10);
    document.getElementById("kk-ff").onclick = () => seekWords(10);
    document.getElementById("kk-next").onclick = readNextChat;
    document.getElementById("kk-prev").onclick = readPreviousChat;

    makeDraggable(controlBar, document.getElementById("kk-drag"));
}

// Make Floating Bar Draggable Anywhere
function makeDraggable(element, handle) {
    let pos1 = 0,
        pos2 = 0,
        pos3 = 0,
        pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        element.style.top = element.offsetTop - pos2 + "px";
        element.style.left = element.offsetLeft - pos1 + "px";
        element.style.bottom = "auto";
        element.style.right = "auto";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

// Wrap chat words into targetable <span> elements
function prepareChatElement(element) {
    if (currentChatElement) {
        currentChatElement.classList.remove("kokoro-active-chat-bubble");
    }

    currentChatElement = element;
    currentChatElement.classList.add("kokoro-active-chat-bubble");
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

    buildSentenceChunks();
}

// Chunking Logic: Splits text into ~150-200 character sentence groups
function buildSentenceChunks() {
    textChunks = [];
    chunkStartWordIndices = [];

    let currentChunkWords = [];
    let currentLength = 0;
    let startIndex = 0;

    wordSpans.forEach((span, index) => {
        const word = span.innerText;
        currentChunkWords.push(word);
        currentLength += word.length + 1;

        // Chunk boundary: Punctuation OR word count cap
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
        textChunks.push(currentChunkWords.join(" "));
    }
}

// Speak Chunks Sequentially
function speakChat(chatElement) {
    window.speechSynthesis.cancel();
    prepareChatElement(chatElement);
    currentChunkIndex = 0;
    playChunk(0);
}

function playChunk(index) {
    if (index >= textChunks.length) {
        clearHighlights();
        document.getElementById("kk-play").innerText = "▶";
        return;
    }

    currentChunkIndex = index;
    const chunkText = textChunks[index];
    const rate = parseFloat(document.getElementById("kk-speed").value || 1.0);

    const utterance = new SpeechSynthesisUtterance(chunkText);
    utterance.rate = rate;

    const baseWordIndex = chunkStartWordIndices[index] || 0;

    utterance.onboundary = (event) => {
        if (event.name === "word") {
            highlightWordAtOffset(baseWordIndex, event.charIndex);
        }
    };

    utterance.onend = () => {
        playChunk(index + 1);
    };

    window.speechSynthesis.speak(utterance);
    document.getElementById("kk-play").innerText = "⏸";

    // Smoothly keep chat block centered
    chatElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

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
            break;
        }
        accumulatedLength += wordLength + 1;
    }
}

function clearHighlights() {
    wordSpans.forEach((span) => span.classList.remove("kokoro-word-highlight"));
}

// Seek Backward / Forward
function seekWords(wordOffset) {
    if (!wordSpans.length) return;

    const newTargetIndex = Math.max(
        0,
        Math.min(wordSpans.length - 1, currentWordIndex + wordOffset),
    );

    // Find matching chunk index for target word
    let targetChunk = 0;
    for (let i = 0; i < chunkStartWordIndices.length; i++) {
        if (newTargetIndex >= chunkStartWordIndices[i]) {
            targetChunk = i;
        } else {
            break;
        }
    }

    window.speechSynthesis.cancel();
    playChunk(targetChunk);
}

function togglePlayPause() {
    if (window.speechSynthesis.speaking) {
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
            document.getElementById("kk-play").innerText = "⏸";
        } else {
            window.speechSynthesis.pause();
            document.getElementById("kk-play").innerText = "▶";
        }
    } else if (currentChatElement) {
        speakChat(currentChatElement);
    }
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
    if (idx < chats.length - 1) speakChat(chats[idx + 1]);
}

function readPreviousChat() {
    const chats = getAllChatBubbles();
    const idx = chats.indexOf(currentChatElement);
    if (idx > 0) speakChat(chats[idx - 1]);
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "READ_CURRENT_CHAT") {
        injectControlBar();
        const chats = getAllChatBubbles();
        if (chats.length) speakChat(chats[chats.length - 1]);
    }
});
