/* Opens your hosted Screenreel in a compact window that floats beside your meeting.
   If that window is already open, it's brought to the front instead of opening another. */

async function openRecorder() {
  const { appUrl } = await chrome.storage.sync.get("appUrl");
  if (!appUrl) {
    if (chrome.action.openPopup) chrome.action.openPopup().catch(() => {});
    return { ok: false, reason: "no-url" };
  }
  const { windowId } = await chrome.storage.session.get("windowId");
  if (windowId) {
    try {
      await chrome.windows.update(windowId, { focused: true, drawAttention: true });
      return { ok: true };
    } catch (e) {
      // The window was closed; open a fresh one below.
    }
  }
  const w = await chrome.windows.create({ url: appUrl, type: "popup", width: 480, height: 860, focused: true });
  await chrome.storage.session.set({ windowId: w.id });
  return { ok: true };
}

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "open-recorder") openRecorder();
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === "open") {
    openRecorder().then(reply, (e) => reply({ ok: false, reason: String(e) }));
    return true; // reply is async
  }
});

chrome.windows.onRemoved.addListener(async (id) => {
  const { windowId } = await chrome.storage.session.get("windowId");
  if (windowId === id) chrome.storage.session.remove("windowId");
});
