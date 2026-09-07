# KASAINT Gym Tracker AK 💪

A mobile-first workout tracking application for Abel and Keneni. Track your daily workouts, log sets (weight × reps), compare progress, and sync in real-time via Firebase.

## Features

- **Today's Workout** — Pre-configured weekly schedule (Mon-Sun) with preset exercises. Log weight (kg) and reps per set, up to 6 sets per exercise.
- **Two Users** — Toggle between Abel (blue) and Keneni (green) to log individual workouts.
- **Rest Timer** — Set 1-5 minute rest timer with a floating popup. Plays a chord sound when done.
- **Progress Charts** — View max weight, total reps, and volume over time for any exercise. Side-by-side comparison of Abel vs Keneni.
- **Muscle Group Analysis** — See total volume by muscle group to identify imbalances.
- **Body Metrics** — Track weight and height over time with trend charts.
- **History** — Monthly summaries with volume trends and expandable daily details.
- **Real-time Sync** — Firebase Realtime Database syncs data between both users automatically.
- **Offline Backup** — All data saved to localStorage so it works without internet.
- **Data Export/Import** — Backup your data as JSON.
- **PWA** — Installable on your phone's home screen.
- **GitHub Pages** — Auto-deployed on push to main branch.

## Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS 4** for styling
- **Firebase Realtime Database** for cloud sync
- **Recharts** for charts
- **React Router v7** for navigation
- **vite-plugin-pwa** for PWA support
- **GitHub Actions** for CI/CD

## Getting Started

```bash
npm install
npm run dev
```

## Firebase Setup

Create a `.env` file in the project root with your Firebase config (see `.env.example`).

## Deployment

Push to the `main` branch — GitHub Actions automatically builds and deploys to:

**https://dobyanrs.github.io/kasaint-gym/**
