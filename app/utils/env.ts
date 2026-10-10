export interface DeviceEnv {
  os: string;
  browser: string;
  isPhone: boolean;
  isIOS: boolean;
  canRecord: boolean;
  hasMini: boolean;
  standalone: boolean;
}

const MIME = {
  mp4: ["video/mp4;codecs=avc1.42E01F,mp4a.40.2", "video/mp4;codecs=avc1,mp4a", "video/mp4;codecs=avc1,opus", "video/mp4"],
  webm: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=h264,opus", "video/webm"]
};
export type VideoFormat = keyof typeof MIME;

export function supportedMime(kind: VideoFormat): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME[kind].find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

let cached: DeviceEnv | null = null;

export function deviceEnv(): DeviceEnv {
  if (cached) return cached;
  const ua = navigator.userAgent;
  const uad = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData;
  let os = "Unknown";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/CrOS/i.test(ua)) os = "ChromeOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = navigator.maxTouchPoints > 1 ? "iPadOS" : "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Unknown";
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/Edg\/([\d.]+)/))) browser = "Edge " + m[1]!.split(".")[0];
  else if ((m = ua.match(/OPR\/([\d.]+)/))) browser = "Opera " + m[1]!.split(".")[0];
  else if ((m = ua.match(/Firefox\/([\d.]+)/))) browser = "Firefox " + m[1]!.split(".")[0];
  else if ((m = ua.match(/Chrome\/([\d.]+)/))) browser = (uad?.brands?.some((b) => /Brave/i.test(b.brand)) ? "Brave " : "Chrome ") + m[1]!.split(".")[0];
  else if ((m = ua.match(/Version\/([\d.]+).*Safari/))) browser = "Safari " + m[1]!.split(".")[0];

  cached = {
    os,
    browser,
    isPhone: ["Android", "iOS", "iPadOS"].includes(os),
    isIOS: os === "iOS" || os === "iPadOS",
    canRecord: !!(navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices && typeof MediaRecorder !== "undefined"),
    hasMini: "documentPictureInPicture" in window,
    standalone: matchMedia("(display-mode: standalone)").matches || !!(navigator as Navigator & { standalone?: boolean }).standalone
  };
  return cached;
}

export function sysAudioHint(): string {
  const env = deviceEnv();
  if (!env.canRecord) return "Not available in this browser.";
  if (/Firefox/.test(env.browser)) return "Firefox doesn't share computer sound from web pages. Use Chrome or Edge to hear the other people in your meeting.";
  if (/Safari/.test(env.browser)) return "Safari doesn't share computer sound from web pages. Use Chrome or Edge to hear the other people in your meeting.";
  if (env.os === "Windows" || env.os === "ChromeOS") return "Choose “Entire screen” and tick “Also share system audio”. This captures Zoom, Teams, Meet and any other app.";
  if (env.os === "macOS") return "On macOS 14.2+ choose “Entire screen” and tick “Also share system audio”. On older Macs, run the meeting in a Chrome tab and share that tab with “Also share tab audio”.";
  if (env.os === "Linux") return "Tab audio works when sharing a tab. Whole-screen sound depends on your Linux audio setup.";
  return "In the share dialog, tick “Share system audio” or “Share tab audio”.";
}
