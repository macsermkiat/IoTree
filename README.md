# IoTree ESP8266 Plant Dashboard

Responsive Next.js 14 dashboard for a smart plant watering project using Firebase Realtime Database.

## Features

- Realtime reads from:
  - `/plants/plant1/sensors/soilMoisture`
  - `/plants/plant1/control/value`
  - `/plants/plant1/control/LED`
  - `/plants/plant1/control/motor`
  - `/plants/plant1/control/SMhome`
- Cards for:
  - Soil moisture live percentage + progress bar
  - Moisture threshold input + save
  - Water pump ON/OFF + status badge
  - LED grow light ON/OFF + status badge
  - SmartHome 6-channel toggles mapped to integer bitmask
- Last-updated timestamp
- Loading and error states
- Tailwind-based responsive UI

## Tech Stack

- Next.js 14 (App Router)
- React + TypeScript
- Tailwind CSS
- Firebase client SDK (`firebase`)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env template and fill Firebase values:

```bash
cp .env.local.example .env.local
```

3. Start local dev server:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Firebase Data Format

Expected values in Realtime Database:

- `soilMoisture`: number (0-100)
- `value`: number threshold
- `LED`: string `"ON"` or `"OFF"`
- `motor`: string `"ON"` or `"OFF"`
- `SMhome`: integer bitmask for 6 channels

Bit positions for SmartHome channels:

- Channel 1 -> bit 0 (`1 << 0`)
- Channel 2 -> bit 1 (`1 << 1`)
- Channel 3 -> bit 2 (`1 << 2`)
- Channel 4 -> bit 3 (`1 << 3`)
- Channel 5 -> bit 4 (`1 << 4`)
- Channel 6 -> bit 5 (`1 << 5`)

## Scripts

- `npm run dev` - run dev server
- `npm run build` - production build
- `npm run start` - run built app
- `npm run lint` - lint project
- `npm run type-check` - TypeScript validation

## Notes

- This v1 uses only Firebase client SDK (no backend API).
- Ensure Firebase Realtime Database rules allow your intended read/write access for development.

## Vercel Deployment

1. Import the repository in Vercel.
2. Keep **Framework Preset = Next.js** (do not deploy as a generic static app).
3. Add all `NEXT_PUBLIC_FIREBASE_*` environment variables from `.env.local.example`.
4. Build command is `npm run build`.
5. Do **not** set Output Directory to `public`; Next.js deploys using `.next` output handled by the Next.js runtime.

This repo includes `vercel.json` to force Next.js framework detection and avoid incorrect static output-directory checks.
