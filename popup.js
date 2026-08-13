document.getElementById("readBtn").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });
    const voice = document.getElementById("voiceSelect").value;
    const speed = document.getElementById("speedSelect").value;

    chrome.tabs.sendMessage(tab.id, {
        action: "READ_CURRENT_CHAT",
        voice: voice,
        speed: speed,
    });
});
