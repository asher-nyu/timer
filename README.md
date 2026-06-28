# Timer

A simple timer app built with Vue 3, TypeScript, and Vite.

The app keeps the original timer design and behavior: editable title, hour/minute/second inputs, start/pause/resume/restart controls, circular progress, alarm audio, vibration support, and a completion popup.

When browser notifications are allowed, the app also sends a system notification when the timer finishes. Permission is only requested once per browser/site origin.

## Setup

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Build for production:

```sh
npm run build
```

Preview the production build:

```sh
npm run preview
```

## Project Structure

```text
.
├── index.html
├── alarm.mp3
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── public
│   └── timer-sw.js
└── src
    ├── App.vue
    ├── main.ts
    └── vite-env.d.ts
```

## Notes

- The favicon is defined as an inline SVG data URL in `index.html`.
- The timer UI, logic, and styles live in `src/App.vue`.
- `alarm.mp3` is bundled by Vite and used when the timer finishes.
- The app asks for notification permission on first load when the browser permission is still unset. Safari requires a user gesture for this prompt, so Safari asks from the first interaction, such as pressing Start.
- When permission is granted, the app uses `timer-sw.js` to show a finish notification and plays `alarm.mp3`.
- The system notification is silent, so the alarm sound only comes from `alarm.mp3`.
- The MP3 is prepared from the Start/Restart click, but playback only starts when the timer finishes.
- Clicking the notification or Safari's Show button focuses the timer and stops the alarm sound.
- When permission is denied or unavailable, the app still plays the alarm sound and shows the in-page popup.
- The notification requests persistent alert behavior, but macOS/Safari decides whether it appears as a temporary banner or persistent alert. Use macOS notification settings for Safari to choose the alert style.
- If no notification appears after permission is granted, check Safari's website notification permissions and macOS notification settings for Safari.
