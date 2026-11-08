# Ligmus

Fast, dark-mode mobile client for **Librus Synergia** on **Android** and **iOS**, built with Expo and React Native.

## Features

- **Dashboard, Grades & Timetable** - Grades with weighted averages, substitutions, cancelled lessons, lesson topics, lucky number, and instant offline cache.
- **Attendance** - Full school-year synchronization, per-subject stats, semester filters, and `<50%` / `50-60%` threshold warnings.
- **Messages & Excuse Presets** - Inbox/sent messages, attachment saving (folder picker on Android, system Share Sheet on iOS), and an absence excuse generator with customizable presets.
- **Background Notifications** - Checks for new messages, grades, and timetable changes in the background with **Smart Hours** (`Mon-Fri, 07:30-18:00`).
- **Foldable & Tablet Layout** - Adaptive right-side thumb navigation rail and multi-column grids on wide screens.
- **Two-Channel Updater** - Switch between **Stable** (`master`) and **Beta** (`beta-updates`) channels directly in **Settings** (`Ustawienia`).

## Installation

### Android (`ligmus.apk`)
1. Download **`ligmus.apk`** from [Releases](https://github.com/Haomari/Ligmus/releases).
2. Open the APK on your phone (allow installation from unknown sources if prompted).
3. Future updates download and launch the Android installer directly inside the app.

### iOS (`ligmus.ipa` — SideStore / AltStore / Sideloadly)
1. Download **`ligmus.ipa`** from [Releases](https://github.com/Haomari/Ligmus/releases).
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
