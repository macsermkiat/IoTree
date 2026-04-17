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

Legacy compatibility:

- If your existing tree is `Plant1/Sensor` (capitalized/singular), the web app auto-detects it and maps controls to `Plant1/control`.
- If no control node exists yet, use **Initialize Firebase Paths** in the dashboard to create default control values.

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


## ESP8266 Firmware (for this dashboard)

A compatible sketch is included at:

- `firmware/esp8266_iotree.ino`

It is aligned with this web app contract:

- Writes moisture percentage number to `/plants/plant1/sensors/soilMoisture`
- Reads threshold number from `/plants/plant1/control/value`
- Reads `"ON" | "OFF"` from `/plants/plant1/control/LED`
- Reads `"ON" | "OFF"` from `/plants/plant1/control/motor`
- Reads 6-channel bitmask integer from `/plants/plant1/control/SMhome`

Firmware note:

- The included firmware currently defaults to `FIREBASE_BASE_PATH = "/plant1"` so it matches setups where data appears under `plant1/sensors/...`.
- It auto-creates missing control keys on boot (`value`, `LED`, `motor`, `SMhome`) if they are absent.

> Note: Output polarity is configurable in firmware using:
> `MOTOR_ACTIVE_LOW`, `LED_ACTIVE_LOW`, and `CH_ACTIVE_LOW`.
> If dashboard toggle changes Firebase but hardware does not switch, check these flags first.


## Troubleshooting: Dashboard not receiving data / controls not working

If the dashboard loads but cannot read/write Firebase values (for example LED toggle does nothing), check these first:

1. **Auth + Rules mismatch**
   - This app now signs in using Firebase Auth on the client.
   - If `NEXT_PUBLIC_FIREBASE_AUTH_EMAIL` and `NEXT_PUBLIC_FIREBASE_AUTH_PASSWORD` are set, it uses email/password.
   - Otherwise it uses anonymous auth.
   - Your Realtime Database rules must allow whichever auth method you use.

2. **Database URL and region**
   - Ensure `NEXT_PUBLIC_FIREBASE_DATABASE_URL` points to the exact RTDB instance your ESP8266 writes to.

3. **Path contract**
   - Device writes: `/plants/plant1/sensors/soilMoisture` (number 0-100)
   - Dashboard writes controls under `/plants/plant1/control/*`

4. **Firmware credentials**
   - ESP8266 Firebase user/project and web app Firebase project must be the same project.
5. **Requests hanging / UI stuck on initializing**
   - The dashboard now times out Firebase requests after ~10 seconds and shows the timeout message.
   - If you see timeout errors, check network access, Firebase rules, and auth method.
6. **LED toggle updates in Firebase but LED stays OFF**
   - Verify `LED_PIN` wiring and common ground.
   - In firmware, set `LED_ACTIVE_LOW` correctly for your driver board.
   - If using built-in ESP8266 LED, logic is often active-low.
7. **Only `plant1/sensors/*` keeps updating repeatedly**
   - This is expected for live telemetry (`soilMoisture` + timestamp every interval).
   - If `control` is missing, reboot ESP8266 once after flashing latest firmware; it now auto-creates control keys.


## Quick Verification (5 minutes)

1. Power on ESP8266 and open Serial Monitor at `115200`.
2. Open Firebase Realtime Database and watch `/plants/plant1` live.
3. Open web dashboard and confirm header shows `Firebase session: authenticated`.
4. In dashboard `Connection / Debug` card, click **Initialize Firebase Paths** once.
5. Toggle **LED Grow Light** ON/OFF in dashboard:
   - Firebase `/plants/plant1/control/LED` should change immediately.
   - ESP8266 relay on `LED_PIN` should switch.
6. Toggle **Water Pump** ON/OFF:
   - Firebase `/plants/plant1/control/motor` should change.
   - ESP8266 relay on `MOTOR_PIN` should switch.
7. Confirm soil moisture card updates every ~10 seconds from firmware writes.

If step 3 fails (not authenticated), re-check `.env.local` auth variables and RTDB rules.
