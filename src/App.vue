<template>
    <div
        class="app"
        :data-alarm-playing="alarmPlaying ? 'true' : 'false'"
        :data-alarm-blocked="alarmPlayBlocked ? 'true' : 'false'"
    >
        <div
            id="timerLabel"
            class="timer-title"
            :class="{ disabled: !canEditLabel }"
            :contenteditable="canEditLabel ? 'true' : 'false'"
            spellcheck="false"
            @focus="selectTimerLabel"
            @input="updateTimerLabel"
            @keydown.enter.prevent="blurCurrentTarget"
            @mousedown="focusTimerLabel"
        >{{ timerLabel }}</div>

        <div id="timerCircle" class="timer-circle" v-show="showTimerCircle">
            <svg viewBox="0 0 240 240">
                <circle class="timer-track" cx="120" cy="120" r="100"></circle>
                <circle
                    ref="progressCircle"
                    class="timer-progress"
                    cx="120"
                    cy="120"
                    r="100"
                    :style="progressCircleStyle"
                ></circle>
            </svg>
            <div class="timer-inner-circle">
                <div id="timeDisplay" class="time-display">{{ formattedTime }}</div>
            </div>
        </div>

        <div id="inputs" class="inputs" v-show="showInputs">
            <div class="input-group">
                <div class="input-label">HOURS</div>
                <label for="hoursInput"></label><input
                    id="hoursInput"
                    autocomplete="off"
                    class="time-input"
                    inputmode="numeric"
                    type="text"
                    :value="hoursInput"
                    @focus="selectInput"
                    @input="handleTimeInput('hoursInput', $event)"
                    @mouseup.prevent
                >
            </div>
            <div class="input-group">
                <div class="input-label">MINUTES</div>
                <label for="minutesInput"></label><input
                    id="minutesInput"
                    autocomplete="off"
                    class="time-input"
                    inputmode="numeric"
                    type="text"
                    :value="minutesInput"
                    @focus="selectInput"
                    @input="handleTimeInput('minutesInput', $event)"
                    @mouseup.prevent
                >
            </div>
            <div class="input-group">
                <div class="input-label">SECONDS</div>
                <label for="secondsInput"></label><input
                    id="secondsInput"
                    autocomplete="off"
                    class="time-input"
                    inputmode="numeric"
                    type="text"
                    :value="secondsInput"
                    @focus="selectInput"
                    @input="handleTimeInput('secondsInput', $event)"
                    @mouseup.prevent
                >
            </div>
        </div>

        <div class="controls">
            <button
                id="cancelButton"
                class="control-button cancel-button"
                :disabled="state === 'idle'"
                @click="cancelTimer"
            >Cancel</button>
            <button
                id="startPauseButton"
                class="control-button start-button"
                :class="{ disabled: startButtonDisabled }"
                @click="handleStartPause"
            >{{ startPauseText }}</button>
        </div>

        <div id="footerHint" class="footer-hint">{{ footerHint }}</div>

        <div id="timerPopup" class="timer-popup" :style="{ display: popupVisible ? 'flex' : 'none' }">
            <div class="popup-content">
                <div class="popup-title">Time’s Up!</div>
                <button id="stopButton" class="popup-button" @click="stopAlarm">OK</button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CSSProperties } from "vue";

type TimerState = "idle" | "running" | "paused" | "finished";
type TimeField = "hoursInput" | "minutesInput" | "secondsInput";
type TimerNotificationOptions = NotificationOptions & {
    renotify?: boolean;
};

const state = ref<TimerState>("idle");
const timerInterval = ref<number | null>(null);
const totalSeconds = ref(0);
const remainingSeconds = ref(0);
const lastSetSeconds = ref(60);
const circumference = ref(0);
const progress = ref(0);
const alarmAudio = ref<HTMLAudioElement | null>(null);
const alarmPlaying = ref(false);
const alarmPlayBlocked = ref(false);
const activeNotification = ref<Notification | null>(null);
const serviceWorkerRegistration = ref<ServiceWorkerRegistration | null>(null);
const notificationPermission = ref<NotificationPermission | "unsupported">(getCurrentNotificationPermission());
const notificationGestureRequestStarted = ref(false);
const popupVisible = ref(false);
const timerLabel = ref("TIMER");
const hoursInput = ref("00");
const minutesInput = ref("01");
const secondsInput = ref("00");
const displaySeconds = ref(60);
const progressCircle = ref<SVGCircleElement | null>(null);
const alarmUrl = new URL("../alarm.mp3", import.meta.url).href;

const formattedTime = computed(() => formatTime(displaySeconds.value));

const progressCircleStyle = computed<CSSProperties>(() => ({
    strokeDasharray: `${circumference.value} ${circumference.value}`,
    strokeDashoffset: `${circumference.value * (1 - progress.value)}`
}));

const inputSeconds = computed(() => {
    const h = getClampedValue(hoursInput.value, 23);
    const m = getClampedValue(minutesInput.value, 59);
    const s = getClampedValue(secondsInput.value, 59);
    return h * 3600 + m * 60 + s;
});

const showInputs = computed(() => state.value !== "running");
const showTimerCircle = computed(() => state.value === "running");
const canEditLabel = computed(() => state.value !== "running");
const startButtonDisabled = computed(() => state.value === "idle" && inputSeconds.value === 0);

const startPauseText = computed(() => {
    if (state.value === "running") return "Pause";
    if (state.value === "paused") return "Resume";
    if (state.value === "finished") return "Restart";
    return "Start";
});

const footerHint = computed(() => {
    if (state.value === "running") return "Timer is running.";
    if (state.value === "paused") return "Timer is paused.";
    if (state.value === "finished") return "Time’s up.";
    return "Set a time, then tap Start.";
});

watch(state, applyStateClasses);

onMounted(() => {
    setCircleMetrics();
    normalizeInputsFromSeconds(60);
    updateDisplay(computeSecondsFromInputs());
    setProgress(0);
    applyStateClasses();
    registerNotificationWorker();
    addNotificationMessageListener();
    addAlarmFocusListeners();
    addNotificationGesturePermissionListeners();
    void requestInitialNotificationPermission();
});

onBeforeUnmount(() => {
    stopInterval();
    stopAlarm();
    closeActiveNotification();
    removeNotificationMessageListener();
    removeAlarmFocusListeners();
    removeNotificationGesturePermissionListeners();
});

function pad(num: number): string {
    return String(num).padStart(2, "0");
}

function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return pad(h) + ":" + pad(m) + ":" + pad(s);
}

function getClampedValue(value: string, max: number): number {
    const v = value.trim();
    if (v === "") return 0;
    let n = parseInt(v, 10);
    if (isNaN(n) || n < 0) n = 0;
    if (n > max) n = max;
    return n;
}

function parseField(field: TimeField, max: number): number {
    const n = getClampedValue(getFieldValue(field).value, max);
    getFieldValue(field).value = pad(n);
    return n;
}

function computeSecondsFromInputs(): number {
    const h = parseField("hoursInput", 23);
    const m = parseField("minutesInput", 59);
    const s = parseField("secondsInput", 59);
    return h * 3600 + m * 60 + s;
}

function normalizeInputsFromSeconds(seconds: number): void {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    hoursInput.value = pad(Math.min(h, 23));
    minutesInput.value = pad(Math.min(m, 59));
    secondsInput.value = pad(Math.min(s, 59));
}

function updateDisplay(seconds: number): void {
    displaySeconds.value = seconds;
}

function setProgress(nextProgress: number): void {
    if (nextProgress < 0) nextProgress = 0;
    if (nextProgress > 1) nextProgress = 1;
    progress.value = nextProgress;
}

function setCircleMetrics(): void {
    if (!progressCircle.value) return;
    const radius = progressCircle.value.r.baseVal.value;
    circumference.value = 2 * Math.PI * radius;
}

function applyStateClasses(): void {
    document.body.classList.toggle("timer-running", state.value === "running");
    document.body.classList.toggle("timer-finished", state.value === "finished");
}

function stopInterval(): void {
    if (timerInterval.value !== null) {
        window.clearInterval(timerInterval.value);
        timerInterval.value = null;
    }
}

function stopAlarm(): void {
    alarmPlaying.value = false;
    alarmPlayBlocked.value = false;
    if (alarmAudio.value) {
        alarmAudio.value.pause();
        alarmAudio.value.currentTime = 0;
        alarmAudio.value = null;
    }
    if (navigator.vibrate) {
        navigator.vibrate(0);
    }
    closeActiveNotification();
    popupVisible.value = false;
}

function playTone(): void {
    const audio = prepareAlarmAudio();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
    audio.muted = false;
    audio.loop = true;
    audio.play().then(() => {
        alarmPlaying.value = true;
        alarmPlayBlocked.value = false;
    }).catch(() => {
        alarmPlaying.value = false;
        alarmPlayBlocked.value = true;
    });
    if (navigator.vibrate) {
        navigator.vibrate([1000, 300, 1000, 300, 1000]);
    }
}

function prepareAlarmAudio(): HTMLAudioElement {
    if (alarmAudio.value) return alarmAudio.value;

    const audio = new Audio(alarmUrl);
    audio.loop = true;
    audio.preload = "auto";
    alarmAudio.value = audio;
    audio.load();

    return audio;
}

function finishTimer(): void {
    stopInterval();
    remainingSeconds.value = 0;
    updateDisplay(0);
    setProgress(1);
    normalizeInputsFromSeconds(lastSetSeconds.value);
    state.value = "finished";
    void showTimerNotification();
    playTone();
    popupVisible.value = true;
}

function startCountdown(fromSeconds: number, baseTotal: number): void {
    totalSeconds.value = baseTotal;
    remainingSeconds.value = fromSeconds;
    if (totalSeconds.value <= 0) return;
    const totalMs = totalSeconds.value * 1000;
    const startTime = Date.now();
    const endTime = startTime + remainingSeconds.value * 1000;
    stopInterval();
    timerInterval.value = window.setInterval(() => {
        const now = Date.now();
        const diff = endTime - now;
        const clampedDiff = Math.max(0, diff);
        const newRemaining = Math.ceil(clampedDiff / 1000);
        if (newRemaining !== remainingSeconds.value) {
            remainingSeconds.value = newRemaining;
            updateDisplay(remainingSeconds.value);
        }
        const elapsedMs = totalMs - clampedDiff;
        const nextProgress = elapsedMs / totalMs;
        setProgress(nextProgress);
        if (clampedDiff <= 0) {
            finishTimer();
        }
    }, 30);
    state.value = "running";
}

function startFromInputs(): void {
    const seconds = computeSecondsFromInputs();
    if (seconds <= 0) {
        normalizeInputsFromSeconds(0);
        return;
    }
    lastSetSeconds.value = seconds;
    normalizeInputsFromSeconds(seconds);
    updateDisplay(seconds);
    setProgress(0);
    startCountdown(seconds, seconds);
}

function resumeTimer(): void {
    if (remainingSeconds.value <= 0) {
        finishTimer();
        return;
    }
    startCountdown(remainingSeconds.value, totalSeconds.value);
}

function restartTimer(): void {
    const seconds = lastSetSeconds.value > 0 ? lastSetSeconds.value : computeSecondsFromInputs();
    if (seconds <= 0) {
        state.value = "idle";
        setProgress(0);
        normalizeInputsFromSeconds(0);
        updateDisplay(0);
        return;
    }
    normalizeInputsFromSeconds(seconds);
    updateDisplay(seconds);
    setProgress(0);
    startCountdown(seconds, seconds);
}

function cancelTimer(): void {
    if (state.value === "idle") return;
    stopInterval();
    state.value = "idle";
    const seconds = computeSecondsFromInputs();
    normalizeInputsFromSeconds(seconds);
    updateDisplay(seconds);
    setProgress(0);
}

function handleStartPause(): void {
    if (startButtonDisabled.value && state.value === "idle") {
        return;
    }
    requestNotificationPermissionFromGesture();
    if (state.value === "idle") {
        prepareAlarmAudio();
        startFromInputs();
    } else if (state.value === "running") {
        stopInterval();
        state.value = "paused";
        normalizeInputsFromSeconds(remainingSeconds.value);
    } else if (state.value === "paused") {
        resumeTimer();
    } else if (state.value === "finished") {
        prepareAlarmAudio();
        restartTimer();
    }
}

function handleTimeInput(field: TimeField, event: Event): void {
    const target = event.target as HTMLInputElement;
    getFieldValue(field).value = target.value.replace(/[^\d]/g, "");
    const secs = computeSecondsFromInputs();
    target.value = getFieldValue(field).value;
    updateDisplay(secs);
    if (secs > 0) {
        lastSetSeconds.value = secs;
    }
}

function selectInput(event: FocusEvent): void {
    const target = event.currentTarget as HTMLInputElement;
    target.select();
}

function updateTimerLabel(event: Event): void {
    const target = event.currentTarget as HTMLElement;
    timerLabel.value = target.textContent ?? "";
}

function blurCurrentTarget(event: Event): void {
    const target = event.currentTarget as HTMLElement;
    target.blur();
}

function selectTimerLabel(event: FocusEvent): void {
    const target = event.currentTarget as HTMLElement;
    if (!target.isContentEditable) return;

    const range = document.createRange();
    range.selectNodeContents(target);

    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
}

function focusTimerLabel(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    if (!target.isContentEditable) return;

    event.preventDefault();
    target.focus();
}

function getFieldValue(field: TimeField) {
    if (field === "hoursInput") return hoursInput;
    if (field === "minutesInput") return minutesInput;
    return secondsInput;
}

function supportsNotifications(): boolean {
    return typeof window !== "undefined" && "Notification" in window;
}

function supportsServiceWorkerNotifications(): boolean {
    return typeof navigator !== "undefined"
        && "serviceWorker" in navigator
        && typeof ServiceWorkerRegistration !== "undefined"
        && "showNotification" in ServiceWorkerRegistration.prototype;
}

function getCurrentNotificationPermission(): NotificationPermission | "unsupported" {
    if (!supportsNotifications()) return "unsupported";
    return Notification.permission;
}

function registerNotificationWorker(): void {
    if (!supportsServiceWorkerNotifications()) return;

    void navigator.serviceWorker.register("/timer-sw.js").then((registration) => {
        serviceWorkerRegistration.value = registration;
    }).catch(() => {
        serviceWorkerRegistration.value = null;
    });
}

async function requestInitialNotificationPermission(): Promise<void> {
    if (!supportsNotifications()) return;
    if (Notification.permission !== "default") {
        notificationPermission.value = Notification.permission;
        return;
    }
    if (requiresGestureForNotificationPermission()) return;

    notificationPermission.value = await waitForNotificationPermission();
}

function requiresGestureForNotificationPermission(): boolean {
    if (typeof navigator === "undefined") return false;

    const userAgent = navigator.userAgent;
    const vendor = navigator.vendor;

    return /Safari/i.test(userAgent)
        && /Apple/i.test(vendor)
        && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|OPiOS/i.test(userAgent);
}

function requestNotificationPermissionFromGesture(): void {
    if (!supportsNotifications()) return;
    if (Notification.permission !== "default") {
        notificationPermission.value = Notification.permission;
        return;
    }
    if (notificationGestureRequestStarted.value) return;

    notificationGestureRequestStarted.value = true;
    void waitForNotificationPermission().then((permission) => {
        notificationPermission.value = permission;
    });
}

function waitForNotificationPermission(): Promise<NotificationPermission> {
    return new Promise((resolve) => {
        let settled = false;

        function settle(permission: NotificationPermission): void {
            if (settled) return;
            settled = true;
            resolve(permission);
        }

        try {
            const permissionRequest = Notification.requestPermission((permission) => {
                settle(permission);
            }) as Promise<NotificationPermission> | undefined;

            if (permissionRequest && typeof permissionRequest.then === "function") {
                void permissionRequest.then(settle).catch(() => {
                    settle(Notification.permission);
                });
            }
        } catch {
            settle(Notification.permission);
        }
    });
}

async function showTimerNotification(): Promise<void> {
    if (!supportsNotifications() || Notification.permission !== "granted") return;

    closeActiveNotification();

    const title = timerLabel.value.trim() || "TIMER";
    const options: TimerNotificationOptions = {
        body: title,
        tag: "timer-finished",
        requireInteraction: true,
        renotify: true,
        silent: true
    };

    const registration = await getNotificationRegistration();
    if (registration) {
        await registration.showNotification("Time’s Up!", options).catch(() => {
            showWindowNotification(options);
        });
        notificationPermission.value = Notification.permission;
        return;
    }

    showWindowNotification(options);
}

function showWindowNotification(options: NotificationOptions): void {
    const notification = new Notification("Time’s Up!", options);
    notification.onclick = () => {
        window.focus();
        notification.close();
        stopAlarm();
    };

    activeNotification.value = notification;
    notificationPermission.value = Notification.permission;
}

function closeActiveNotification(): void {
    if (activeNotification.value) {
        activeNotification.value.close();
        activeNotification.value = null;
    }
    void closePersistentNotifications();
}

async function getNotificationRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!supportsServiceWorkerNotifications()) return null;
    if (serviceWorkerRegistration.value) return serviceWorkerRegistration.value;

    try {
        serviceWorkerRegistration.value = await navigator.serviceWorker.ready;
        return serviceWorkerRegistration.value;
    } catch {
        return null;
    }
}

async function closePersistentNotifications(): Promise<void> {
    const registration = await getNotificationRegistration();
    if (!registration || !("getNotifications" in registration)) return;

    const notifications = await registration.getNotifications({ tag: "timer-finished" });
    notifications.forEach((notification) => {
        notification.close();
    });
}

function addNotificationMessageListener(): void {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.addEventListener("message", handleNotificationWorkerMessage);
}

function removeNotificationMessageListener(): void {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.removeEventListener("message", handleNotificationWorkerMessage);
}

function handleNotificationWorkerMessage(event: MessageEvent): void {
    if (event.data?.type !== "timer-notification-clicked") return;
    stopAlarm();
}

function addAlarmFocusListeners(): void {
    window.addEventListener("focus", stopAlarmFromNotificationFocus);
    window.addEventListener("pageshow", stopAlarmFromNotificationFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
}

function removeAlarmFocusListeners(): void {
    window.removeEventListener("focus", stopAlarmFromNotificationFocus);
    window.removeEventListener("pageshow", stopAlarmFromNotificationFocus);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
}

function addNotificationGesturePermissionListeners(): void {
    window.addEventListener("pointerdown", requestNotificationPermissionFromGesture, { capture: true, once: true });
    window.addEventListener("keydown", requestNotificationPermissionFromGesture, { capture: true, once: true });
}

function removeNotificationGesturePermissionListeners(): void {
    window.removeEventListener("pointerdown", requestNotificationPermissionFromGesture, { capture: true });
    window.removeEventListener("keydown", requestNotificationPermissionFromGesture, { capture: true });
}

function handleVisibilityChange(): void {
    if (document.hidden) return;
    stopAlarmFromNotificationFocus();
}

function stopAlarmFromNotificationFocus(): void {
    if (state.value !== "finished") return;
    if (!alarmAudio.value && !popupVisible.value) return;
    stopAlarm();
}
</script>

<style>
html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    background: #000;
    color: #fff;
    font-family: -apple-system, system-ui;
}

body {
    display: flex;
    align-items: center;
    justify-content: center;
}

.app {
    width: 100%;
    max-width: 640px;
    padding: 40px 28px 56px;
    box-sizing: border-box;
}

.timer-title {
    text-align: center;
    font-size: 30px;
    font-weight: 700;
    letter-spacing: 0.14em;
    line-height: 1.15;
    text-transform: uppercase;
    color: #d9d9d9;
    margin-bottom: 22px;
    outline: none;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.06);
}

.timer-title:focus {
    color: #ffffff;
    text-shadow: 0 0 14px rgba(255, 255, 255, 0.12);
}

.timer-title.disabled {
    color: #ffffff;
    cursor: default;
    text-shadow: 0 0 14px rgba(255, 255, 255, 0.10);
}

.timer-circle {
    position: relative;
    width: 440px;
    height: 440px;
    margin: 0 auto;
}

.timer-circle svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
}

.timer-track {
    stroke: #1c1c1e;
    stroke-width: 14;
    fill: none;
}

.timer-progress {
    stroke: #ff9500;
    stroke-width: 14;
    fill: none;
    stroke-linecap: round;
    stroke-dasharray: 0 9999;
    stroke-dashoffset: 0;
    transition: stroke-dashoffset 0.15s linear;
}

.timer-inner-circle {
    position: absolute;
    inset: 60px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #1f1f1f, #000);
    display: flex;
    align-items: center;
    justify-content: center;
}

.time-display {
    font-variant-numeric: tabular-nums;
    font-size: 72px;
    letter-spacing: 0.03em;
}

.timer-running .time-display {
    color: #ff9500;
}

.timer-finished .time-display {
    color: #ff453a;
}

.inputs {
    display: flex;
    justify-content: center;
    gap: 40px;
    margin-top: 40px;
    margin-bottom: 20px;
}

.input-group {
    text-align: center;
}

.input-label {
    font-size: 13px;
    letter-spacing: 0.18em;
    color: #7a7a7a;
    margin-bottom: 10px;
}

.time-input {
    width: 96px;
    height: 68px;
    border-radius: 20px;
    border: 1px solid #303030;
    background: #111111;
    color: #ffffff;
    text-align: center;
    font-size: 28px;
    font-variant-numeric: tabular-nums;
    outline: none;
    box-sizing: border-box;
}

.time-input:focus {
    border-color: #ff9500;
    box-shadow: 0 0 0 2px rgba(255, 149, 0, 0.7);
}

.controls {
    display: flex;
    gap: 26px;
    margin-top: 36px;
    max-width: 480px;
    margin-left: auto;
    margin-right: auto;
}

.control-button {
    flex: 1;
    border-radius: 999px;
    border: none;
    height: 58px;
    font-size: 19px;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
}

.control-button:active {
    transform: scale(0.97);
}

.cancel-button {
    background: #1c1c1e;
    color: #ff453a;
}

.cancel-button:disabled {
    color: #5a5a5a;
    opacity: 0.5;
    cursor: default;
}

.start-button {
    background: #ff9500;
    color: #000;
    font-weight: 600;
    box-shadow: 0 0 34px rgba(255, 149, 0, 0.6);
}

.start-button.disabled {
    opacity: 0.4;
    cursor: default;
    box-shadow: none;
}

.footer-hint {
    margin-top: 22px;
    text-align: center;
    font-size: 14px;
    color: #6d6d6d;
}

.timer-popup {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 10;
}

.popup-content {
    background: #1c1c1e;
    padding: 32px;
    border-radius: 24px;
    text-align: center;
    width: 80%;
    max-width: 320px;
}

.popup-title {
    font-size: 28px;
    color: #ff453a;
    margin-bottom: 24px;
}

.popup-button {
    background: #ff9500;
    color: #000;
    border: none;
    border-radius: 999px;
    padding: 12px 32px;
    font-size: 18px;
    cursor: pointer;
}

@media (max-width: 540px) {
    .app {
        padding: 28px 16px 40px;
    }

    .timer-circle {
        width: 360px;
        height: 360px;
    }

    .timer-inner-circle {
        inset: 48px;
    }

    .time-display {
        font-size: 60px;
    }

    .time-input {
        width: 80px;
        height: 58px;
        font-size: 24px;
    }

    .inputs {
        gap: 24px;
    }
}
</style>
