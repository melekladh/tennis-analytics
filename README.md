# Tennis Analytics

A browser-based tennis match analysis website that lets a user upload a match video, runs MediaPipe Pose tracking, and summarizes player movement and form metrics.

## Features

- Upload tennis video file
- MediaPipe Pose detection overlay on the athlete
- Analytics cards for:
  - court coverage
  - average movement speed
  - stroke count estimate
  - motion time
  - posture score
- Real-time pose overlay on the video canvas
- Responsive UI for local testing and demos

## Run locally

```bash
npm install
npm start
```

Then open:

http://localhost:3000

## Tech stack

- Node.js + Express
- HTML/CSS/JavaScript
- MediaPipe Pose Landmarker via browser CDN

## Notes

This is a lightweight prototype intended for local demo use. For production quality, you would add:

- server-side video processing
- athlete tracking and multi-player support
- shot classification and event timing
- persistent storage and historical reports
