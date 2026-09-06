# 📱 droid-sync // Android Screenshot & Media Runner

> **Language / Język:** **English** | [Polski](README_PL.md)

[![Gitea](https://img.shields.io/badge/Gitea-Repository-blue?logo=gitea)](https://gitea.7u.pl/gkucmierz/droid-sync)
[![GitHub](https://img.shields.io/badge/GitHub-Mirror-black?logo=github)](https://github.com/gkucmierz/droid-sync)
[![Web UI](https://img.shields.io/badge/Web%20UI-droid--sync.7u.pl-22d3ee)](https://droid-sync.7u.pl)
[![Tech Blog](https://img.shields.io/badge/Tech%20Blog-tech.7u.pl-purple?logo=vitepress)](https://tech.7u.pl/posts/droid-sync-android-macos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Automated console runner and web interface (Vue 3 / Vite) for zero-touch synchronization of screenshots and camera media from Android devices to macOS (default: `~/Documents/Droid Sync/`), operating seamlessly via USB cable or local Wi-Fi (ADB over TCP/IP).

* **Main Repository (Gitea)**: [https://gitea.7u.pl/gkucmierz/droid-sync](https://gitea.7u.pl/gkucmierz/droid-sync)
* **Mirror (GitHub)**: [https://github.com/gkucmierz/droid-sync](https://github.com/gkucmierz/droid-sync)
* **Production Web UI**: [https://droid-sync.7u.pl](https://droid-sync.7u.pl)
* **Article & Project Story (Tech Blog)**: [https://tech.7u.pl/posts/droid-sync-android-macos](https://tech.7u.pl/posts/droid-sync-android-macos)

---

## 🎯 Architecture & Deterministic Ports (`dport`)

Following the `7u.pl` ecosystem conventions:
* **Server / ADB Runner (`droid-sync-server`)**: Port **`40880`** (`dport calc droid-sync-server`)
  * Lightweight Node.js daemon (ES Modules) that directly drives the `adb` binary.
  * Runs in the background, polls the connected phone every ~2.5s, and automatically pulls newly taken screenshots and camera photos to macOS storage.
  * Writes synced media directly without browser file permission prompts (100% native filesystem access).
  * On-demand remote screenshots (`adb exec-out screencap -p`).
  * Lossless in-flight image rotation (`sips`) preserving 100% original quality and EXIF metadata.
  * Selective media deletion from phone storage via ADB with Android MediaScanner cache invalidation.
* **Web UI (`droid-sync`)**: Port **`49278`** (`dport calc droid-sync`)
  * Vue 3 + Vite application styled with a dark cyber / glassmorphism aesthetic (supporting both Dark and Light modes).
  * Real-time phone status monitor (battery level, interactive battery telemetry modal, Android OS specifications, model, connection type USB / Wi-Fi).
  * Quick-action buttons: **Remote Snap**, **Sync Now**, **Open in Finder**, **Quick Wi-Fi**, **Settings**.
  * Dynamic live sync progress indicator (Sync Progress Card).
  * Built-in EXIF metadata inspector for camera photos (camera body, lens, exposure time, ISO, aperture, dimensions, and GPS coordinates with direct Google Maps link).
  * Media viewer with lossless image rotation (`sips`) and direct write-back to Mac storage.
  * Live search with matched substring highlighting.
  * Two-tab Settings dialog (**Destination Directories** and **Sync & ADB Engine**) with direct deep-linking from the phone status card.
  * Dedicated, cohesive confirmation dialog (ConfirmModal) with universal ESC key dismissal.
  * Synced media gallery with native macOS clipboard image copy (`Copy to Clipboard`) and selective deletion from phone storage.
  * PWA icons with safe-zone maskable padding, tailored for macOS Dock tiles and Android home screens.

---

## 📂 macOS Directory Structure (Parent Directory Architecture)

All synced media is neatly organized under a central parent folder on your Mac:

```text
~/Documents/Droid Sync/
├── sync-history-screenshots.jsonl    # Screenshot synchronization history ledger
├── sync-history-photos.jsonl         # Camera photo synchronization history ledger
├── screenshots/                      # 100% pure media folder containing only screenshots
│   ├── Screenshot_20260906-020915.png
│   └── ...
└── photos/                           # 100% pure media folder containing only camera photos
    ├── PXL_20260903_101159904.jpg
    └── ...
```

* **Clean Media Directories**: Inside `screenshots/` and `photos/`, you will find exclusively your images (no technical files or lockfiles pollute your media folders).
* **Transparent Sync Ledger (`hideJsonlFiles: false`)**: By default, JSONL history ledgers are visible directly inside `~/Documents/Droid Sync/`. Power users can open, inspect, or delete entries manually in Finder; the daemon automatically detects changes and re-synchronizes missing items immediately.
* **Hidden File Mode**: If you prefer a cleaner root view, toggle `"hideJsonlFiles": true` in Settings — the daemon will automatically prefix ledger files with a dot (`.sync-history-*.jsonl`).

---

## 🛠️ Android Device Preparation Guide

To enable macOS to communicate with your phone via ADB, you need to enable **Developer Options** and **USB Debugging** once.

### Step 1: Enable Developer Options
1. Open **Settings** on your phone.
2. Scroll to the bottom and select **About phone** $\rightarrow$ **Software information**.
3. Locate the **Build number** entry.
4. Tap **Build number 7 times** in rapid succession.
5. Enter your phone lock PIN or pattern when prompted. A toast message will appear: *"You are now a developer!"*.

### Step 2: Enable USB Debugging
1. Return to the main **Settings** menu.
2. At the very bottom, open the newly revealed **Developer options**.
3. Toggle on **USB debugging**.
4. *(Optional for wireless operation)*: If you want to connect untethered, also toggle on **Wireless debugging**.

### Step 3: Connect to Mac & Authorize RSA Key
1. Connect the phone to your Mac using a USB data cable.
2. **Unlock your phone's screen**.
3. A dialog prompt will appear on your phone:
   > *"Allow USB debugging from this computer?"* (RSA key fingerprint).
4. Check **"Always allow from this computer"** and tap **Allow**.
5. In your Mac's terminal, verify the connection:
   ```bash
   adb devices -l
   ```
   You should see your device listed with status `device` (e.g., `R58M... device`).

---

## 📶 Switching to Wi-Fi (ADB over TCP/IP)

Untether your phone! `droid-sync` provides **1-Click Wireless Handshake**:
1. Connect your phone via USB cable briefly.
2. Open **Settings** in the web app and click **"✨ Connect via Wi-Fi (1-Click)"**.
   * The server automatically queries the phone's WLAN IP (`ip addr show wlan0`), switches the ADB daemon to TCP/IP port `5555`, and connects.
3. Disconnect the USB cable – your phone is now fully synced untethered over local Wi-Fi!

*(Manual IP entry is also available in Settings for custom network configurations).*

---

## 🔄 Dual Git Push (Gitea + GitHub)

This project is mirrored across both Gitea and GitHub. When developing locally, configure a dual-target push remote so a single `git push` updates both remotes simultaneously:

```bash
# Clone from Gitea or initialize:
git remote add origin git@gitea.7u.pl:gkucmierz/droid-sync.git

# Configure dual push targets:
git remote set-url --add --push origin git@gitea.7u.pl:gkucmierz/droid-sync.git
git remote set-url --add --push origin git@github.com:gkucmierz/droid-sync.git

# One command now updates both remotes:
git push -u origin main
```

---

## 🚀 Getting Started

### Quick Start (from the project root):

1. **Install all dependencies:**
   ```bash
   npm install
   ```

2. **Run everything concurrently (Server + Web UI in parallel):**
   ```bash
   npm run dev
   ```
   *Launches both the ADB runner daemon (in magenta) and the Vite development server (in cyan).*

3. **Run ONLY the background daemon (e.g. when using the hosted UI at `droid-sync.7u.pl`):**
   ```bash
   npm run server
   ```
   *Starts the lightweight ADB daemon on `http://127.0.0.1:40880`, ready to receive commands from the hosted web client.*

4. **Run UI only:**
   ```bash
   npm run ui
   ```

---

## ⚙️ Two-Tier Configuration (`config.default.json` vs `config.json`)

`droid-sync` employs a git-safe configuration hierarchy:
1. **`server/config.default.json`** – Canonical, version-controlled file containing safe baseline defaults.
2. **`server/config.json`** – Local override file ignored by `.gitignore`, taking precedence over defaults.
Any modifications saved from the in-app *Settings* panel are written exclusively to `config.json`, keeping your git tree pristine!

Example `server/config.default.json`:

```json
{
  "destinationDir": "~/Documents/Droid Sync",
  "screenshotsPath": "./screenshots",
  "photosPath": "./photos",
  "hideJsonlFiles": false,
  "phoneScreenshotsDirs": [
    "/sdcard/Pictures/Screenshots",
    "/sdcard/DCIM/Screenshots"
  ],
  "phoneCameraDirs": [
    "/sdcard/DCIM/Camera",
    "/sdcard/DCIM/100ANDRO"
  ],
  "syncScreenshots": true,
  "syncCamera": true,
  "pollIntervalMs": 2500,
  "autoDeleteFromPhone": false,
  "autoDeleteScreenshots": false,
  "autoDeleteCamera": false,
  "wifiIp": "",
  "wifiPort": 5555,
  "notifyOnMac": true
}
```

* `destinationDir`: Central parent directory on your Mac (the `~` home shorthand is automatically resolved).
* `screenshotsPath`: Subdirectory path for screenshots (relative to `destinationDir` or absolute).
* `photosPath`: Subdirectory path for camera photos.
* `hideJsonlFiles`: When `false`, `sync-history-*.jsonl` files remain visible in Finder for easy maintenance. When `true`, they are written with a leading dot (`.sync-history-*.jsonl`).
* `syncScreenshots` / `syncCamera`: Independent toggles to enable/disable syncing for each media category.
* `autoDeleteScreenshots` / `autoDeleteCamera`: When enabled (`true`), media files are automatically removed from phone storage after a verified download to save phone space.
* `pollIntervalMs`: Device polling frequency in milliseconds (default: 2500ms = 2.5s).
* `notifyOnMac`: Native macOS desktop notifications (`display notification`) triggered upon pulling new media.
