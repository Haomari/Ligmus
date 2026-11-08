# Ligmus — Librus Synergia Mobile Client

**Ligmus** is a fast, dark-mode mobile client for **Librus Synergia** on **Android (APK)** and **iOS (IPA)**, built with Expo and React Native.

- **GitHub Repository:** [github.com/Haomari/Ligmus](https://github.com/Haomari/Ligmus)
- **Releases & Downloads:** [github.com/Haomari/Ligmus/releases](https://github.com/Haomari/Ligmus/releases)

## Features

- **Dashboard & Activity Feed** - Live feed of recent grades, messages, school announcements, attendance marks, and timetable changes with instant offline cache.
- **Grades, Timetable & Terminarz** - Weighted averages, substitutions, cancelled lessons, school holidays / free days, and **Terminarz** event matching (exams, quizzes, retakes, and consultations).
- **Attendance** - Full school-year synchronization, per-subject stats, semester filters, and `<50%` / `50-60%` threshold warnings.
- **Messages & Announcements** - Inbox/sent messages, school announcements, attachment downloads, and an absence excuse generator with customizable presets.
- **Background Notifications** - Checks for new messages, grades, and timetable changes in the background with **Smart Hours** (`Mon-Fri, 07:30-18:00`).
- **Foldable & Tablet Layout** - Adaptive right-side thumb navigation rail and multi-column grids on wide screens.
- **Two-Channel Updater** - Switch between **Stable** (`master`) and **Beta** (`beta-updates`) channels directly in **Settings** (`Ustawienia`).

## Installation

### Android (`ligmus.apk`)
1. Download **`ligmus.apk`** from [Ligmus GitHub Releases](https://github.com/Haomari/Ligmus/releases).
2. Open the APK on your phone (allow installation from unknown sources if prompted).
3. Future updates download and launch the Android installer directly inside the app.

### iOS (`ligmus.ipa` — SideStore / AltStore / Sideloadly)
1. Download **`ligmus.ipa`** from [Ligmus GitHub Releases](https://github.com/Haomari/Ligmus/releases).
2. Install it on your iPhone or iPad using [SideStore](https://sidestore.io/), [AltStore](https://altstore.io/), [Sideloadly](https://sideloadly.io/), or LiveContainer with a free Apple ID.
3. When an update is available in the app, tap **Download IPA in Safari** and install the new `.ipa` through SideStore / AltStore.

## Release Channels

- **Stable (`master`)** - Tested main releases.
- **Beta (`beta-updates`)** - Early pre-releases for testing upcoming features. Enable **Beta** under **Settings → O aplikacji Ligmus → Kanał aktualizacji**.

## Local Development

```bash
npm install
npx expo start
```

> Background notifications and native updates require a standalone build (`npx expo run:android` / `npx expo run:ios`) rather than Expo Go.

## Privacy

Ligmus connects directly to `synergia.librus.pl` / `api.librus.pl` from your device. Credentials are stored locally in encrypted storage (`expo-secure-store`) and are never sent to third-party servers.
