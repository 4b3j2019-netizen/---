const playButton = document.querySelector("#play-toggle");
const player = document.querySelector(".player");
const progress = document.querySelector("#progress");
const currentTimeLabel = document.querySelector("#current-time");
const playerStatus = document.querySelector("#player-status");

const trackDuration = 24;
const beatDuration = 0.5;
const melody = [
  392, 440, 523.25, 659.25, 587.33, 523.25, 440, 392,
  349.23, 392, 440, 523.25, 493.88, 440, 392, 349.23,
  392, 440, 523.25, 783.99, 659.25, 587.33, 523.25, 440,
  349.23, 392, 440, 523.25, 587.33, 523.25, 440, 392
];
const chords = [
  [146.83, 174.61, 220],
  [130.81, 164.81, 196],
  [110, 130.81, 164.81],
  [123.47, 146.83, 185]
];

let audioContext;
let playbackBus;
let startContextTime = 0;
let pausedAt = 0;
let isPlaying = false;
let hasScheduledAudio = false;
let progressTimer;

function formatTime(seconds) {
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function setPlaybackState(playing) {
  isPlaying = playing;
  playButton.classList.toggle("is-playing", playing);
  player.classList.toggle("is-playing", playing);
  playButton.setAttribute("aria-pressed", String(playing));
  playButton.setAttribute("aria-label", playing ? "暫停試聽" : "播放試聽");
  playerStatus.textContent = playing
    ? "正在播放合成旋律示範。"
    : pausedAt > 0
      ? "試聽已暫停。"
      : "按下播放，聽聽這段合成的旋律示範。";
}

function getCurrentPosition() {
  if (!isPlaying || !audioContext) {
    return pausedAt;
  }
  return Math.min(trackDuration, pausedAt + Math.max(0, audioContext.currentTime - startContextTime));
}

function updateProgress() {
  const position = getCurrentPosition();
  progress.value = String(position);
  progress.style.setProperty("--progress", `${(position / trackDuration) * 100}%`);
  currentTimeLabel.textContent = formatTime(position);

  if (position >= trackDuration) {
    pausedAt = 0;
    playbackBus.disconnect();
    playbackBus = undefined;
    hasScheduledAudio = false;
    window.clearInterval(progressTimer);
    setPlaybackState(false);
    updateProgress();
  }
}

function scheduleTone(frequency, eventTime, length, waveform, volume, offset, baseTime) {
  const eventEnd = Math.min(trackDuration, eventTime + length);
  if (eventEnd <= offset) {
    return;
  }

  const eventStart = Math.max(eventTime, offset);
  const startAt = baseTime + Math.max(0, eventTime - offset);
  const duration = eventEnd - eventStart;
  const oscillator = audioContext.createOscillator();
  const envelope = audioContext.createGain();

  oscillator.type = waveform;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.exponentialRampToValueAtTime(volume, startAt + Math.min(0.035, duration / 3));
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(envelope);
  envelope.connect(playbackBus);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

async function startPreview(offset = pausedAt) {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  if (playbackBus) {
    playbackBus.disconnect();
  }
  playbackBus = audioContext.createGain();
  playbackBus.gain.setValueAtTime(0.45, audioContext.currentTime);
  playbackBus.connect(audioContext.destination);

  const baseTime = audioContext.currentTime + 0.06;
  Array.from({ length: 48 }, (_, beat) => melody[beat % melody.length]).forEach((frequency, beat) => {
    scheduleTone(frequency, beat * beatDuration, 0.34, "triangle", 0.16, offset, baseTime);
  });
  Array.from({ length: 12 }, (_, measure) => chords[measure % chords.length]).forEach((chord, measure) => {
    chord.forEach((frequency) => {
      scheduleTone(frequency, measure * 2, 1.88, "sine", 0.045, offset, baseTime);
    });
  });

  pausedAt = offset;
  startContextTime = baseTime;
  hasScheduledAudio = true;
  setPlaybackState(true);
  window.clearInterval(progressTimer);
  progressTimer = window.setInterval(updateProgress, 100);
  updateProgress();
}

async function togglePlayback() {
  playButton.disabled = true;
  try {
    if (isPlaying) {
      pausedAt = getCurrentPosition();
      await audioContext.suspend();
      window.clearInterval(progressTimer);
      setPlaybackState(false);
      updateProgress();
    } else if (hasScheduledAudio && audioContext.state === "suspended") {
      startContextTime = audioContext.currentTime;
      await audioContext.resume();
      setPlaybackState(true);
      progressTimer = window.setInterval(updateProgress, 100);
    } else {
      await startPreview(pausedAt);
    }
  } catch (error) {
    playerStatus.textContent = "瀏覽器無法啟動音訊，請確認音效設定後再試一次。";
    console.error("無法播放合成試聽音訊。", error);
  } finally {
    playButton.disabled = false;
  }
}

playButton.addEventListener("click", togglePlayback);

progress.addEventListener("input", () => {
  pausedAt = Number(progress.value);
  progress.style.setProperty("--progress", `${(pausedAt / trackDuration) * 100}%`);
  currentTimeLabel.textContent = formatTime(pausedAt);
  if (isPlaying) {
    startPreview(pausedAt).catch((error) => {
      playerStatus.textContent = "瀏覽器無法調整試聽進度，請確認音效設定後再試一次。";
      console.error("無法調整合成試聽進度。", error);
    });
  } else {
    if (playbackBus) {
      playbackBus.disconnect();
      playbackBus = undefined;
    }
    hasScheduledAudio = false;
    setPlaybackState(false);
  }
});