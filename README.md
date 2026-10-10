# Screenreel Recorder

A Nuxt 4 app that records your screen, your computer's sound (everyone in the meeting) and your microphone, then uploads each recording to your Google Drive. When a recording finishes, it asks whether you also want to download a copy.

- **Laptops** (Windows, Mac, Chromebook): records the whole screen, so it works with Zoom, Google Meet, Teams or any other app. A 3-second countdown runs before every recording. Video is saved to the device every 2 seconds while recording, so a crash or closed tab doesn't lose the meeting, and long meetings (4 hours and more) don't fill the computer's memory.
- **Google Drive**: uploads start only after you press Stop, so sign-in never interrupts a recording and the upload never competes with your meeting's connection. Google sign-ins last about an hour; if it has run out, the "Recording finished" window has a **Sign in & upload** button.
- **Browser extension**: a toolbar button (and `Alt+Shift+R`) that opens the recorder in a small floating window.
- **Phones**: phone browsers don't let web pages record the screen. You record with the phone's built-in screen recorder, and Screenreel sends the video to Google Drive (pick it in the app, or on Android use *Share → Screenreel*).

## Project layout

```
app/
  app.vue                      page layout and start-up
  components/                  header, recorder, settings panel, recordings, dialogs
  composables/
    useRecorder.ts             screen + sound capture, countdown, pop-out controls
    useLibrary.ts              recordings saved on this device
    useUploads.ts              Google Drive upload queue
    useDrive.ts                Google sign-in state
    useSettings.ts             settings, saved in the browser
    useUi.ts                   banners and dialogs
  utils/
    recordingsDb.ts            on-device storage (IndexedDB)
    drive.ts                   Google sign-in and resumable Drive upload
    env.ts, format.ts          device detection, formatting
  assets/css/app.css           styles
public/
  sw.js                        offline support and "Share to Screenreel" on Android
  manifest.webmanifest         makes it installable as an app
  icons/
extension/                     the Chrome / Edge extension (not part of the Nuxt build)
.github/workflows/deploy.yml   builds and publishes to GitHub Pages on every push
nuxt.config.ts
```

## Run it on your computer

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. To check types: `npm run typecheck`. To build the static site: `npm run generate` (output in `.output/public`).

## 1. Put it on GitHub Pages

1. Create a new repository on GitHub, for example `screen-recorder`. It must be **public** on a free GitHub plan.
2. Push this folder to its `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Screenreel recorder"
   git branch -M main
   git remote add origin https://github.com/YOUR-GITHUB-NAME/screen-recorder.git
   git push -u origin main
   ```
3. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
4. Open the **Actions** tab. The *Deploy to GitHub Pages* run builds the app (about 2 minutes). If it ran before step 3 and failed, click it and choose **Re-run all jobs**.
5. Your app is live at `https://YOUR-GITHUB-NAME.github.io/screen-recorder/`.

Every later `git push` to `main` rebuilds and republishes it.

## 2. Connect Google Drive (one-time, about 10 minutes)

Google only lets an app upload to your Drive after you sign in to it, so Screenreel needs its own free "client ID" from Google Cloud. No payment details are needed.

1. Go to <https://console.cloud.google.com> and sign in with the Google account whose Drive should receive the recordings.
2. Create a project: click the project picker at the top → **New project** → name it `Screenreel` → **Create**, then select it.
3. Turn on Drive: open **APIs & Services → Library**, search for **Google Drive API**, and click **Enable**.
4. Set up sign-in: open **Google Auth Platform** (called **OAuth consent screen** in some accounts) → **Get started**.
   - App name: `Screenreel`. Support email: your email.
   - Audience: **External**.
   - Contact email: your email. Agree to the policy and click **Create**.
5. Add yourself as a tester: in **Audience → Test users**, click **Add users** and enter your Gmail address. Add anyone else who will use your copy too.
6. Create the client ID: open **Clients → Create client**.
   - Application type: **Web application**. Name: `Screenreel`.
   - **Authorized JavaScript origins**: add `https://YOUR-GITHUB-NAME.github.io`. To use it with `npm run dev` too, also add `http://localhost:3000`.
   - Leave *Authorized redirect URIs* empty. Click **Create**.
7. Copy the **Client ID**. It ends in `.apps.googleusercontent.com`.
8. Give it to the app, either way:
   - **For every device (recommended):** in your GitHub repository, open **Settings → Secrets and variables → Actions → Variables** and add a variable `GOOGLE_CLIENT_ID` with the client ID (and optionally `GOOGLE_EMAIL` with your email). Then re-run the latest workflow in the **Actions** tab. The client ID isn't a password, so a variable is fine.
   - **For one browser:** open your Screenreel page, click **Google Drive: not set up** (top right), and paste it there.
9. In Screenreel, click **Sign in to Google Drive**.

When you sign in, Google says **"Google hasn't verified this app"**. That's expected for a personal app you made yourself: click **Continue**. Screenreel only asks for permission to see and manage the files it creates, so it can't read the rest of your Drive.

Recordings go to the **Screenreel Recordings** folder in your Google Drive. You can change the folder in Settings.

## 3. Use it on a laptop

1. Open the app in **Chrome or Edge**. Firefox and Safari can't capture the computer's sound.
2. Press **Record**, choose **Entire screen**, and tick **Also share system audio**. This records everyone in Zoom, Meet, Teams, etc. Your microphone is added automatically.
3. A 3-second countdown runs, then recording starts. A small pop-out window with the timer, Pause and Stop stays on top of your meeting.
4. Press **Stop**. The "Recording finished" window asks if you want to **Download** a copy, and shows the Google Drive upload (or a **Sign in & upload** button if the hour has passed). You can do both, in either order.

Tips:
- **Use headphones.** On speakers, your microphone also picks up the meeting and voices can echo.
- **Long meetings:** set **Quality → Small file (meetings)**. Four hours is then about 2.7 GB instead of 7 GB. Keep the laptop awake and the lid open; the app keeps the screen on, but closing the lid stops the recording.
- On **Mac**, whole-screen sound needs macOS 14.2 or newer. On older Macs, join the meeting in a Chrome tab and share that tab with *Also share tab audio*.
- Install it as an app: in Chrome's address bar click the install icon (or menu → *Cast, save and share → Install page as app*).

## 4. Install the browser extension (Chrome or Edge)

1. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `extension` folder.
3. Pin it with the puzzle-piece icon, click it, and enter your GitHub Pages address.
4. From then on, click the icon or press `Alt+Shift+R` to open the recorder.

The extension opens your hosted app instead of carrying its own copy, so updates you push to GitHub reach both.

## 5. Use it on a phone

1. Open your GitHub Pages address on the phone.
2. Add it to your home screen. On Android, use the browser menu → **Install app**. On iPhone, use **Share → Add to Home Screen**.
3. Follow the steps on the screen to record with the phone's built-in screen recorder, with sound set to include the microphone and media/device audio.
4. Send the video to Google Drive: tap **Send a recording to Google Drive**. On Android you can also use **Share → Screenreel** from Gallery or Photos.

**Do a short test call first.** On some phones, Android and iPhone keep other people's voices out of screen recordings during calls. If they're missing, use the meeting app's own recording instead (Zoom: *Record*; Google Meet: *Activities → Recording*).
