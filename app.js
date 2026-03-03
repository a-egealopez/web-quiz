// ═══════════════════════════════════════════════════════════════
//  SBC STUDY HUB — app.js
//  Features: shuffle questions + options · filter (all/wrong/ok/flagged)
//  · one-by-one mode · localStorage progress · session history
//  · streak counter + toast · shake/pulse animations
//  · keyboard navigation · always-show correct answer · light/dark mode
// ═══════════════════════════════════════════════════════════════

// ── STATE ──────────────────────────────────────────────────────
const State = {
  questions:      [],   // full loaded array
  displayOrder:   [],   // indices into questions[], possibly shuffled
  filteredOrder:  [],   // displayOrder after active filter
  optionOrders:   {},   // qi → shuffled key array
  results:        {},   // qi → 'ok' | 'ko'
  flags:          {},   // qi → true
  score:          0,
  incorrect:      0,
  answered:       0,
  streak:         0,
  bestStreak:     0,
  shuffleMode:    false,
  viewMode:       'list',   // 'list' | 'one'
  activeFilter:   'all',    // 'all' | 'wrong' | 'ok' | 'flagged'
  oboIndex:       0,        // current index in filteredOrder for one-by-one
  currentThemeId: '1',
};

// ── DOM SHORTCUTS ───────────────────────────────────────────────
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── INIT ────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();
  bindEvents();
  load($('themeSelector').value);
});

function bindEvents() {
  $('themeSelector').addEventListener('change', e => load(e.target.value));

  $('btnShuffle').addEventListener('click', () => {
    State.shuffleMode = !State.shuffleMode;
    $('shufflePill').textContent = State.shuffleMode ? '⇄ aleatorio' : '⇄ orden original';
    $('shufflePill').className   = 'mp' + (State.shuffleMode ? ' on' : '');
    load(State.currentThemeId);
  });

  $('btnReset').addEventListener('click', () => load(State.currentThemeId));

  $('btnResults').addEventListener('click', showResultsModal);
  $('btnCloseResults').addEventListener('click', () => closeModal('ovResults'));
  $('btnRetry').addEventListener('click', () => { closeModal('ovResults'); load(State.currentThemeId); });
  $('btnRetryWrong').addEventListener('click', () => {
    closeModal('ovResults');
    setFilter('wrong');
  });

  $('btnHistory').addEventListener('click', showHistoryModal);
  $('btnCloseHistory').addEventListener('click', () => closeModal('ovHistory'));
  $('btnClearHistory').addEventListener('click', () => {
    localStorage.removeItem('sbc_history');
    renderHistory();
  });

  $('btnTheme').addEventListener('click', toggleTheme);

  $('btnViewList').addEventListener('click', () => setViewMode('list'));
  $('btnViewOne').addEventListener('click',  () => setViewMode('one'));

  $('btnPrev').addEventListener('click', () => oboNavigate(-1));
  $('btnNext').addEventListener('click', () => oboNavigate(+1));

  // Filter buttons
  $$('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter));
  });

  // Keyboard: A B C D / arrow keys in one-by-one / R to reset
  document.addEventListener('keydown', onKeyDown);
}

// ── LOAD THEME ──────────────────────────────────────────────────
async function load(id) {
  State.currentThemeId = id;
  resetSession();
  $('qc').innerHTML = '<div class="empty-state">Cargando preguntas…</div>';
  $('obo-slot').innerHTML = '';

  try {
    const res = await fetch(`./data/theme${id}.json`);
    if (!res.ok) throw new Error(`No se encontró theme${id}.json`);
    State.questions = await res.json();

    State.displayOrder = State.questions.map((_, i) => i);
    if (State.shuffleMode) State.displayOrder = shuf([...State.displayOrder]);

    // Always randomise option order per question
    State.questions.forEach((q, qi) => {
      State.optionOrders[qi] = shuf(Object.keys(q.options));
    });

    $('totalQ').textContent = State.questions.length;
    applyFilter(State.activeFilter, false);
    render();
  } catch (e) {
    $('qc').innerHTML = `<div class="empty-state" style="color:var(--red)">⚠ ${e.message}</div>`;
  }
}

// ── FILTER ──────────────────────────────────────────────────────
function setFilter(filter) {
  State.activeFilter = filter;
  $$('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  applyFilter(filter, true);
}

function applyFilter(filter, rerender) {
  switch (filter) {
    case 'wrong':
      State.filteredOrder = State.displayOrder.filter(qi => State.results[qi] === 'ko');
      break;
    case 'ok':
      State.filteredOrder = State.displayOrder.filter(qi => State.results[qi] === 'ok');
      break;
    case 'flagged':
      State.filteredOrder = State.displayOrder.filter(qi => State.flags[qi]);
      break;
    default:
      State.filteredOrder = [...State.displayOrder];
  }
  State.oboIndex = 0;
  if (rerender) render();
}

// ── RENDER (dispatcher) ─────────────────────────────────────────
function render() {
  if (State.viewMode === 'one') {
    $('obo-wrap').classList.add('active');
    $('qc').style.display = 'none';
    renderObo();
  } else {
    $('obo-wrap').classList.remove('active');
    $('qc').style.display = 'flex';
    renderList();
  }
}

// ── LIST RENDER ─────────────────────────────────────────────────
function renderList() {
  const qc = $('qc');
  qc.innerHTML = '';

  if (!State.filteredOrder.length) {
    qc.innerHTML = '<div class="empty-state">No hay preguntas para este filtro.</div>';
    return;
  }

  State.filteredOrder.forEach((qi, di) => {
    const card = buildCard(qi, di, State.filteredOrder.length);
    card.style.animationDelay = di * 20 + 'ms';
    qc.appendChild(card);
  });
}

// ── ONE-BY-ONE RENDER ────────────────────────────────────────────
function renderObo() {
  const slot = $('obo-slot');
  const counter = $('oboCounter');

  if (!State.filteredOrder.length) {
    slot.innerHTML = '<div class="empty-state">No hay preguntas para este filtro.</div>';
    counter.textContent = '— / —';
    return;
  }

  const idx = State.oboIndex;
  const qi  = State.filteredOrder[idx];
  counter.textContent = `${idx + 1} / ${State.filteredOrder.length}`;

  slot.innerHTML = '';
  const card = buildCard(qi, idx, State.filteredOrder.length);
  slot.appendChild(card);

  $('btnPrev').disabled = idx === 0;
  $('btnNext').disabled = idx === State.filteredOrder.length - 1;
}

function oboNavigate(dir) {
  const max = State.filteredOrder.length - 1;
  State.oboIndex = Math.max(0, Math.min(max, State.oboIndex + dir));
  renderObo();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── BUILD CARD ───────────────────────────────────────────────────
function buildCard(qi, displayIdx, total) {
  const q    = State.questions[qi];
  const isM  = Array.isArray(q.answer);
  const card = document.createElement('div');
  card.className = 'qcard';
  card.id = `card-${qi}`;

  // Restore state if already answered
  if (State.results[qi] === 'ok') card.classList.add('answered-ok');
  if (State.results[qi] === 'ko') card.classList.add('answered-ko');
  if (State.flags[qi])            card.classList.add('is-flagged');

  const keys = State.optionOrders[qi];
  const opts = keys.map(k => {
    const answered = State.results[qi] !== undefined;
    const isCorrect = Array.isArray(q.answer) ? q.answer.includes(k) : q.answer === k;
    let cls = 'ob';
    if (answered) {
      if (isCorrect) cls += ' ok';
    }
    const disabled = answered ? 'disabled' : '';
    return `
      <button class="${cls}" data-key="${k}" ${disabled}
        onclick="handleOpt(this,'${k}',${qi},${isM})">
        <span class="ok-key">${k}</span>
        <span>${q.options[k]}</span>
        <span class="correct-tag">✓ correcta</span>
      </button>`;
  }).join('');

  const resultHtml = State.results[qi]
    ? `<span class="rc ${State.results[qi]}">${State.results[qi] === 'ok' ? '✓ Correcto' : '✗ Incorrecto'}</span>`
    : '';

  const fbShow = (State.results[qi] && q.description) ? 'show' : '';
  const flagOn = State.flags[qi] ? 'on' : '';

  card.innerHTML = `
    <div class="qm">
      <span class="qn">#${displayIdx + 1}</span>
      <span class="bdg bt">Tema ${q.theme}</span>
      ${isM ? '<span class="bdg bm">Multirespuesta</span>' : ''}
      <button class="flag-btn ${flagOn}" onclick="toggleFlag(${qi})" title="Marcar para revisar">🚩</button>
    </div>
    <p class="qtxt">${q.question}</p>
    <div class="og" id="og-${qi}">${opts}</div>
    ${isM && !State.results[qi] ? `<button class="smb" id="sm-${qi}" onclick="validateM(${qi})">Comprobar selección →</button>` : ''}
    <div id="res-${qi}">${resultHtml}</div>
    <div class="fb ${fbShow}" id="fb-${qi}">
      <div class="fbl">📌 Nota</div>
      ${q.description || ''}
    </div>`;

  return card;
}

// ── HANDLE OPTION ────────────────────────────────────────────────
function handleOpt(btn, key, qi, isM) {
  if (btn.disabled) return;
  if (isM) {
    btn.classList.toggle('sel');
    btn.dataset.selected = btn.classList.contains('sel') ? 'true' : 'false';
  } else {
    validateS(btn, key, qi);
  }
}

// ── VALIDATE SINGLE ──────────────────────────────────────────────
function validateS(btn, key, qi) {
  const q   = State.questions[qi];
  const ok  = key === q.answer;

  $$(`#og-${qi} .ob`).forEach(b => {
    b.disabled = true;
    if (b.dataset.key === q.answer) b.classList.add('ok');
  });
  if (!ok) btn.classList.add('ko');

  finalise(qi, ok);
}

// ── VALIDATE MULTI ───────────────────────────────────────────────
function validateM(qi) {
  const q    = State.questions[qi];
  const btns = $$(`#og-${qi} .ob`);
  let sel    = [];

  btns.forEach(b => {
    b.disabled = true;
    if (b.dataset.selected === 'true') sel.push(b.dataset.key);
    if (q.answer.includes(b.dataset.key)) b.classList.add('ok');
    else if (b.dataset.selected === 'true') b.classList.add('ko');
  });

  const ok = JSON.stringify(sel.sort()) === JSON.stringify([...q.answer].sort());
  const sb = $('sm-' + qi);
  if (sb) sb.style.display = 'none';

  finalise(qi, ok);
}

// ── FINALISE ANSWER ──────────────────────────────────────────────
function finalise(qi, ok) {
  State.results[qi] = ok ? 'ok' : 'ko';

  if (ok) {
    State.score++;
    State.streak++;
    if (State.streak > State.bestStreak) State.bestStreak = State.streak;
    if (State.streak >= 3) showStreakToast(State.streak);
  } else {
    State.incorrect++;
    State.streak = 0;
  }
  State.answered++;

  // Card animation
  const card = $(`card-${qi}`);
  if (card) {
    card.classList.remove('do-shake', 'do-pulse', 'answered-ok', 'answered-ko');
    void card.offsetWidth; // reflow
    card.classList.add(ok ? 'do-pulse' : 'do-shake');
    card.classList.add(ok ? 'answered-ok' : 'answered-ko');
    setTimeout(() => card.classList.remove('do-shake', 'do-pulse'), 600);
  }

  // Result chip
  const res = $(`res-${qi}`);
  if (res) res.innerHTML = `<span class="rc ${ok ? 'ok' : 'ko'}">${ok ? '✓ Correcto' : '✗ Incorrecto'}</span>`;

  // Feedback note (always show if there's a description; if not, still note correct answer via .ok class on button)
  const fb = $(`fb-${qi}`);
  if (fb && State.questions[qi].description) fb.classList.add('show');

  saveProgress();
  updateStats();
  updateProgress();
}

// ── FLAG ─────────────────────────────────────────────────────────
function toggleFlag(qi) {
  State.flags[qi] = !State.flags[qi];
  const card = $(`card-${qi}`);
  if (card) {
    card.classList.toggle('is-flagged', State.flags[qi]);
    const btn = card.querySelector('.flag-btn');
    if (btn) btn.classList.toggle('on', State.flags[qi]);
  }
  // Refresh filter if we're in flagged view
  if (State.activeFilter === 'flagged') {
    applyFilter('flagged', true);
  }
  saveProgress();
}

// ── VIEW MODE ────────────────────────────────────────────────────
function setViewMode(mode) {
  State.viewMode = mode;
  $('btnViewList').classList.toggle('active', mode === 'list');
  $('btnViewOne').classList.toggle('active',  mode === 'one');
  render();
}

// ── KEYBOARD ─────────────────────────────────────────────────────
function onKeyDown(e) {
  // Don't capture if user is typing somewhere
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;

  const key = e.key.toLowerCase();

  // Arrow keys → one-by-one navigation
  if (State.viewMode === 'one') {
    if (key === 'arrowleft'  || key === 'arrowup')   { e.preventDefault(); oboNavigate(-1); return; }
    if (key === 'arrowright' || key === 'arrowdown')  { e.preventDefault(); oboNavigate(+1); return; }
  }

  // A–H → select option on the active/first unanswered card
  if (/^[a-h]$/.test(key)) {
    const targetQi = getKeyboardTargetQi();
    if (targetQi === null) return;
    const q    = State.questions[targetQi];
    if (!q || State.results[targetQi] !== undefined) return;
    const isM  = Array.isArray(q.answer);
    const btn  = document.querySelector(`#og-${targetQi} .ob[data-key="${key}"]`);
    if (btn && !btn.disabled) handleOpt(btn, key, targetQi, isM);
    return;
  }

  // Enter → submit multi-answer if applicable
  if (key === 'enter') {
    const targetQi = getKeyboardTargetQi();
    if (targetQi === null) return;
    const sb = $('sm-' + targetQi);
    if (sb && sb.style.display !== 'none') validateM(targetQi);
  }
}

function getKeyboardTargetQi() {
  if (State.viewMode === 'one') {
    return State.filteredOrder[State.oboIndex] ?? null;
  }
  // List mode: first unanswered visible card
  for (const qi of State.filteredOrder) {
    if (State.results[qi] === undefined) return qi;
  }
  return null;
}

// ── STREAK TOAST ─────────────────────────────────────────────────
let toastTimer = null;
function showStreakToast(n) {
  const toast = $('streakToast');
  const msgs  = { 3:'¡3 seguidas!', 5:'🔥 ¡5 en racha!', 10:'🏆 ¡10 seguidas!', 15:'🚀 ¡15 seguidas!' };
  const msg   = msgs[n] || (n % 5 === 0 ? `🔥 ¡${n} seguidas!` : null);
  if (!msg) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ── STATS & PROGRESS ─────────────────────────────────────────────
function updateStats() {
  $('answeredQ').textContent = State.answered;
  $('correctQ').textContent  = State.score;
  $('incorrectQ').textContent= State.incorrect;
  $('pctQ').textContent      = State.answered > 0 ? Math.round(State.score / State.answered * 100) + '%' : '—';
  $('streakQ').textContent   = State.streak;
}

function updateProgress() {
  const t = State.questions.length || 0;
  const p = t > 0 ? (State.answered / t) * 100 : 0;
  $('progressBar').style.width = p + '%';
  $('progressText').textContent = State.answered + ' / ' + t;
}

function resetSession() {
  Object.assign(State, { score:0, incorrect:0, answered:0, streak:0, bestStreak:0, results:{}, flags:{}, oboIndex:0, activeFilter:'all' });
  $('totalQ').textContent = '—';
  $('answeredQ').textContent = '0';
  $('correctQ').textContent  = '0';
  $('incorrectQ').textContent= '0';
  $('pctQ').textContent      = '—';
  $('streakQ').textContent   = '0';
  $('progressBar').style.width = '0%';
  $('progressText').textContent = '0 / 0';
  $$('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
}

// ── LOCAL STORAGE — PROGRESS ──────────────────────────────────────
function saveProgress() {
  const key = `sbc_progress_theme${State.currentThemeId}`;
  const data = { results: State.results, flags: State.flags, score: State.score, incorrect: State.incorrect, answered: State.answered };
  localStorage.setItem(key, JSON.stringify(data));
}

function loadProgress() {
  const key  = `sbc_progress_theme${State.currentThemeId}`;
  const raw  = localStorage.getItem(key);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    Object.assign(State, { results: data.results || {}, flags: data.flags || {}, score: data.score || 0, incorrect: data.incorrect || 0, answered: data.answered || 0 });
  } catch {}
}

// ── LOCAL STORAGE — HISTORY ──────────────────────────────────────
function saveToHistory() {
  if (State.answered === 0) return;
  const key  = 'sbc_history';
  const hist = JSON.parse(localStorage.getItem(key) || '[]');
  hist.unshift({
    date:      new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }),
    theme:     State.currentThemeId,
    total:     State.questions.length,
    answered:  State.answered,
    score:     State.score,
    pct:       State.questions.length > 0 ? Math.round(State.score / State.questions.length * 100) : 0,
    bestStreak: State.bestStreak,
  });
  localStorage.setItem(key, JSON.stringify(hist.slice(0, 20))); // keep last 20
}

// ── RESULTS MODAL ─────────────────────────────────────────────────
function showResultsModal() {
  saveToHistory();
  const t   = State.questions.length;
  const p   = t > 0 ? Math.round(State.score / t * 100) : 0;
  const emoji = p >= 80 ? '🏆' : p >= 60 ? '📚' : '💪';
  const title = p >= 80 ? '¡Excelente!' : p >= 60 ? 'Buen trabajo' : 'Sigue practicando';

  $('mEmoji').textContent = emoji;
  $('mTitle').textContent = title;
  $('mScore').textContent = p + '%';
  $('mScore').style.color = p >= 80 ? 'var(--green)' : p >= 60 ? 'var(--amber)' : 'var(--red)';
  $('mSub').textContent   = `${State.score} correctas · ${State.incorrect} incorrectas · ${State.answered} respondidas de ${t}`;

  const hasWrong = Object.values(State.results).some(r => r === 'ko');
  $('btnRetryWrong').style.display = hasWrong ? 'inline-flex' : 'none';

  openModal('ovResults');
}

// ── HISTORY MODAL ─────────────────────────────────────────────────
function showHistoryModal() {
  renderHistory();
  openModal('ovHistory');
}

function renderHistory() {
  const hist = JSON.parse(localStorage.getItem('sbc_history') || '[]');
  const el   = $('histContent');

  if (!hist.length) {
    el.innerHTML = '<p style="color:var(--text3);font-size:13px;text-align:center;padding:20px 0">Sin sesiones guardadas todavía.</p>';
    return;
  }

  const themeNames = { '1': 'Tema 1', '2': 'Tema 2' };
  el.innerHTML = `
    <p class="hist-title">Últimas ${hist.length} sesiones</p>
    <div class="hist-list">
      ${hist.map(h => {
        const color = h.pct >= 80 ? 'var(--green)' : h.pct >= 60 ? 'var(--amber)' : 'var(--red)';
        return `
          <div class="hist-item">
            <span style="font-weight:600">${themeNames[h.theme] || 'Tema ' + h.theme}</span>
            <span class="hi-date">${h.date}</span>
            <span class="hi-score" style="color:${color}">${h.pct}%</span>
            <span style="color:var(--text3);font-size:12px">${h.score}/${h.total} · 🔥${h.bestStreak}</span>
          </div>`;
      }).join('')}
    </div>`;
}

// ── MODAL HELPERS ─────────────────────────────────────────────────
function openModal(id)  { $(id).classList.add('show'); }
function closeModal(id) { $(id).classList.remove('show'); }

// ── THEME TOGGLE ──────────────────────────────────────────────────
function toggleTheme() {
  const html    = document.documentElement;
  const isDark  = html.getAttribute('data-theme') !== 'light';
  const next    = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  $('btnTheme').textContent = next === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('sbc_theme', next);
}

function applyStoredTheme() {
  const saved = localStorage.getItem('sbc_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  $('btnTheme').textContent = saved === 'dark' ? '🌙' : '☀️';
}

// ── UTILS ─────────────────────────────────────────────────────────
function shuf(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}