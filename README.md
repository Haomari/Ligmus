# Ligmus

Fast, dark-mode mobile client for **Librus Synergia**, built with Expo and React Native.

## Features

- **Dashboard, Grades & Timetable** - Grades with weighted averages, substitutions, cancelled lessons, lesson topics, lucky number, and instant offline cache.
- **Attendance** - Full school-year synchronization, per-subject stats, semester filters, and `<50%` / `50-60%` threshold warnings.
- **Messages & Excuse Presets** - Inbox/sent messages, attachment downloads to any folder, and an absence excuse generator with customizable presets.
- **Background Notifications** - Checks for new messages, grades, and timetable changes in the background with **Smart Hours** (`Mon-Fri, 07:30-18:00`).
- **Foldable & Tablet Layout** - Adaptive right-side thumb navigation rail and multi-column grids on wide screens.
- **In-App Updater** - Checks GitHub Releases and installs new APK versions directly from the app.

## Installation (Android)

1. Download **`ligmus.apk`** from the [Latest Release](https://github.com/Haomari/Ligmus/releases/latest).
2. Open the downloaded file on your Android device (allow installation from unknown sources if prompted).
3. Future updates can be checked and installed directly from **Settings**.

## Local Development

```bash
npm install
npx expo start
```

> Background notifications and in-app APK installation require a native Android build (`npx expo run:android`) rather than Expo Go.

## Privacy

Ligmus connects directly to `synergia.librus.pl` / `api.librus.pl` from your device. Credentials are stored locally in encrypted storage (`expo-secure-store`) and are never sent to third-party servers.
