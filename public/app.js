const video = document.getElementById('video');
const uploadInput = document.getElementById('videoUpload');
const analyzeBtn = document.getElementById('analyzeBtn');
const statusText = document.getElementById('statusText');
const frameCounter = document.getElementById('frameCounter');
const coverageValue = document.getElementById('coverageValue');
const speedValue = document.getElementById('speedValue');
const strokeValue = document.getElementById('strokeValue');
const motionTimeValue = document.getElementById('motionTimeValue');
const postureValue = document.getElementById('postureValue');
const poseValue = document.getElementById('poseValue');
const coachNotes = document.getElementById('coachNotes');
const canvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d');

const landmarksConfig = {
  bodyCenter: [23, 24],
  shoulders: [11, 12],
  hips: [23, 24],
  knees: [25, 26],
  elbows: [13, 14],
  wrists: [15, 16],
  ankles: [27, 28],
};

const analysisState = {
  poseLandmarker: null,
  isAnalyzing: false,
  frameCount: 0,
  sampleIntervals: [],
  motionSeconds: 0,
  maxMovementDistance: 0,
  totalMovementDistance: 0,
  strokeCount: 0,
  lastHipCenter: null,
  lastFrameTime: 0,
  lastMovementSpeed: 0,
};

function setStatus(message) {
  statusText.textContent = message;
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawSkeleton(landmarks) {
  clearCanvas();

  const width = video.videoWidth || 960;
  const height = video.videoHeight || 540;
  canvas.width = width;
  canvas.height = height;

  if (!landmarks || landmarks.length === 0) {
    return;
  }

  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
    [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [12, 14],
    [14, 16], [16, 18], [16, 20], [11, 23], [12, 24], [23, 25], [25, 27],
    [27, 29], [29, 31], [24, 26], [26, 28], [28, 30], [30, 32], [23, 24]
  ];

  ctx.fillStyle = '#3ddc97';
  ctx.strokeStyle = '#74a8ff';
  ctx.lineWidth = 2.5;

  for (const [fromIdx, toIdx] of connections) {
    const start = landmarks[fromIdx];
    const end = landmarks[toIdx];
    if (!start || !end) continue;

    ctx.beginPath();
    ctx.moveTo(start.x * width, start.y * height);
    ctx.lineTo(end.x * width, end.y * height);
    ctx.stroke();
  }

  for (const point of landmarks) {
    if (!point) continue;
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function getAveragePoint(points) {
  const valid = points.filter(Boolean);
  if (valid.length === 0) return null;

  const x = valid.reduce((sum, p) => sum + p.x, 0) / valid.length;
  const y = valid.reduce((sum, p) => sum + p.y, 0) / valid.length;
  return { x, y };
}

function getLandmarkPoint(landmarks, index) {
  return landmarks?.[index] || null;
}

function distance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function computeMetrics(landmarks) {
  const shoulderCenter = getAveragePoint(landmarksConfig.shoulders.map((index) => getLandmarkPoint(landmarks, index)));
  const hipCenter = getAveragePoint(landmarksConfig.hips.map((index) => getLandmarkPoint(landmarks, index)));
  const leftKnee = getLandmarkPoint(landmarks, 25);
  const rightKnee = getLandmarkPoint(landmarks, 26);
  const leftWrist = getLandmarkPoint(landmarks, 15);
  const rightWrist = getLandmarkPoint(landmarks, 16);
  const leftElbow = getLandmarkPoint(landmarks, 13);
  const rightElbow = getLandmarkPoint(landmarks, 14);

  if (!shoulderCenter || !hipCenter) {
    return null;
  }

  const shoulderHipDistance = distance(shoulderCenter, hipCenter);
  const stanceWidth = distance(getLandmarkPoint(landmarks, 11), getLandmarkPoint(landmarks, 12));

  const kneeDistance = distance(leftKnee, rightKnee);
  const wristSwingVelocity = Math.max(
    distance(leftWrist, leftElbow) + distance(rightWrist, rightElbow),
    0
  );

  const postureValue = clamp(100 - (Math.abs(shoulderHipDistance - 0.15) * 600 + Math.abs(kneeDistance - 0.12) * 260), 0, 100);
  const movementScore = clamp((stanceWidth * 100) + (kneeDistance * 150), 0, 100);

  return {
    shoulderCenter,
    hipCenter,
    postureValue: Math.round(postureValue),
    movementScore: Math.round(movementScore),
    wristSwingVelocity,
  };
}

function updateSummary() {
  coverageValue.textContent = `${Math.round((analysisState.maxMovementDistance / 1.8) * 100 || 0)}%`;
  speedValue.textContent = `${(analysisState.totalMovementDistance / Math.max(analysisState.motionSeconds, 1)).toFixed(2)} m/s`;
  strokeValue.textContent = Math.round(analysisState.strokeCount);
  motionTimeValue.textContent = `${analysisState.motionSeconds.toFixed(1)}s`;
  postureValue.textContent = `${Math.round(analysisState.lastMovementSpeed * 100 || 0)}/100`;
  frameCounter.textContent = analysisState.frameCount;

  if (analysisState.strokeCount > 0) {
    coachNotes.textContent = 'The athlete is showing active movement patterns and repeated swing preparation. Keep an eye on lateral movement and racket acceleration.';
  } else {
    coachNotes.textContent = 'Pose detection is active, but the clip may be too static or too low resolution for stroke identification.';
  }
}

function resetMetrics() {
  analysisState.frameCount = 0;
  analysisState.sampleIntervals = [];
  analysisState.motionSeconds = 0;
  analysisState.maxMovementDistance = 0;
  analysisState.totalMovementDistance = 0;
  analysisState.strokeCount = 0;
  analysisState.lastHipCenter = null;
  analysisState.lastFrameTime = 0;
  analysisState.lastMovementSpeed = 0;
  updateSummary();
}

async function setupPoseDetection() {
  if (analysisState.poseLandmarker) return;

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
  );

  analysisState.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

function onVideoLoaded() {
  const width = video.videoWidth || 960;
  const height = video.videoHeight || 540;
  canvas.width = width;
  canvas.height = height;
  setStatus('Ready to analyze');
  analyzeBtn.disabled = false;
}

uploadInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  video.load();
  resetMetrics();
  setStatus('Video loaded');
  poseValue.textContent = '0';
  analyzeBtn.disabled = false;
});

analyzeBtn.addEventListener('click', async () => {
  if (!video.src) {
    setStatus('Please upload a video first');
    return;
  }

  if (!analysisState.poseLandmarker) {
    setStatus('Loading MediaPipe Pose...');
    try {
      await setupPoseDetection();
    } catch (error) {
      console.error(error);
      setStatus('Pose model failed to load');
      return;
    }
  }

  resetMetrics();
  analysisState.isAnalyzing = true;
  video.currentTime = 0;
  video.play();
  setStatus('Analyzing match...');

  const processFrame = () => {
    if (!analysisState.isAnalyzing || video.ended) {
      analysisState.isAnalyzing = false;
      const summary = `${Math.round(analysisState.strokeCount)} strokes detected across ${analysisState.motionSeconds.toFixed(1)} seconds of movement.`;
      coachNotes.textContent = summary;
      setStatus('Analysis complete');
      return;
    }

    const timestampMs = performance.now();
    const result = analysisState.poseLandmarker.detectForVideo(video, timestampMs);
    const poses = result.landmarks || [];

    if (poses.length > 0) {
      const landmarks = poses[0];
      drawSkeleton(landmarks);

      const metrics = computeMetrics(landmarks);
      if (metrics && metrics.hipCenter) {
        const currentHipCenter = metrics.hipCenter;
        const deltaTs = analysisState.lastFrameTime ? (timestampMs - analysisState.lastFrameTime) / 1000 : 0.03;

        if (analysisState.lastHipCenter) {
          const movement = distance(currentHipCenter, analysisState.lastHipCenter);
          const speed = (movement / Math.max(deltaTs, 0.03)) * 5.5;
          analysisState.lastMovementSpeed = clamp(speed, 0, 12);

          if (speed > 0.45) {
            analysisState.motionSeconds += deltaTs;
            analysisState.totalMovementDistance += movement;
            analysisState.maxMovementDistance = Math.max(analysisState.maxMovementDistance, movement);
          }

          if (speed > 0.9 && analysisState.lastMovementSpeed < 0.9) {
            analysisState.strokeCount += 1;
          }
        }

        analysisState.lastHipCenter = currentHipCenter;
        analysisState.lastFrameTime = timestampMs;
      }

      poseValue.textContent = poses.length;
      analysisState.frameCount += 1;
    }

    updateSummary();
    requestAnimationFrame(processFrame);
  };

  requestAnimationFrame(processFrame);
});

video.addEventListener('loadedmetadata', onVideoLoaded);
video.addEventListener('pause', () => {
  if (analysisState.isAnalyzing) {
    setStatus('Paused during analysis');
  }
});

analyzeBtn.disabled = true;
window.addEventListener('load', async () => {
  try {
    await setupPoseDetection();
    setStatus('Pose model ready');
  } catch (error) {
    console.error(error);
    setStatus('Unable to load MediaPipe Pose');
  }
});
