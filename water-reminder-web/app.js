import {
  auth,
  db,
  doc,
  getDoc,
  onAuthStateChanged,
  provider,
  setDoc,
  signInWithPopup,
  signOut
} from './firebase-web.js';

const STORAGE_KEY = "water-reminder-web-state";
const DEFAULT_STATE = {
  settings: {
    goalMl: 2000,
    amountMl: 250,
    message: "Hora da agua. Beba 250 ml agora.",
    startTime: "08:00",
    endTime: "22:00",
    intervalMin: 1
  },
  daily: {
    consumedMl: 0,
    completed: false,
    dateKey: todayKey(),
    lastReminderAt: null,
    events: []
  },
  history: {},
  account: {
    uid: null,
    email: null,
    displayName: null,
    syncStatus: 'offline'
  },
  ui: {
    viewMode: "daily",
    anchorDate: todayKey(),
    calendarMonth: monthKeyFromDate(new Date())
  }
};

const SVG_NS = "http://www.w3.org/2000/svg";
const elements = {
  settingsForm: document.querySelector("#settingsForm"),
  goalInput: document.querySelector("#goalInput"),
  amountInput: document.querySelector("#amountInput"),
  messageInput: document.querySelector("#messageInput"),
  startInput: document.querySelector("#startInput"),
  endInput: document.querySelector("#endInput"),
  intervalInput: document.querySelector("#intervalInput"),
  consumedValue: document.querySelector("#consumedValue"),
  remainingValue: document.querySelector("#remainingValue"),
  progressBar: document.querySelector("#progressBar"),
  progressText: document.querySelector("#progressText"),
  nextReminderValue: document.querySelector("#nextReminderValue"),
  windowValue: document.querySelector("#windowValue"),
  installButton: document.querySelector("#installButton"),
  notifyButton: document.querySelector("#notifyButton"),
  testButton: document.querySelector("#testButton"),
  androidDownloadButton: document.querySelector("#androidDownloadButton"),
  appleDownloadButton: document.querySelector("#appleDownloadButton"),
  authButton: document.querySelector("#authButton"),
  accountName: document.querySelector("#accountName"),
  accountSync: document.querySelector("#accountSync"),
  drinkButton: document.querySelector("#drinkButton"),
  resetDayButton: document.querySelector("#resetDayButton"),
  resetSettingsButton: document.querySelector("#resetSettingsButton"),
  bootStatus: document.querySelector("#bootStatus"),
  actionStatus: document.querySelector("#actionStatus"),
  permissionStatus: document.querySelector("#permissionStatus"),
  viewModeSelect: document.querySelector("#viewModeSelect"),
  anchorDateInput: document.querySelector("#anchorDateInput"),
  summaryPeriod: document.querySelector("#summaryPeriod"),
  summaryGoal: document.querySelector("#summaryGoal"),
  summaryActual: document.querySelector("#summaryActual"),
  summaryRate: document.querySelector("#summaryRate"),
  barChart: document.querySelector("#barChart"),
  lineChart: document.querySelector("#lineChart"),
  calendarTitle: document.querySelector("#calendarTitle"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarPrevButton: document.querySelector("#calendarPrevButton"),
  calendarNextButton: document.querySelector("#calendarNextButton"),
  toast: document.querySelector("#toast")
};

let state = loadState();
state.account = {
  uid: state.account?.uid ?? null,
  email: state.account?.email ?? null,
  displayName: state.account?.displayName ?? null,
  syncStatus: state.account?.syncStatus ?? 'offline'
};
let toastTimeout = null;
let deferredInstallPrompt = null;

hydrateForm();
hydrateFilters();
refreshState();
bindEvents();
renderAccount();
watchAuthState();
elements.bootStatus.textContent = "App carregado. Botoes prontos.";
window.setInterval(tick, 30 * 1000);
document.addEventListener("visibilitychange", refreshState);
registerPwa();

function bindEvents() {
  elements.settingsForm.addEventListener("submit", handleSaveSettings);
  elements.installButton.addEventListener("click", handleInstallApp);
  elements.notifyButton.addEventListener("click", requestNotifications);
  elements.testButton.addEventListener("click", handleTestReminder);
  elements.androidDownloadButton.addEventListener("click", handleAndroidDownload);
  elements.appleDownloadButton.addEventListener("click", handleAppleDownload);
  elements.authButton.addEventListener("click", handleAuthAction);
  elements.drinkButton.addEventListener("click", registerDrink);
  elements.resetDayButton.addEventListener("click", resetDay);
  elements.resetSettingsButton.addEventListener("click", resetSettings);
  elements.viewModeSelect.addEventListener("change", handleFilterChange);
  elements.anchorDateInput.addEventListener("change", handleFilterChange);
  elements.calendarPrevButton.addEventListener("click", () => changeCalendarMonth(-1));
  elements.calendarNextButton.addEventListener("click", () => changeCalendarMonth(1));
}

function watchAuthState() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      state.account = {
        uid: null,
        email: null,
        displayName: null,
        syncStatus: 'offline'
      };
      saveState();
      renderAccount();
      return;
    }

    state.account = {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || user.email || 'Conta conectada',
      syncStatus: 'syncing'
    };
    saveState();
    renderAccount();

    try {
      await pullRemoteState();
      await pushRemoteState();
      state.account.syncStatus = 'synced';
      saveState();
      renderAccount();
      setActionStatus('Conta web sincronizada.');
    } catch (error) {
      state.account.syncStatus = 'error';
      saveState();
      renderAccount();
      setActionStatus(`Falha na sincronizacao da conta: ${formatError(error)}`);
    }
  });
}

function renderAccount() {
  const connected = Boolean(state.account.uid);
  elements.accountName.textContent = connected
    ? (state.account.displayName || state.account.email || 'Conta conectada')
    : 'Sem conta conectada';

  const syncMap = {
    offline: 'Sincronizacao desativada',
    syncing: 'Sincronizando',
    synced: 'Sincronizado',
    error: 'Falha na sincronizacao'
  };

  elements.accountSync.textContent = syncMap[state.account.syncStatus] || 'Sincronizacao desativada';
  elements.authButton.textContent = connected ? 'Sair da conta' : 'Entrar com Google';
}

async function handleAuthAction() {
  if (state.account.uid) {
    await signOut(auth);
    return;
  }

  try {
    setActionStatus('Abrindo login Google...');
    await signInWithPopup(auth, provider);
  } catch (error) {
    setActionStatus(`Falha no login Google: ${formatError(error)}`);
  }
}

async function pullRemoteState() {
  if (!state.account.uid) return;

  const snapshot = await getDoc(doc(db, 'users', state.account.uid));
  if (!snapshot.exists()) return;

  const remote = snapshot.data();
  state.settings = { ...state.settings, ...(remote.settings || {}) };
  state.history = remote.history || state.history;
  state.daily = { ...state.daily, ...(remote.daily || {}) };
  state.ui = { ...state.ui, ...(remote.ui || {}) };
  saveState();
  hydrateForm();
  hydrateFilters();
  refreshState();
}

async function pushRemoteState() {
  if (!state.account.uid) return;

  await setDoc(
    doc(db, 'users', state.account.uid),
    {
      settings: state.settings,
      daily: state.daily,
      history: state.history,
      ui: state.ui,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );
}

function handleAndroidDownload() {
  window.location.href = "./app-debug.apk";
}

function handleAppleDownload() {
  setActionStatus("Versao Apple em preparacao. Quando estiver pronta, este botao apontara para TestFlight ou App Store.");
  showToast("Versao Apple em preparacao.");
}

function registerPwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      elements.bootStatus.textContent = "App carregado, mas o modo offline nao foi ativado.";
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.hidden = false;
    setActionStatus("Instalacao disponivel neste navegador.");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
    setActionStatus("App instalado com sucesso.");
  });

  if (isIosSafari()) {
    setActionStatus("No iPhone: use Compartilhar > Adicionar a Tela de Inicio.");
  }
}

function handleInstallApp() {
  if (!deferredInstallPrompt) {
    if (isIosSafari()) {
      window.alert("No iPhone, abra no Safari e use Compartilhar > Adicionar a Tela de Inicio.");
      return;
    }

    showToast("Instalacao nao disponivel agora. Tente abrir pelo Chrome ou Edge.");
    return;
  }

  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.finally(() => {
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
  });
}

function handleSaveSettings(event) {
  event.preventDefault();

  const nextSettings = {
    goalMl: Number(elements.goalInput.value),
    amountMl: Number(elements.amountInput.value),
    message: elements.messageInput.value.trim(),
    startTime: elements.startInput.value,
    endTime: elements.endInput.value,
    intervalMin: Number(elements.intervalInput.value)
  };

  const error = validateSettings(nextSettings);
  if (error) {
    showToast(error);
    return;
  }

  state.settings = nextSettings;
  syncTodayRecord();
  saveState();
  refreshState();
  pushRemoteState().catch(() => {});
  showToast("Configuracao salva no navegador.");
}

function requestNotifications() {
  if (!("Notification" in window)) {
    showToast("Este navegador nao suporta notificacoes.");
    refreshPermissionStatus();
    return;
  }

  Notification.requestPermission().then(() => {
    refreshPermissionStatus();
    showToast(permissionText());
  });
}

function handleTestReminder() {
  setActionStatus("Botao de teste clicado.");
  sendReminder(true);

  if (!("Notification" in window)) {
    setActionStatus("Teste executado. Este navegador nao suporta notificacoes.");
    showToast("Teste executado. Este navegador nao suporta notificacoes.");
    window.alert("Teste executado. Este navegador nao suporta notificacoes.");
    return;
  }

  if (Notification.permission === "granted") {
    setActionStatus("Teste executado com notificacoes permitidas.");
    showToast("Teste executado. Se nada apareceu, verifique o bloqueio de notificacoes do sistema.");
    return;
  }

  setActionStatus("Teste executado sem notificacao do sistema.");
  showToast("Teste executado sem notificacao do sistema. Clique em Ativar notificacoes.");
  window.alert("Teste executado sem notificacao do sistema. Clique em Ativar notificacoes.");
}

function registerDrink() {
  rolloverDayIfNeeded();
  if (state.daily.completed) {
    showToast("Meta ja concluida hoje.");
    return;
  }

  state.daily.consumedMl += state.settings.amountMl;
  state.daily.events.push({
    timestamp: new Date().toISOString(),
    amountMl: state.settings.amountMl
  });

  if (state.daily.consumedMl >= state.settings.goalMl) {
    state.daily.consumedMl = state.settings.goalMl;
    state.daily.completed = true;
    showToast("Meta diaria concluida.");
  } else {
    showToast("Consumo registrado.");
  }

  syncTodayRecord();
  saveState();
  refreshState();
  pushRemoteState().catch(() => {});
}

function resetDay() {
  state.daily = createEmptyDaily(todayKey());
  syncTodayRecord();
  saveState();
  refreshState();
  pushRemoteState().catch(() => {});
  showToast("Progresso do dia zerado.");
}

function resetSettings() {
  state.settings = { ...DEFAULT_STATE.settings };
  hydrateForm();
  syncTodayRecord();
  saveState();
  refreshState();
  pushRemoteState().catch(() => {});
  showToast("Configuracao padrao restaurada.");
}

function handleFilterChange() {
  state.ui.viewMode = elements.viewModeSelect.value;
  state.ui.anchorDate = elements.anchorDateInput.value || todayKey();
  saveState();
  renderAnalytics();
}

function changeCalendarMonth(offset) {
  const [year, month] = state.ui.calendarMonth.split("-").map(Number);
  const base = new Date(year, month - 1, 1);
  base.setMonth(base.getMonth() + offset);
  state.ui.calendarMonth = monthKeyFromDate(base);
  saveState();
  renderCalendar();
}

function tick() {
  rolloverDayIfNeeded();
  refreshState();
  maybeSendScheduledReminder();
}

function refreshState() {
  rolloverDayIfNeeded();
  hydrateForm();
  hydrateFilters();
  refreshPermissionStatus();
  renderProgress();
  renderSchedule();
  renderAnalytics();
  renderCalendar();
}

function renderProgress() {
  const { consumedMl, completed } = state.daily;
  const { goalMl } = state.settings;
  const remainingMl = Math.max(goalMl - consumedMl, 0);
  const progress = Math.min(100, Math.round((consumedMl / goalMl) * 100));

  elements.consumedValue.textContent = `${consumedMl} ml`;
  elements.remainingValue.textContent = `${remainingMl} ml`;
  elements.progressBar.style.width = `${progress}%`;
  elements.progressText.textContent = `${progress}% da meta`;
  elements.windowValue.textContent = `${state.settings.startTime} - ${state.settings.endTime}`;
}

function renderSchedule() {
  const nextTime = computeNextReminderTime();
  elements.nextReminderValue.textContent = nextTime ? formatTime(nextTime) : "Sem lembrete pendente";
}

function renderAnalytics() {
  const data = buildAnalyticsDataset(state.ui.viewMode, state.ui.anchorDate);
  elements.summaryPeriod.textContent = data.periodLabel;
  elements.summaryGoal.textContent = formatMl(data.totalGoal);
  elements.summaryActual.textContent = formatMl(data.totalActual);
  elements.summaryRate.textContent = `${data.adherence}%`;
  renderBarChart(data.labels, data.goalSeries, data.actualSeries);
  renderLineChart(data.labels, data.goalSeries, data.actualSeries);
}

function renderCalendar() {
  const [year, month] = state.ui.calendarMonth.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const startWeekday = firstDay.getDay();
  const totalDays = new Date(year, month, 0).getDate();

  elements.calendarTitle.textContent = firstDay.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
  elements.calendarGrid.innerHTML = "";

  for (let i = 0; i < startWeekday; i += 1) {
    elements.calendarGrid.appendChild(buildCalendarCell(null));
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const dateKey = toDateKey(new Date(year, month - 1, day));
    elements.calendarGrid.appendChild(buildCalendarCell(dateKey));
  }
}

function maybeSendScheduledReminder() {
  if (state.daily.completed) return;
  if (!isWithinWindow(new Date(), state.settings.startTime, state.settings.endTime)) return;

  const nextTime = computeNextReminderTime();
  if (!nextTime) return;

  const now = new Date();
  if (now.getTime() < nextTime.getTime()) return;
  sendReminder(false);
}

function sendReminder(force) {
  rolloverDayIfNeeded();

  if (!force) {
    if (state.daily.completed) return;
    if (!isWithinWindow(new Date(), state.settings.startTime, state.settings.endTime)) return;
  }

  const title = "Lembrete de agua";
  const body = `${state.settings.message}\nProgresso: ${state.daily.consumedMl}/${state.settings.goalMl} ml`;
  showToast(body);

  if ("Notification" in window && Notification.permission === "granted") {
    const notification = new Notification(title, { body });
    notification.onclick = () => window.focus();
  }

  state.daily.lastReminderAt = new Date().toISOString();
  syncTodayRecord();
  saveState();
  renderSchedule();
}

function computeNextReminderTime() {
  const now = new Date();
  const windowStart = buildDateForTime(now, state.settings.startTime);
  const windowEnd = buildDateForTime(now, state.settings.endTime);
  const intervalMs = state.settings.intervalMin * 60 * 1000;

  if (state.daily.completed || now > windowEnd) return null;
  if (now < windowStart) return windowStart;
  if (!state.daily.lastReminderAt) return windowStart;

  const next = new Date(new Date(state.daily.lastReminderAt).getTime() + intervalMs);
  if (next > windowEnd) return null;
  if (next < windowStart) return windowStart;
  return next;
}

function hydrateForm() {
  const { settings } = state;
  elements.goalInput.value = settings.goalMl;
  elements.amountInput.value = settings.amountMl;
  elements.messageInput.value = settings.message;
  elements.startInput.value = settings.startTime;
  elements.endInput.value = settings.endTime;
  elements.intervalInput.value = settings.intervalMin;
}

function hydrateFilters() {
  elements.viewModeSelect.value = state.ui.viewMode;
  elements.anchorDateInput.value = state.ui.anchorDate;
}

function refreshPermissionStatus() {
  elements.permissionStatus.textContent = permissionText();
}

function permissionText() {
  if (!("Notification" in window)) return "Notificacoes nao estao disponiveis neste navegador.";
  if (Notification.permission === "granted") return "Notificacoes ativas.";
  if (Notification.permission === "denied") return "Notificacoes bloqueadas no navegador.";
  return "Notificacoes ainda nao autorizadas.";
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

function rolloverDayIfNeeded() {
  const today = todayKey();
  if (state.daily.dateKey === today) {
    syncTodayRecord();
    return;
  }

  syncHistoryRecord(state.daily.dateKey, state.daily);
  state.daily = createEmptyDaily(today);
  syncTodayRecord();
  saveState();
}

function syncTodayRecord() {
  state.daily.completed = state.daily.consumedMl >= state.settings.goalMl;
  syncHistoryRecord(state.daily.dateKey, state.daily);
}

function syncHistoryRecord(dateKey, daily) {
  state.history[dateKey] = {
    dateKey,
    goalMl: state.settings.goalMl,
    consumedMl: daily.consumedMl,
    events: (daily.events || []).map((event) => ({ ...event }))
  };
}

function buildAnalyticsDataset(mode, anchorDate) {
  if (mode === "daily") return buildDailyDataset(anchorDate);
  if (mode === "weekly") return buildWeeklyDataset(anchorDate);
  if (mode === "monthly") return buildMonthlyDataset(anchorDate);
  return buildYearlyDataset(anchorDate);
}

function buildDailyDataset(anchorDate) {
  const record = getRecord(anchorDate);
  const labels = [];
  const goalSeries = [];
  const actualSeries = [];
  let cumulative = 0;
  const events = (record.events || []).slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  for (let hour = 0; hour < 24; hour += 1) {
    labels.push(`${String(hour).padStart(2, "0")}h`);
    cumulative += events
      .filter((event) => new Date(event.timestamp).getHours() === hour)
      .reduce((sum, event) => sum + event.amountMl, 0);
    actualSeries.push(cumulative);
    goalSeries.push(calculateTargetForHour(record.goalMl, hour, state.settings.startTime, state.settings.endTime));
  }

  return {
    labels,
    goalSeries,
    actualSeries,
    totalGoal: record.goalMl,
    totalActual: record.consumedMl,
    adherence: percentage(record.consumedMl, record.goalMl),
    periodLabel: formatLongDate(anchorDate)
  };
}

function buildWeeklyDataset(anchorDate) {
  const anchor = new Date(`${anchorDate}T12:00:00`);
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  const labels = [];
  const goalSeries = [];
  const actualSeries = [];

  for (let i = 0; i < 7; i += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    const key = toDateKey(current);
    const record = getRecord(key);
    labels.push(current.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""));
    goalSeries.push(record.goalMl);
    actualSeries.push(record.consumedMl);
  }

  return {
    labels,
    goalSeries,
    actualSeries,
    totalGoal: sum(goalSeries),
    totalActual: sum(actualSeries),
    adherence: percentage(sum(actualSeries), sum(goalSeries)),
    periodLabel: `Semana de ${formatShortDate(toDateKey(start))}`
  };
}

function buildMonthlyDataset(anchorDate) {
  const anchor = new Date(`${anchorDate}T12:00:00`);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const labels = [];
  const goalSeries = [];
  const actualSeries = [];

  for (let day = 1; day <= totalDays; day += 1) {
    const key = toDateKey(new Date(year, month, day));
    const record = getRecord(key);
    labels.push(String(day));
    goalSeries.push(record.goalMl);
    actualSeries.push(record.consumedMl);
  }

  return {
    labels,
    goalSeries,
    actualSeries,
    totalGoal: sum(goalSeries),
    totalActual: sum(actualSeries),
    adherence: percentage(sum(actualSeries), sum(goalSeries)),
    periodLabel: anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
  };
}

function buildYearlyDataset(anchorDate) {
  const anchor = new Date(`${anchorDate}T12:00:00`);
  const year = anchor.getFullYear();
  const labels = [];
  const goalSeries = [];
  const actualSeries = [];

  for (let month = 0; month < 12; month += 1) {
    const start = new Date(year, month, 1);
    const totalDays = new Date(year, month + 1, 0).getDate();
    let monthlyGoal = 0;
    let monthlyActual = 0;

    for (let day = 1; day <= totalDays; day += 1) {
      const key = toDateKey(new Date(year, month, day));
      const record = getRecord(key);
      monthlyGoal += record.goalMl;
      monthlyActual += record.consumedMl;
    }

    labels.push(start.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""));
    goalSeries.push(monthlyGoal);
    actualSeries.push(monthlyActual);
  }

  return {
    labels,
    goalSeries,
    actualSeries,
    totalGoal: sum(goalSeries),
    totalActual: sum(actualSeries),
    adherence: percentage(sum(actualSeries), sum(goalSeries)),
    periodLabel: String(year)
  };
}

function renderBarChart(labels, goalSeries, actualSeries) {
  clearSvg(elements.barChart);
  const width = 760;
  const height = 280;
  const padding = { top: 24, right: 24, bottom: 46, left: 72 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const count = Math.max(labels.length, 1);
  const groupWidth = innerWidth / count;
  const barWidth = Math.max(6, groupWidth * 0.34);
  const maxValue = Math.max(1, ...goalSeries, ...actualSeries);
  drawYAxis(elements.barChart, padding, width, height, maxValue, 4);

  appendSvgChild(elements.barChart, svgLine(padding.left, height - padding.bottom, width - padding.right, height - padding.bottom, "axis"));
  appendSvgChild(elements.barChart, svgLine(padding.left, padding.top, padding.left, height - padding.bottom, "axis"));

  for (let i = 0; i < count; i += 1) {
    const x = padding.left + groupWidth * i + groupWidth * 0.12;
    const goalHeight = (goalSeries[i] / maxValue) * innerHeight;
    const actualHeight = (actualSeries[i] / maxValue) * innerHeight;

    appendSvgChild(elements.barChart, svgRect(x, height - padding.bottom - goalHeight, barWidth, goalHeight, "bar-goal"));
    appendSvgChild(elements.barChart, svgRect(x + barWidth + 6, height - padding.bottom - actualHeight, barWidth, actualHeight, "bar-actual"));
    appendSvgChild(elements.barChart, svgText(x + barWidth, height - 18, labels[i], "chart-label"));
  }
}

function renderLineChart(labels, goalSeries, actualSeries) {
  clearSvg(elements.lineChart);
  const width = 760;
  const height = 280;
  const padding = { top: 24, right: 24, bottom: 46, left: 72 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...goalSeries, ...actualSeries);
  const count = Math.max(labels.length, 1);
  drawYAxis(elements.lineChart, padding, width, height, maxValue, 4);

  appendSvgChild(elements.lineChart, svgLine(padding.left, height - padding.bottom, width - padding.right, height - padding.bottom, "axis"));
  appendSvgChild(elements.lineChart, svgLine(padding.left, padding.top, padding.left, height - padding.bottom, "axis"));

  const goalPoints = [];
  const actualPoints = [];

  for (let i = 0; i < count; i += 1) {
    const x = padding.left + (innerWidth / Math.max(count - 1, 1)) * i;
    const goalY = height - padding.bottom - (goalSeries[i] / maxValue) * innerHeight;
    const actualY = height - padding.bottom - (actualSeries[i] / maxValue) * innerHeight;
    goalPoints.push([x, goalY]);
    actualPoints.push([x, actualY]);

    if (count <= 12 || i % Math.ceil(count / 10) === 0 || i === count - 1) {
      appendSvgChild(elements.lineChart, svgText(x, height - 18, labels[i], "chart-label"));
    }
  }

  appendSvgChild(elements.lineChart, svgPolyline(goalPoints, "line-goal"));
  appendSvgChild(elements.lineChart, svgPolyline(actualPoints, "line-actual"));
  goalPoints.forEach((point) => appendSvgChild(elements.lineChart, svgCircle(point[0], point[1], 3, "dot-goal")));
  actualPoints.forEach((point) => appendSvgChild(elements.lineChart, svgCircle(point[0], point[1], 3, "dot-actual")));
}

function buildCalendarCell(dateKey) {
  const cell = document.createElement("article");
  cell.className = "calendar-cell";

  if (!dateKey) {
    cell.classList.add("calendar-cell-empty");
    return cell;
  }

  const record = getRecord(dateKey);
  const [, , day] = dateKey.split("-");
  const statusClass = record.consumedMl === 0 ? "is-empty" : record.consumedMl >= record.goalMl ? "is-good" : "is-low";
  cell.classList.add(statusClass);
  if (dateKey === todayKey()) cell.classList.add("is-today");

  const dayEl = document.createElement("strong");
  dayEl.textContent = day;
  const metaEl = document.createElement("span");
  metaEl.textContent = `Meta ${formatMlShort(record.goalMl)}`;
  const actualEl = document.createElement("span");
  actualEl.textContent = `Real ${formatMlShort(record.consumedMl)}`;

  cell.append(dayEl, metaEl, actualEl);
  return cell;
}

function getRecord(dateKey) {
  if (dateKey === state.daily.dateKey) {
    return {
      dateKey,
      goalMl: state.settings.goalMl,
      consumedMl: state.daily.consumedMl,
      events: (state.daily.events || []).map((event) => ({ ...event }))
    };
  }

  const existing = state.history[dateKey];
  if (existing) {
    return {
      dateKey,
      goalMl: existing.goalMl || state.settings.goalMl,
      consumedMl: existing.consumedMl || 0,
      events: (existing.events || []).map((event) => ({ ...event }))
    };
  }

  return {
    dateKey,
    goalMl: state.settings.goalMl,
    consumedMl: 0,
    events: []
  };
}

function validateSettings(settings) {
  if (settings.goalMl < 100 || settings.goalMl > 10000) return "Meta diaria precisa ficar entre 100 e 10000 ml.";
  if (settings.amountMl < 50 || settings.amountMl > 2000) return "Dose por clique precisa ficar entre 50 e 2000 ml.";
  if (!settings.message) return "Defina uma mensagem personalizada.";
  if (!/^\d{2}:\d{2}$/.test(settings.startTime) || !/^\d{2}:\d{2}$/.test(settings.endTime)) return "Janela invalida.";
  if (toMinutes(settings.endTime) <= toMinutes(settings.startTime)) return "O horario final precisa ser maior que o inicial.";
  if (settings.intervalMin < 1 || settings.intervalMin > 1440) return "Intervalo precisa ficar entre 1 e 1440 minutos.";
  return null;
}

function loadState() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return cloneDefaultState();

  try {
    const parsed = JSON.parse(raw);
    const migrated = migrateState(parsed);
    return {
      settings: { ...DEFAULT_STATE.settings, ...(migrated.settings || {}) },
      daily: { ...createEmptyDaily(todayKey()), ...(migrated.daily || {}) },
      history: migrated.history || {},
      ui: { ...DEFAULT_STATE.ui, ...(migrated.ui || {}) }
    };
  } catch {
    return cloneDefaultState();
  }
}

function saveState() {
  syncTodayRecord();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function migrateState(parsed) {
  const next = {
    settings: parsed.settings || {},
    daily: parsed.daily || {},
    history: parsed.history || {},
    ui: parsed.ui || {}
  };

  if (!next.daily.dateKey) next.daily.dateKey = todayKey();
  if (!Array.isArray(next.daily.events)) next.daily.events = [];
  if (!next.settings.intervalMin) {
    next.settings.intervalMin = next.settings.intervalSec
      ? Math.max(1, Math.round(next.settings.intervalSec / 60))
      : DEFAULT_STATE.settings.intervalMin;
  }
  delete next.settings.intervalSec;

  if (!next.history[next.daily.dateKey]) {
    next.history[next.daily.dateKey] = {
      dateKey: next.daily.dateKey,
      goalMl: next.settings.goalMl || DEFAULT_STATE.settings.goalMl,
      consumedMl: next.daily.consumedMl || 0,
      events: next.daily.events
    };
  }

  Object.keys(next.history).forEach((key) => {
    const record = next.history[key];
    next.history[key] = {
      dateKey: key,
      goalMl: record.goalMl || next.settings.goalMl || DEFAULT_STATE.settings.goalMl,
      consumedMl: record.consumedMl || 0,
      events: Array.isArray(record.events) ? record.events : []
    };
  });

  if (!next.ui.anchorDate) next.ui.anchorDate = todayKey();
  if (!next.ui.calendarMonth) next.ui.calendarMonth = monthKeyFromDate(new Date());
  if (!next.ui.viewMode) next.ui.viewMode = "daily";
  return next;
}

function buildDateForTime(baseDate, hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const date = new Date(baseDate);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function isWithinWindow(now, startTime, endTime) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= toMinutes(startTime) && minutes <= toMinutes(endTime);
}

function toMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

function todayKey() {
  return toDateKey(new Date());
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKeyFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatTime(date) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatLongDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function formatShortDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  });
}

function formatMl(value) {
  return `${Math.round(value)} ml`;
}

function formatMlShort(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}L` : `${Math.round(value)}ml`;
}

function percentage(actual, goal) {
  if (!goal) return 0;
  return Math.min(999, Math.round((actual / goal) * 100));
}

function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

function calculateTargetForHour(goalMl, hour, startTime, endTime) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const current = (hour + 1) * 60;
  if (current <= start) return 0;
  if (current >= end) return goalMl;
  const progress = (current - start) / (end - start);
  return Math.round(goalMl * progress);
}

function windowStateLabel() {
  const now = new Date();
  if (isWithinWindow(now, state.settings.startTime, state.settings.endTime)) return "Dentro da janela";
  return now < buildDateForTime(now, state.settings.startTime) ? "Aguardando inicio" : "Fora da janela";
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2800);
}

function setActionStatus(message) {
  elements.actionStatus.textContent = message;
}

function createEmptyDaily(dateKey) {
  return {
    consumedMl: 0,
    completed: false,
    dateKey,
    lastReminderAt: null,
    events: []
  };
}

function cloneDefaultState() {
  return {
    settings: { ...DEFAULT_STATE.settings },
    daily: createEmptyDaily(todayKey()),
    history: {},
    ui: {
      viewMode: DEFAULT_STATE.ui.viewMode,
      anchorDate: todayKey(),
      calendarMonth: monthKeyFromDate(new Date())
    }
  };
}

function clearSvg(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function appendSvgChild(svg, child) {
  svg.appendChild(child);
}

function svgRect(x, y, width, height, className) {
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", x);
  rect.setAttribute("y", y);
  rect.setAttribute("width", width);
  rect.setAttribute("height", Math.max(height, 0));
  rect.setAttribute("rx", 6);
  rect.setAttribute("class", className);
  return rect;
}

function svgText(x, y, value, className) {
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", x);
  text.setAttribute("y", y);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("class", className);
  text.textContent = value;
  return text;
}

function svgTextStart(x, y, value, className) {
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", x);
  text.setAttribute("y", y);
  text.setAttribute("text-anchor", "start");
  text.setAttribute("class", className);
  text.textContent = value;
  return text;
}

function svgTextEnd(x, y, value, className) {
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", x);
  text.setAttribute("y", y);
  text.setAttribute("text-anchor", "end");
  text.setAttribute("class", className);
  text.textContent = value;
  return text;
}

function svgLine(x1, y1, x2, y2, className) {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("class", className);
  return line;
}

function svgPolyline(points, className) {
  const line = document.createElementNS(SVG_NS, "polyline");
  line.setAttribute("points", points.map((point) => point.join(",")).join(" "));
  line.setAttribute("fill", "none");
  line.setAttribute("class", className);
  return line;
}

function svgCircle(cx, cy, r, className) {
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", cx);
  circle.setAttribute("cy", cy);
  circle.setAttribute("r", r);
  circle.setAttribute("class", className);
  return circle;
}

function drawYAxis(svg, padding, width, height, maxValue, steps) {
  const innerHeight = height - padding.top - padding.bottom;

  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    const y = height - padding.bottom - innerHeight * ratio;
    const value = Math.round(maxValue * ratio);

    appendSvgChild(svg, svgLine(padding.left, y, width - padding.right, y, "grid-line"));
    appendSvgChild(svg, svgTextEnd(padding.left - 10, y + 4, `${value} ml`, "y-axis-label"));
  }
}
