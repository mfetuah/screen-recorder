const $ = (id) => document.getElementById(id);

async function show() {
  const { appUrl } = await chrome.storage.sync.get("appUrl");
  $("ready").hidden = !appUrl;
  $("setup").hidden = !!appUrl;
  if (appUrl) $("url").value = appUrl;
}

$("open").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "open" });
  window.close();
});

$("change").addEventListener("click", () => {
  $("ready").hidden = true;
  $("setup").hidden = false;
  $("url").focus();
});

$("setup").addEventListener("submit", async (e) => {
  e.preventDefault();
  let url;
  try { url = new URL($("url").value.trim()); } catch (err) { url = null; }
  const local = url && /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
  if (!url || !(url.protocol === "https:" || (local && url.protocol === "http:"))) {
    $("err").textContent = "Enter the full https:// address of your Screenreel page.";
    $("err").hidden = false;
    return;
  }
  $("err").hidden = true;
  await chrome.storage.sync.set({ appUrl: url.href });
  show();
});

show();
