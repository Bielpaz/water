import './styles.css';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, getFirebaseAuth } from './firebase.js';
const isNative = Capacitor.getPlatform() !== 'web';

const STORAGE_KEY = 'water-reminder-mobile-state';
const NOTIFICATION_LOOKAHEAD_DAYS = 7;
const MAX_PENDING_NOTIFICATIONS = 60;
const DEFAULT_STATE = {
  settings: {
    goalMl: 2000,
    amountMl: 250,
    message: 'Hora da agua. Beba 250 ml agora.',
    startTime: '08:00',
    endTime: '22:00',
    intervalMin: 90
  },
  daily: {
    dateKey: todayKey(),
    consumedMl: 0,
    completed: false,
    events: []
  },
  history: {},
  notificationsEnabled: false,
  lastScheduleAt: null,
  account: {
    uid: null,
    email: null,
    displayName: null,
    syncStatus: 'offline'
  },
  ui: {
    viewMode: 'weekly',
    anchorDate: todayKey()
  }
};

const SVG_NS = 'http://www.w3.org/2000/svg';
let state = loadState();
if (state.account?.uid && state.account?.syncStatus === 'syncing') {
  state.account.syncStatus = 'synced';
}
let syncing = false;
rolloverDayIfNeeded();

const app = document.querySelector('#app');
app.innerHTML = `
  <main class="app-shell">
    <section class="card hero-card">
      <h1>Water</h1>
      <p class="hero-tagline">Seja o melhor amigo do seu rim</p>
      <div class="actions">
        <button id="permissionButton" class="button button-primary">Ativar notificacoes</button>
        <button id="authButton" class="button button-secondary">Entrar com Google</button>
      </div>
      <p id="status" class="status">Inicializando...</p>
      <div class="account-inline">
        <strong id="accountName">Sem conta conectada</strong>
        <span id="accountSync">Sincronizacao desativada</span>
      </div>
    </section>

    <section class="section-block">
      <section class="card">
        <h2 class="card-title">Quanto ira beber hoje?</h2>
        <form id="settingsForm" class="form-grid">
          <label class="field">
            <span>Meta diaria (ml)</span>
            <input id="goalInput" type="number" min="100" max="10000" step="50" required />
          </label>
          <label class="field">
            <span>Dose por clique (ml)</span>
            <input id="amountInput" type="number" min="50" max="2000" step="50" required />
          </label>
          <label class="field field-wide">
            <span>Mensagem do lembrete</span>
            <textarea id="messageInput" rows="3" maxlength="180" required></textarea>
          </label>
          <label class="field">
            <span>Inicio</span>
            <input id="startInput" type="time" required />
          </label>
          <label class="field">
            <span>Fim</span>
            <input id="endInput" type="time" required />
          </label>
          <label class="field field-wide">
            <span>Intervalo (min)</span>
            <input id="intervalInput" type="number" min="1" max="1440" step="1" required />
          </label>
          <div class="actions field-wide">
            <button class="button button-primary" type="submit">Salvar configuracao</button>
            <button id="resetSettingsButton" class="button button-secondary" type="button">Restaurar padrao</button>
          </div>
        </form>
      </section>
    </section>

    <section class="section-block">
      <section class="card today-card">
        <h2 class="card-title">Progresso de hoje</h2>
        <div class="metrics">
          <article>
            <span class="metric-label">Consumido</span>
            <strong id="consumedValue" class="metric-value">0 ml</strong>
          </article>
          <article>
            <span class="metric-label">Restante</span>
            <strong id="remainingValue" class="metric-value">0 ml</strong>
          </article>
        </div>
        <div class="progress-track"><div id="progressFill" class="progress-fill"></div></div>
        <p id="progressText" class="progress-text">0% da meta</p>
        <div class="actions">
          <button id="drinkButton" class="button button-primary" type="button">Registrar agua</button>
          <button id="resetDayButton" class="button button-secondary" type="button">Zerar dia</button>
        </div>
        <div class="info-list">
          <div>
            <span class="metric-label">Janela atual</span>
            <strong id="windowValue">-</strong>
          </div>
          <div>
            <span class="metric-label">Proximo lembrete</span>
            <strong id="nextReminderValue">-</strong>
          </div>
        </div>
      </section>
    </section>

    <section class="section-block">
      <section class="card analytics-card">
        <div class="section-head section-head-row">
          <div>
            <h2 class="card-title">Analytics</h2>
          </div>
          <div class="filters">
            <select id="viewModeSelect" class="select-input">
              <option value="daily">Diario</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
              <option value="yearly">Ano</option>
            </select>
            <input id="anchorDateInput" class="select-input" type="date" />
          </div>
        </div>

        <div class="summary-grid">
          <article class="summary-card">
            <span class="summary-label">Periodo</span>
            <strong id="summaryPeriod">-</strong>
          </article>
          <article class="summary-card">
            <span class="summary-label">Meta acumulada</span>
            <strong id="summaryGoal">0 ml</strong>
          </article>
          <article class="summary-card">
            <span class="summary-label">Realizado</span>
            <strong id="summaryActual">0 ml</strong>
          </article>
          <article class="summary-card">
            <span class="summary-label">Aderencia</span>
            <strong id="summaryRate">0%</strong>
          </article>
        </div>

        <div class="chart-block">
          <div class="chart-head">
            <div>
              <h3>Grafico de barras</h3>
            </div>
            <div class="chart-legend">
              <span><i class="legend-swatch legend-goal"></i> Meta</span>
              <span><i class="legend-swatch legend-actual"></i> Realizado</span>
            </div>
          </div>
          <svg id="barChart" class="chart-svg" viewBox="0 0 760 320" role="img" aria-label="Grafico de barras"></svg>
        </div>

        <div class="chart-block">
          <div class="chart-head">
            <div>
              <h3>Grafico de linha</h3>
            </div>
            <div class="chart-legend">
              <span><i class="legend-swatch legend-goal"></i> Meta</span>
              <span><i class="legend-swatch legend-actual"></i> Realizado</span>
            </div>
          </div>
          <svg id="lineChart" class="chart-svg" viewBox="0 0 760 360" role="img" aria-label="Grafico de linha"></svg>
        </div>

        <div class="chart-block">
          <div class="section-head section-head-row">
            <div>
              <h3>Calendario</h3>
            </div>
            <div class="actions compact-actions">
              <button id="calendarPrevButton" class="button button-secondary" type="button">Anterior</button>
              <button id="calendarNextButton" class="button button-secondary" type="button">Proximo</button>
            </div>
          </div>
          <p id="calendarTitle" class="calendar-title">-</p>
          <div class="calendar-weekdays">
            <span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sab</span>
          </div>
          <div id="calendarGrid" class="calendar-grid"></div>
          <div class="calendar-legend">
            <span><i class="legend-dot legend-low"></i> Abaixo da meta</span>
            <span><i class="legend-dot legend-good"></i> Meta batida</span>
            <span><i class="legend-dot legend-empty"></i> Sem registro</span>
          </div>
        </div>
      </section>
    </section>
  </main>
`;

const elements = {
  status: document.querySelector('#status'),
  permissionButton: document.querySelector('#permissionButton'),
  authButton: document.querySelector('#authButton'),
  accountName: document.querySelector('#accountName'),
  accountSync: document.querySelector('#accountSync'),
  settingsForm: document.querySelector('#settingsForm'),
  goalInput: document.querySelector('#goalInput'),
  amountInput: document.querySelector('#amountInput'),
  messageInput: document.querySelector('#messageInput'),
  startInput: document.querySelector('#startInput'),
  endInput: document.querySelector('#endInput'),
  intervalInput: document.querySelector('#intervalInput'),
  resetSettingsButton: document.querySelector('#resetSettingsButton'),
  consumedValue: document.querySelector('#consumedValue'),
  remainingValue: document.querySelector('#remainingValue'),
  progressFill: document.querySelector('#progressFill'),
  progressText: document.querySelector('#progressText'),
  drinkButton: document.querySelector('#drinkButton'),
  resetDayButton: document.querySelector('#resetDayButton'),
  windowValue: document.querySelector('#windowValue'),
  nextReminderValue: document.querySelector('#nextReminderValue'),
  viewModeSelect: document.querySelector('#viewModeSelect'),
  anchorDateInput: document.querySelector('#anchorDateInput'),
  summaryPeriod: document.querySelector('#summaryPeriod'),
  summaryGoal: document.querySelector('#summaryGoal'),
  summaryActual: document.querySelector('#summaryActual'),
  summaryRate: document.querySelector('#summaryRate'),
  barChart: document.querySelector('#barChart'),
  lineChart: document.querySelector('#lineChart'),
  calendarTitle: document.querySelector('#calendarTitle'),
  calendarGrid: document.querySelector('#calendarGrid'),
  calendarPrevButton: document.querySelector('#calendarPrevButton'),
  calendarNextButton: document.querySelector('#calendarNextButton')
};

bindEvents();
document.addEventListener('visibilitychange', handleVisibilityChange);
boot();

function bindEvents() {
  elements.permissionButton.addEventListener('click', enableNotifications);
  elements.authButton.addEventListener('click', handleAuthAction);
  elements.settingsForm.addEventListener('submit', saveSettings);
  elements.resetSettingsButton.addEventListener('click', restoreDefaults);
  elements.drinkButton.addEventListener('click', registerDrink);
  elements.resetDayButton.addEventListener('click', resetToday);
  elements.viewModeSelect.addEventListener('change', handleAnalyticsFilterChange);
  elements.anchorDateInput.addEventListener('change', handleAnalyticsFilterChange);
  elements.calendarPrevButton.addEventListener('click', () => changeCalendarMonth(-1));
  elements.calendarNextButton.addEventListener('click', () => changeCalendarMonth(1));
}

async function boot() {
  hydrateForm();
  hydrateAnalyticsFilters();
  renderAll();
  renderAccount();
  await refreshPermissionState();
  await autoRescheduleIfNeeded();
  setStatus('App pronto.');
}

async function handleAuthAction() {
  if (state.account.uid) {
    if (isNative) {
      await FirebaseAuthentication.signOut();
    }
    await firebaseSignOut(getFirebaseAuth());
    state.account = {
      uid: null,
      email: null,
      displayName: null,
      syncStatus: 'offline'
    };
    saveState();
    renderAccount();
    setStatus('Conta desconectada.');
    return;
  }

  if (!isNative) {
    setStatus('Login web sera conectado na fase da versao navegador.');
    return;
  }

  try {
    state.account.syncStatus = 'syncing';
    renderAccount();
    setStatus('Conectando conta Google...');

    const result = await FirebaseAuthentication.signInWithGoogle();
    const idToken = result.credential?.idToken ?? null;
    const accessToken = result.credential?.accessToken ?? null;

    if (!idToken && !accessToken) {
      throw new Error('Google nao retornou token de autenticacao.');
    }

    const credential = GoogleAuthProvider.credential(idToken, accessToken);
    const authResult = await signInWithCredential(getFirebaseAuth(), credential);
    const user = authResult.user;

    state.account = {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || user.email || 'Conta conectada',
      syncStatus: 'syncing'
    };
    saveState();
    renderAccount();
    await pullRemoteState();
    await pushRemoteState();
    state.account.syncStatus = 'synced';
    saveState();
    renderAccount();
    setStatus('Conta Google conectada e sincronizada.');
  } catch (error) {
    state.account.syncStatus = 'error';
    saveState();
    renderAccount();
    setStatus(`Falha no login Google nativo: ${formatError(error)}`);
  }
}

async function pullRemoteState() {
  if (!state.account.uid || syncing) return;
  syncing = true;

  try {
    const snapshot = await getDoc(doc(db, 'users', state.account.uid));
    if (snapshot.exists()) {
      const remote = snapshot.data();
      state.settings = { ...state.settings, ...(remote.settings || {}) };
      state.history = remote.history || state.history;
      state.daily = { ...state.daily, ...(remote.daily || {}) };
      state.lastScheduleAt = remote.lastScheduleAt || state.lastScheduleAt;
      state.ui = { ...state.ui, ...(remote.ui || {}) };
    }
    state.account.syncStatus = 'synced';
    saveState();
    hydrateForm();
    renderAll();
    renderAccount();
    setStatus('Dados da conta sincronizados.');
  } catch (error) {
    state.account.syncStatus = 'error';
    renderAccount();
    setStatus(`Falha ao sincronizar conta: ${formatError(error)}`);
  } finally {
    syncing = false;
  }
}

async function pushRemoteState() {
  if (!state.account.uid || syncing) return;

  try {
    state.account.syncStatus = 'syncing';
    saveState();
    renderAccount();
    await setDoc(doc(db, 'users', state.account.uid), {
      settings: state.settings,
      daily: state.daily,
      history: state.history,
      lastScheduleAt: state.lastScheduleAt,
      ui: state.ui,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    state.account.syncStatus = 'synced';
    saveState();
    renderAccount();
  } catch (error) {
    state.account.syncStatus = 'error';
    saveState();
    renderAccount();
    setStatus(`Falha ao salvar na conta: ${formatError(error)}`);
  }
}

function renderAccount() {
  const connected = Boolean(state.account.uid);
  elements.accountName.textContent = connected
    ? state.account.displayName || state.account.email || 'Conta conectada'
    : 'Sem conta conectada';
  elements.accountSync.textContent = connected
    ? syncLabel(state.account.syncStatus, state.account.email)
    : 'Sincronizacao desativada';
  elements.authButton.textContent = connected ? 'Sair da conta' : 'Entrar com Google';
}

function syncLabel(status, email) {
  if (status === 'syncing') return `Sincronizando${email ? ` • ${email}` : ''}`;
  if (status === 'synced') return `Sincronizado${email ? ` • ${email}` : ''}`;
  if (status === 'error') return `Falha na sincronizacao${email ? ` • ${email}` : ''}`;
  return email || 'Conta conectada';
}

async function enableNotifications() {
  try {
    const permission = await LocalNotifications.requestPermissions();
    state.notificationsEnabled = permission.display === 'granted';
    saveState();
    await refreshPermissionState();
    if (state.notificationsEnabled) {
      await rescheduleNotifications();
    } else {
      setStatus('Permissao de notificacao nao concedida.');
    }
  } catch (error) {
    setStatus(`Falha ao ativar notificacoes: ${formatError(error)}`);
  }
}

async function refreshPermissionState() {
  try {
    const permission = await LocalNotifications.checkPermissions();
    state.notificationsEnabled = permission.display === 'granted';
    saveState();
  } catch {}
}

async function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  rolloverDayIfNeeded();
  renderAll();
  await refreshPermissionState();
  await autoRescheduleIfNeeded();
  if (state.account.uid) {
    await pullRemoteState();
  }
}

async function autoRescheduleIfNeeded() {
  if (!state.notificationsEnabled) return;
  if (!notificationsNeedRefresh()) return;
  await rescheduleNotifications({ silent: true });
}

function notificationsNeedRefresh() {
  if (!state.lastScheduleAt) return true;
  const last = new Date(state.lastScheduleAt);
  if (Number.isNaN(last.getTime())) return true;
  if (toDateKey(last) !== todayKey()) return true;
  if (last.getTime() + 6 * 60 * 60 * 1000 < Date.now()) return true;
  return false;
}

async function rescheduleNotifications(options = {}) {
  try {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') {
      if (!options.silent) setStatus('Permissao nao concedida. Ative notificacoes primeiro.');
      return;
    }

    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((item) => ({ id: item.id }))
      });
    }

    const notifications = buildNotificationSchedule();
    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications });
    }

    state.lastScheduleAt = new Date().toISOString();
    saveState();
    void pushRemoteState();
    renderToday();
    if (!options.silent) {
      setStatus(`${notifications.length} lembretes agendados para os proximos dias.`);
    }
  } catch (error) {
    setStatus(`Falha ao reagendar: ${formatError(error)}`);
  }
}

function saveSettings(event) {
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
    setStatus(error);
    return;
  }

  state.settings = nextSettings;
  syncTodayRecord();
  saveState();
  renderAll();
  void pushRemoteState();
  setStatus('Configuracao salva.');

  if (state.notificationsEnabled) {
    void rescheduleNotifications({ silent: true });
  }
}

function restoreDefaults() {
  state.settings = { ...DEFAULT_STATE.settings };
  hydrateForm();
  syncTodayRecord();
  saveState();
  renderAll();
  void pushRemoteState();
  setStatus('Configuracao padrao restaurada.');

  if (state.notificationsEnabled) {
    void rescheduleNotifications({ silent: true });
  }
}

function registerDrink() {
  rolloverDayIfNeeded();
  if (state.daily.completed) {
    setStatus('Meta ja concluida hoje.');
    return;
  }

  const remaining = Math.max(state.settings.goalMl - state.daily.consumedMl, 0);
  const amount = Math.min(state.settings.amountMl, remaining);

  if (amount <= 0) {
    state.daily.completed = true;
    syncTodayRecord();
    saveState();
    renderAll();
    void pushRemoteState();
    setStatus('Meta diaria concluida.');
    return;
  }

  state.daily.consumedMl += amount;
  state.daily.events.push({ timestamp: new Date().toISOString(), amountMl: amount });
  state.daily.completed = state.daily.consumedMl >= state.settings.goalMl;
  syncTodayRecord();
  saveState();
  renderAll();
  void pushRemoteState();
  setStatus(state.daily.completed ? 'Meta diaria concluida.' : `+${amount} ml registrados.`);
}

function resetToday() {
  state.daily = createDaily(todayKey());
  syncTodayRecord();
  saveState();
  renderAll();
  void pushRemoteState();
  setStatus('Dia atual zerado.');

  if (state.notificationsEnabled) {
    void rescheduleNotifications({ silent: true });
  }
}

function handleAnalyticsFilterChange() {
  state.ui.viewMode = elements.viewModeSelect.value;
  state.ui.anchorDate = elements.anchorDateInput.value || todayKey();
  saveState();
  void pushRemoteState();
  renderAnalytics();
  renderCalendar();
}

function changeCalendarMonth(offset) {
  state.ui.anchorDate = shiftAnchorDate(state.ui.viewMode, state.ui.anchorDate, offset);
  saveState();
  void pushRemoteState();
  hydrateAnalyticsFilters();
  renderAnalytics();
  renderCalendar();
}

function renderAll() {
  hydrateAnalyticsFilters();
  renderToday();
  renderAnalytics();
  renderCalendar();
}

function renderToday() {
  rolloverDayIfNeeded();
  const consumed = state.daily.consumedMl;
  const goal = state.settings.goalMl;
  const remaining = Math.max(goal - consumed, 0);
  const pct = Math.min(100, Math.round((consumed / goal) * 100));

  elements.consumedValue.textContent = `${consumed} ml`;
  elements.remainingValue.textContent = `${remaining} ml`;
  elements.progressFill.style.width = `${pct}%`;
  elements.progressText.textContent = `${pct}% da meta`;
  elements.windowValue.textContent = `${state.settings.startTime} - ${state.settings.endTime}`;
  elements.nextReminderValue.textContent = computeNextReminderLabel();
}

function renderAnalytics() {
  const dataset = buildAnalyticsDataset(state.ui.viewMode, state.ui.anchorDate);
  const barLabels = dataset.barLabels || dataset.labels;
  const barGoalSeries = dataset.barGoalSeries || dataset.goalSeries;
  const barActualSeries = dataset.barActualSeries || dataset.actualSeries;


  elements.summaryPeriod.textContent = dataset.periodLabel;
  elements.summaryGoal.textContent = formatMl(dataset.totalGoal);
  elements.summaryActual.textContent = formatMl(dataset.totalActual);
  elements.summaryRate.textContent = `${dataset.adherence}%`;


  renderBarChart(barLabels, barGoalSeries, barActualSeries);

  renderLineChart(dataset.labels, dataset.goalSeries, dataset.actualSeries);
}

function renderBarChart(labels, goalSeries, actualSeries) {
  clearSvg(elements.barChart);

  const width = 760;
  const height = 320;
  const padding = { top: 24, right: 24, bottom: 46, left: 72 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const count = Math.max(labels.length, 1);
  const groupWidth = innerWidth / count;
  const barWidth = Math.max(6, groupWidth * 0.34);
  const maxValue = Math.max(1, ...goalSeries, ...actualSeries);

  for (let tick = 0; tick <= 4; tick += 1) {
    const ratio = tick / 4;
    const y = height - padding.bottom - ratio * innerHeight;
    const tickValue = Math.round(maxValue * ratio);
    appendSvg(elements.barChart, svgLine(padding.left, y, width - padding.right, y, 'grid-line'));
    appendSvg(elements.barChart, svgText(padding.left - 14, y + 5, `${tickValue} ml`, 'chart-label chart-label-y', 'end'));
  }

  appendSvg(elements.barChart, svgLine(padding.left, height - padding.bottom, width - padding.right, height - padding.bottom, 'axis'));
  appendSvg(elements.barChart, svgLine(padding.left, padding.top, padding.left, height - padding.bottom, 'axis'));

  for (let i = 0; i < count; i += 1) {
    const x = padding.left + groupWidth * i + groupWidth * 0.12;
    const goalHeight = (goalSeries[i] / maxValue) * innerHeight;
    const actualHeight = (actualSeries[i] / maxValue) * innerHeight;

    const goalBar = document.createElementNS(SVG_NS, 'rect');
    goalBar.setAttribute('x', String(x));
    goalBar.setAttribute('y', String(height - padding.bottom - goalHeight));
    goalBar.setAttribute('width', String(barWidth));
    goalBar.setAttribute('height', String(goalHeight));
    goalBar.setAttribute('rx', '6');
    goalBar.setAttribute('ry', '6');
    goalBar.setAttribute('class', 'bar-goal');
    goalBar.setAttribute('fill', 'rgba(24, 59, 107, 0.24)');
    elements.barChart.appendChild(goalBar);

    const actualBar = document.createElementNS(SVG_NS, 'rect');
    actualBar.setAttribute('x', String(x + barWidth + 6));
    actualBar.setAttribute('y', String(height - padding.bottom - actualHeight));
    actualBar.setAttribute('width', String(barWidth));
    actualBar.setAttribute('height', String(actualHeight));
    actualBar.setAttribute('rx', '6');
    actualBar.setAttribute('ry', '6');
    actualBar.setAttribute('class', 'bar-actual');
    actualBar.setAttribute('fill', 'rgba(42, 109, 244, 0.92)');
    elements.barChart.appendChild(actualBar);

    if (count <= 12 || i % Math.ceil(count / 8) === 0 || i === count - 1) {
      appendSvg(elements.barChart, svgText(x + barWidth, height - 18, labels[i], 'chart-label'));
    }
  }
}

function renderLineChart(labels, goalSeries, actualSeries) {
  clearSvg(elements.lineChart);
  const width = 760;
  const height = 360;
  const padding = { top: 24, right: 24, bottom: 58, left: 72 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...goalSeries, ...actualSeries);
  const count = Math.max(labels.length, 1);

  for (let tick = 0; tick <= 4; tick += 1) {
    const ratio = tick / 4;
    const y = height - padding.bottom - ratio * innerHeight;
    const tickValue = Math.round(maxValue * ratio);
    appendSvg(elements.lineChart, svgLine(padding.left, y, width - padding.right, y, 'grid-line'));
    appendSvg(elements.lineChart, svgText(padding.left - 14, y + 5, `${tickValue} ml`, 'chart-label chart-label-y', 'end'));
  }

  appendSvg(elements.lineChart, svgLine(padding.left, height - padding.bottom, width - padding.right, height - padding.bottom, 'axis'));
  appendSvg(elements.lineChart, svgLine(padding.left, padding.top, padding.left, height - padding.bottom, 'axis'));

  const goalPoints = [];
  const actualPoints = [];

  for (let i = 0; i < count; i += 1) {
    const x = padding.left + (innerWidth / Math.max(count - 1, 1)) * i;
    const goalY = height - padding.bottom - (goalSeries[i] / maxValue) * innerHeight;
    const actualY = height - padding.bottom - (actualSeries[i] / maxValue) * innerHeight;
    goalPoints.push([x, goalY]);
    actualPoints.push([x, actualY]);

    const dailyStep = Math.ceil(count / 6);
    if (count <= 12 || i % dailyStep === 0 || i === count - 1) {
      appendSvg(elements.lineChart, svgText(x, height - 18, labels[i], 'chart-label'));
    }
  }

  appendSvg(elements.lineChart, svgPolyline(goalPoints, 'line-goal'));
  appendSvg(elements.lineChart, svgPolyline(actualPoints, 'line-actual'));
  goalPoints.forEach((point) => appendSvg(elements.lineChart, svgCircle(point[0], point[1], 3, 'dot-goal')));
  actualPoints.forEach((point) => appendSvg(elements.lineChart, svgCircle(point[0], point[1], 3, 'dot-actual')));
}

function renderCalendar() {
  const anchor = new Date(`${state.ui.anchorDate}T12:00:00`);
  const year = anchor.getFullYear();
  const month = anchor.getMonth() + 1;
  const firstDay = new Date(year, month - 1, 1);
  const startWeekday = firstDay.getDay();
  const totalDays = new Date(year, month, 0).getDate();

  elements.calendarTitle.textContent = firstDay.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
  elements.calendarGrid.innerHTML = '';

  for (let i = 0; i < startWeekday; i += 1) {
    elements.calendarGrid.appendChild(buildCalendarCell(null));
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const dateKey = toDateKey(new Date(year, month - 1, day));
    elements.calendarGrid.appendChild(buildCalendarCell(dateKey));
  }
}

function buildCalendarCell(dateKey) {
  const cell = document.createElement('article');
  cell.className = 'calendar-cell';

  if (!dateKey) {
    cell.classList.add('calendar-cell-empty');
    return cell;
  }

  const record = getRecord(dateKey);
  const [, , day] = dateKey.split('-');
  const statusClass = record.consumedMl === 0
    ? 'is-empty'
    : record.consumedMl >= record.goalMl
      ? 'is-good'
      : 'is-low';

  cell.classList.add(statusClass);
  if (dateKey === todayKey()) cell.classList.add('is-today');

  const dayEl = document.createElement('strong');
  dayEl.className = 'calendar-day';
  dayEl.textContent = day;

  const metaEl = document.createElement('span');
  metaEl.textContent = `Meta ${formatCompactMl(record.goalMl)}`;

  const actualEl = document.createElement('span');
  actualEl.textContent = `Real ${formatCompactMl(record.consumedMl)}`;

  cell.append(dayEl, metaEl, actualEl);
  return cell;
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

function hydrateAnalyticsFilters() {
  elements.viewModeSelect.value = state.ui.viewMode;
  elements.anchorDateInput.value = state.ui.anchorDate;
}

function buildAnalyticsDataset(mode, anchorDate) {
  if (mode === 'daily') return buildDailyDataset(anchorDate);
  if (mode === 'monthly') return buildMonthlyDataset(anchorDate);
  if (mode === 'yearly') return buildYearlyDataset(anchorDate);
  return buildWeeklyDataset(anchorDate);
}

function buildDailyDataset(anchorDate) {
  const record = getRecord(anchorDate);
  const labels = [];
  const goalSeries = [];
  const actualSeries = [];
  const barLabels = [];
  const barGoalSeries = [];
  const barActualSeries = [];
  const events = [...(record.events || [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let cumulative = 0;

  for (let hour = 0; hour < 24; hour += 1) {
    const label = `${String(hour).padStart(2, '0')}h`;
    labels.push(label);

    const hourTotal = events
      .filter((event) => new Date(event.timestamp).getHours() === hour)
      .reduce((sum, event) => sum + event.amountMl, 0);

    cumulative += hourTotal;

    actualSeries.push(Math.round(cumulative));
    goalSeries.push(calculateTargetForHour(record.goalMl, hour, state.settings.startTime, state.settings.endTime));
    barLabels.push(label);
    barActualSeries.push(Math.round(hourTotal));
    barGoalSeries.push(Math.max(0, Math.round(calculateTargetForHour(record.goalMl, hour, state.settings.startTime, state.settings.endTime) - (hour > 0 ? calculateTargetForHour(record.goalMl, hour - 1, state.settings.startTime, state.settings.endTime) : 0))));
  }

  return {
    labels,
    goalSeries,
    actualSeries,
    barLabels,
    barGoalSeries,
    barActualSeries,
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
    labels.push(current.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''));
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
    periodLabel: anchor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  };
}

function buildYearlyDataset(anchorDate) {
  const anchor = new Date(`${anchorDate}T12:00:00`);
  const year = anchor.getFullYear();
  const labels = [];
  const goalSeries = [];
  const actualSeries = [];

  for (let month = 0; month < 12; month += 1) {
    let goal = 0;
    let actual = 0;
    const totalDays = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= totalDays; day += 1) {
      const record = getRecord(toDateKey(new Date(year, month, day)));
      goal += record.goalMl;
      actual += record.consumedMl;
    }
    labels.push(new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''));
    goalSeries.push(goal);
    actualSeries.push(actual);
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

function buildNotificationSchedule() {
  const notifications = [];
  const now = new Date();

  for (let offset = 0; offset < NOTIFICATION_LOOKAHEAD_DAYS; offset += 1) {
    const baseDate = new Date(now);
    baseDate.setDate(now.getDate() + offset);
    const times = buildTimesForDate(baseDate, state.settings.startTime, state.settings.endTime, state.settings.intervalMin);

    times.forEach((at, index) => {
      if (at <= now) return;
      notifications.push({
        id: notificationId(baseDate, index),
        title: 'Hora da agua',
        body: state.settings.message,
        schedule: {
          at,
          allowWhileIdle: true
        },
        extra: {
          source: 'water-reminder-mobile'
        }
      });
    });
  }

  return notifications.slice(0, MAX_PENDING_NOTIFICATIONS);
}

function buildTimesForDate(baseDate, startTime, endTime, intervalMin) {
  const times = [];
  let cursor = buildDateForTime(baseDate, startTime);
  const end = buildDateForTime(baseDate, endTime);

  while (cursor <= end) {
    times.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + intervalMin * 60 * 1000);
  }

  return times;
}

function computeNextReminderLabel() {
  if (!state.notificationsEnabled) return 'Notificacoes desativadas';
  const now = new Date();
  const times = buildNotificationSchedule().map((item) => item.schedule.at).sort((a, b) => a - b);
  const next = times.find((time) => time > now);
  return next ? formatDateTime(next) : 'Sem lembrete futuro';
}

function validateSettings(settings) {
  if (settings.goalMl < 100 || settings.goalMl > 10000) return 'Meta diaria precisa ficar entre 100 e 10000 ml.';
  if (settings.amountMl < 50 || settings.amountMl > 2000) return 'Dose por clique precisa ficar entre 50 e 2000 ml.';
  if (!settings.message) return 'Defina uma mensagem de lembrete.';
  if (toMinutes(settings.endTime) <= toMinutes(settings.startTime)) return 'O horario final precisa ser maior que o inicial.';
  if (settings.intervalMin < 1 || settings.intervalMin > 1440) return 'Intervalo precisa ficar entre 1 e 1440 minutos.';
  return null;
}

function rolloverDayIfNeeded() {
  const today = todayKey();
  if (state.daily.dateKey === today) {
    syncTodayRecord();
    return;
  }

  syncTodayRecord();
  state.daily = createDaily(today);
  syncTodayRecord();
  saveState();
  void pushRemoteState();
}

function syncTodayRecord() {
  state.daily.completed = state.daily.consumedMl >= state.settings.goalMl;
  state.history[state.daily.dateKey] = currentDailyRecord();
}

function getRecord(dateKey) {
  if (dateKey === state.daily.dateKey) {
    return currentDailyRecord();
  }

  const record = state.history[dateKey];
  return {
    dateKey,
    goalMl: record?.goalMl || state.settings.goalMl,
    consumedMl: record?.consumedMl || 0,
    events: [...(record?.events || [])]
  };
}

function currentDailyRecord() {
  return {
    dateKey: state.daily.dateKey,
    goalMl: state.settings.goalMl,
    consumedMl: state.daily.consumedMl,
    events: [...(state.daily.events || [])]
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    return {
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
      daily: { ...createDaily(todayKey()), ...(parsed.daily || {}) },
      history: parsed.history || {},
      notificationsEnabled: Boolean(parsed.notificationsEnabled),
      lastScheduleAt: parsed.lastScheduleAt || null,
      account: { ...DEFAULT_STATE.account, ...(parsed.account || {}) },
      ui: {
        viewMode: parsed.ui?.viewMode || DEFAULT_STATE.ui.viewMode,
        anchorDate: parsed.ui?.anchorDate || DEFAULT_STATE.ui.anchorDate
      }
    };
  } catch {
    return createInitialState();
  }
}

function createInitialState() {
  return structuredCloneSafe(DEFAULT_STATE);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    settings: state.settings,
    daily: state.daily,
    history: state.history,
    notificationsEnabled: state.notificationsEnabled,
    lastScheduleAt: state.lastScheduleAt,
    account: state.account,
    ui: state.ui
  }));
}

function createDaily(dateKey) {
  return {
    dateKey,
    consumedMl: 0,
    completed: false,
    events: []
  };
}

function todayKey() {
  return toDateKey(new Date());
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildDateForTime(baseDate, hhmm) {
  const [hour, minute] = hhmm.split(':').map(Number);
  const date = new Date(baseDate);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function toMinutes(hhmm) {
  const [hour, minute] = hhmm.split(':').map(Number);
  return hour * 60 + minute;
}

function notificationId(baseDate, index) {
  const dayNumber = Number(toDateKey(baseDate).replaceAll('-', ''));
  return dayNumber * 100 + index;
}

function buildLinearHourlyPlan(goalMl, startTime, endTime) {
  const hourly = new Array(24).fill(0);
  const startHour = Number(startTime.split(':')[0]);
  const endHour = Number(endTime.split(':')[0]);
  const activeHours = Math.max(endHour - startHour, 1);
  const perHour = goalMl / activeHours;
  let allocated = 0;

  for (let hour = startHour; hour < endHour; hour += 1) {
    const amount = hour === endHour - 1 ? goalMl - allocated : perHour;
    hourly[hour] = amount;
    allocated += amount;
  }

  return hourly;
}

function calculateTargetForHour(goalMl, hour, startTime, endTime) {
  const plannedByHour = buildLinearHourlyPlan(goalMl, startTime, endTime);
  let cumulative = 0;
  for (let index = 0; index <= hour; index += 1) {
    cumulative += plannedByHour[index];
  }
  return Math.round(cumulative);
}

function formatCompactMl(value) {
  if (value >= 1000) {
    const liters = value / 1000;
    return `${liters % 1 === 0 ? liters.toFixed(0) : liters.toFixed(1)}L`;
  }
  return `${Math.round(value)}`;
}

function formatMl(value) {
  return `${Math.round(value)} ml`;
}

function percentage(actual, goal) {
  if (!goal) return 0;
  return Math.min(999, Math.round((actual / goal) * 100));
}

function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatLongDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function formatShortDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit'
  });
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function setStatus(message) {
  elements.status.textContent = message;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function clearSvg(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function appendSvg(svg, child) {
  svg.appendChild(child);
}

function svgLine(x1, y1, x2, y2, className) {
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(y1));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(y2));
  line.setAttribute('class', className);
  return line;
}

function svgText(x, y, value, className, anchor = 'middle') {
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', String(x));
  text.setAttribute('y', String(y));
  text.setAttribute('text-anchor', anchor);
  text.setAttribute('class', className);
  text.textContent = value;
  return text;
}

function svgPolyline(points, className) {
  const polyline = document.createElementNS(SVG_NS, 'polyline');
  polyline.setAttribute('points', points.map((point) => point.join(',')).join(' '));
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('class', className);
  return polyline;
}

function svgCircle(cx, cy, r, className) {
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', String(cx));
  circle.setAttribute('cy', String(cy));
  circle.setAttribute('r', String(r));
  circle.setAttribute('class', className);
  return circle;
}

function widthPercentage(value, maxValue) {
  if (value <= 0) return 0;
  return Math.max(3, Math.round((value / maxValue) * 100));
}

function shiftAnchorDate(mode, anchorDate, offset) {
  const date = new Date(`${anchorDate}T12:00:00`);
  if (mode === 'daily') {
    date.setDate(date.getDate() + offset);
  } else if (mode === 'weekly') {
    date.setDate(date.getDate() + offset * 7);
  } else if (mode === 'monthly') {
    date.setMonth(date.getMonth() + offset);
  } else {
    date.setFullYear(date.getFullYear() + offset);
  }
  return toDateKey(date);
}

function getSelectedRange(mode, anchorDate) {
  const anchor = new Date(`${anchorDate}T12:00:00`);

  if (mode === 'daily') {
    return { start: toDateKey(anchor), end: toDateKey(anchor) };
  }

  if (mode === 'weekly') {
    const start = new Date(anchor);
    start.setDate(anchor.getDate() - anchor.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: toDateKey(start), end: toDateKey(end) };
  }

  if (mode === 'monthly') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { start: toDateKey(start), end: toDateKey(end) };
  }

  const start = new Date(anchor.getFullYear(), 0, 1);
  const end = new Date(anchor.getFullYear(), 11, 31);
  return { start: toDateKey(start), end: toDateKey(end) };
}
