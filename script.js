let state = "idle";
let timerInterval = null;
let totalSeconds = 0;
let remainingSeconds = 0;
let lastSetSeconds = 60;
let circumference = 0;
let progressCircle;
let alarmAudio = null;

const timeDisplay = document.getElementById("timeDisplay");
const inputsContainer = document.getElementById("inputs");
const startPauseButton = document.getElementById("startPauseButton");
const cancelButton = document.getElementById("cancelButton");
const footerHint = document.getElementById("footerHint");
const timerCircle = document.getElementById("timerCircle");
const hoursInput = document.getElementById("hoursInput");
const minutesInput = document.getElementById("minutesInput");
const secondsInput = document.getElementById("secondsInput");
const timerLabel = document.getElementById("timerLabel");
const timerPopup = document.getElementById("timerPopup");
const stopButton = document.getElementById("stopButton");

function pad(num) {
    return String(num).padStart(2, "0");
}

function computeSecondsFromInputs() {
    function parseField(el, max) {
        let v = el.value.trim();
        if (v === "") return 0;
        let n = parseInt(v, 10);
        if (isNaN(n) || n < 0) n = 0;
        if (n > max) n = max;

        el.value = pad(n);

        return n;
    }

    const h = parseField(hoursInput, 23);
    const m = parseField(minutesInput, 59);
    const s = parseField(secondsInput, 59);
    return h * 3600 + m * 60 + s;
}

function normalizeInputsFromSeconds(seconds) {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    hoursInput.value = pad(Math.min(h, 23));
    minutesInput.value = pad(Math.min(m, 59));
    secondsInput.value = pad(Math.min(s, 59));
}

function updateDisplay(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    timeDisplay.textContent = pad(h) + ":" + pad(m) + ":" + pad(s);
}

function setProgress(progress) {
    if (!progressCircle || !circumference) return;
    if (progress < 0) progress = 0;
    if (progress > 1) progress = 1;
    progressCircle.style.strokeDashoffset = `${circumference * (1 - progress)}`;
}

function applyStateClasses() {
    document.body.classList.toggle("timer-running", state === "running");
    document.body.classList.toggle("timer-finished", state === "finished");
}

function updateControls() {
    if (state === "idle") {
        startPauseButton.textContent = "Start";
        startPauseButton.classList.toggle("disabled", computeSecondsFromInputs() === 0);
        cancelButton.disabled = true;
        inputsContainer.style.display = "flex";
        timerCircle.style.display = "none";
        footerHint.textContent = "Set a time, then tap Start.";
    } else if (state === "running") {
        startPauseButton.textContent = "Pause";
        startPauseButton.classList.remove("disabled");
        cancelButton.disabled = false;
        inputsContainer.style.display = "none";
        timerCircle.style.display = "block";
        footerHint.textContent = "Timer is running.";
    } else if (state === "paused") {
        startPauseButton.textContent = "Resume";
        startPauseButton.classList.remove("disabled");
        cancelButton.disabled = false;
        inputsContainer.style.display = "flex";
        timerCircle.style.display = "none";
        footerHint.textContent = "Timer is paused.";
    } else if (state === "finished") {
        startPauseButton.textContent = "Restart";
        startPauseButton.classList.remove("disabled");
        cancelButton.disabled = false;
        inputsContainer.style.display = "flex";
        timerCircle.style.display = "none";
        footerHint.textContent = "Time’s up.";
    }

    const canEditLabel = (state !== "running");
    timerLabel.contentEditable = canEditLabel ? "true" : "false";
    timerLabel.classList.toggle("disabled", !canEditLabel);

    applyStateClasses();
}

function stopInterval() {
    if (timerInterval !== null) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function stopAlarm() {
    if (alarmAudio) {
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
        alarmAudio = null;
    }
    if (navigator.vibrate) {
        navigator.vibrate(0);
    }
    timerPopup.style.display = "none";
}

function playTone() {
    alarmAudio = new Audio('alarm.mp3');
    alarmAudio.loop = true;
    alarmAudio.play().then(() => {
    });
    if (navigator.vibrate) {
        navigator.vibrate([1000, 300, 1000, 300, 1000]);
    }
}

function finishTimer() {
    stopInterval();
    remainingSeconds = 0;
    updateDisplay(0);
    setProgress(1);
    normalizeInputsFromSeconds(lastSetSeconds);
    state = "finished";
    updateControls();
    playTone();
    timerPopup.style.display = "flex";
}

function startCountdown(fromSeconds, baseTotal) {
    totalSeconds = baseTotal;
    remainingSeconds = fromSeconds;
    if (totalSeconds <= 0) return;
    const totalMs = totalSeconds * 1000;
    const startTime = Date.now();
    const endTime = startTime + remainingSeconds * 1000;
    stopInterval();
    timerInterval = setInterval(function () {
        const now = Date.now();
        const diff = endTime - now;
        const clampedDiff = Math.max(0, diff);
        const newRemaining = Math.ceil(clampedDiff / 1000);
        if (newRemaining !== remainingSeconds) {
            remainingSeconds = newRemaining;
            updateDisplay(remainingSeconds);
        }
        const elapsedMs = totalMs - clampedDiff;
        const progress = elapsedMs / totalMs;
        setProgress(progress);
        if (clampedDiff <= 0) {
            finishTimer();
        }
    }, 30);
    state = "running";
    updateControls();
}

function startFromInputs() {
    const seconds = computeSecondsFromInputs();
    if (seconds <= 0) {
        normalizeInputsFromSeconds(0);
        updateControls();
        return;
    }
    lastSetSeconds = seconds;
    normalizeInputsFromSeconds(seconds);
    updateDisplay(seconds);
    setProgress(0);
    startCountdown(seconds, seconds);
}

function resumeTimer() {
    if (remainingSeconds <= 0) {
        finishTimer();
        return;
    }
    startCountdown(remainingSeconds, totalSeconds);
}

function restartTimer() {
    const seconds = lastSetSeconds > 0 ? lastSetSeconds : computeSecondsFromInputs();
    if (seconds <= 0) {
        state = "idle";
        setProgress(0);
        normalizeInputsFromSeconds(0);
        updateDisplay(0);
        updateControls();
        return;
    }
    normalizeInputsFromSeconds(seconds);
    updateDisplay(seconds);
    setProgress(0);
    startCountdown(seconds, seconds);
}

function cancelTimer() {
    stopInterval();
    state = "idle";
    const seconds = computeSecondsFromInputs();
    normalizeInputsFromSeconds(seconds);
    updateDisplay(seconds);
    setProgress(0);
    updateControls();
}

document.addEventListener("DOMContentLoaded", function () {
    progressCircle = document.querySelector(".timer-progress");
    if (progressCircle) {
        const radius = progressCircle.r.baseVal.value;
        circumference = 2 * Math.PI * radius;
        progressCircle.style.strokeDasharray = circumference + " " + circumference;
        progressCircle.style.strokeDashoffset = circumference;
    }
    normalizeInputsFromSeconds(60);
    updateDisplay(computeSecondsFromInputs());
    setProgress(0);
    updateControls();

    [hoursInput, minutesInput, secondsInput].forEach(function (input) {

        input.addEventListener("focus", function () {
            this.select();
        });

        input.addEventListener("mouseup", function (e) {
            e.preventDefault();
        });

        input.addEventListener("input", function () {
            this.value = this.value.replace(/[^\d]/g, "");
            const secs = computeSecondsFromInputs();
            updateDisplay(secs);
            if (secs > 0) {
                lastSetSeconds = secs;
            }
            updateControls();
        });
    });

    timerLabel.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            this.blur();
        }
    });

    timerLabel.addEventListener("focus", function () {
        if (!timerLabel.isContentEditable) return;

        const range = document.createRange();
        range.selectNodeContents(timerLabel);

        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    });

    timerLabel.addEventListener("mousedown", function (e) {
        if (!timerLabel.isContentEditable) return;

        e.preventDefault();
        timerLabel.focus();
    });

    startPauseButton.addEventListener("click", function () {
        if (startPauseButton.classList.contains("disabled") && state === "idle") {
            return;
        }
        if (state === "idle") {
            startFromInputs();
        } else if (state === "running") {
            stopInterval();
            state = "paused";
            normalizeInputsFromSeconds(remainingSeconds);
            updateControls();
        } else if (state === "paused") {
            resumeTimer();
        } else if (state === "finished") {
            restartTimer();
        }
    });

    cancelButton.addEventListener("click", function () {
        if (state === "idle") return;
        cancelTimer();
    });

    stopButton.addEventListener("click", function () {
        stopAlarm();
    });
});