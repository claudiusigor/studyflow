const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const failures = [];

function check(name, condition, detail = '') {
  if (condition) console.log(`OK ${name}`);
  else {
    console.error(`FAIL ${name}${detail ? ` - ${detail}` : ''}`);
    failures.push(name);
  }
}

function inlineScript() {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(Boolean);
  return scripts.at(-1) || '';
}

function localRefs() {
  const staticHtml = html.replace(/<script>[\s\S]*?<\/script>/gi, '');
  const refs = [...staticHtml.matchAll(/(?:src|href)=["']([^"'$]+)["']/g)]
    .map(match => match[1])
    .filter(ref => !ref.startsWith('http') && !ref.startsWith('data:') && !ref.startsWith('#'));
  for (const icon of manifest.icons || []) refs.push(icon.src);
  for (const shortcut of manifest.shortcuts || []) {
    for (const icon of shortcut.icons || []) refs.push(icon.src);
  }
  for (const match of sw.matchAll(/'\.\/([^']+)'/g)) refs.push(match[1]);
  return [...new Set(refs.map(ref => ref.replace(/^\.\//, '')).filter(Boolean))];
}

function jsTextLiterals(source) {
  return [...source.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)]
    .map(([, quote, value]) => quote === '`' ? value.replace(/\$\{[\s\S]*?\}/g, '') : value)
    .filter(value => value.length < 400)
    .filter(value => !/^\.?\//.test(value) && !/^https?:/i.test(value))
    .filter(value => !/\b(function|const|let|return)\b/.test(value))
    .join('\n');
}

function hasMojibakeText(source) {
  return /\u00c3|\u00c2|\u00ef\u00bf\u00bd|\ufffd|\u00e2[\u0080-\u20ff]|\u00f0[\u0080-\u20ff]|[A-Za-zÀ-ÿ]\?[A-Za-zÀ-ÿ]/.test(source);
}

function attrValue(attrs, name) {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}=["']([^"']+)["']`));
  return match ? match[1] : '';
}

async function run() {
  const script = inlineScript();
  check('inline JavaScript parses', (() => { try { new Function(script); return true; } catch (error) { console.error(error); return false; } })());

  const refs = localRefs();
  const missing = refs.filter(ref => ref !== '.' && !fs.existsSync(path.join(root, ref)));
  check('local assets referenced by HTML/manifest/SW exist', missing.length === 0, missing.join(', '));

  check('manifest has standalone display', manifest.display === 'standalone');
  check('manifest has required icons', (manifest.icons || []).some(icon => icon.sizes === '192x192') && (manifest.icons || []).some(icon => icon.sizes === '512x512'));
  check('service worker precaches app shell', sw.includes("'./index.html'") && sw.includes("'./manifest.json'"));
  check('service worker has offline navigation fallback', sw.includes('OFFLINE_DOCUMENT') && sw.includes("event.request.mode === 'navigate'"));
  check('service worker runtime-caches approved external libraries', sw.includes('unpkg.com') && sw.includes('cdn.jsdelivr.net'));

  const external = [...html.matchAll(/<(script|link)\b[^>]*(?:src|href)=["'](https?:\/\/[^"']+)["'][^>]*>/g)].map(match => match[0]);
  check('no Google font dependency remains', !external.some(tag => tag.includes('fonts.googleapis.com') || tag.includes('fonts.gstatic.com')));
  check('lucide dependency is version pinned', html.includes('lucide@0.468.0') && !html.includes('lucide@latest'));

  check('semantic landmarks exist', /<header\b/.test(html) && /<nav\b/.test(html) && /<main\b/.test(html) && /<h1\b/.test(html));
  check('professional sidebar exists', html.includes('class="app-sidebar"') && html.includes('Área de estudos PMMG') && html.includes('side-edit-layout') && html.includes('id="sidebar-toggle"'));
  check('sidebar toggle uses refined chevrons', html.includes('sidebar-toggle-mark') && html.includes('Recolher menu lateral') && script.includes("(collapsed ?'›' : '‹')") && !script.includes('panel-left-close') && !script.includes('panel-left-open'));
  check('professional topbar exists', html.includes('class="workspace-search"') && html.includes('Abrir agenda mensal') && html.includes('workspace-title'));
  check('topbar period pill opens agenda', html.includes('id="topbar-period-pill"') && script.includes("on('topbar-period-pill','click'") && script.includes("setActiveView('agenda')"));
  check('dashboard 2.0 topbar polish exists', html.includes('id="btn-notifications"') && html.includes('class="topbar-icon-btn"') && script.includes("Sem notificações no momento"));
  check('professional light theme tokens exist', html.includes('--bg-base:#f5efe7') && html.includes('--surface:#fffdf9') && html.includes('--amber:#ff5a1f'));
  check('hero GridStack item exists', html.includes('gs-id="hero"') && html.includes('Próxima ação recomendada') && html.includes('id="next-session-chip"'));
  check('session annotation card exists', html.includes('session-note-card') && html.includes('id="note-meta-row"') && html.includes('id="note-summary-input"') && html.includes('id="note-insights-grid"'));
  check('session annotation audio strip exists', html.includes('id="note-audio-toggle"') && html.includes('id="note-waveform"') && html.includes('id="note-audio-current"') && html.includes('id="note-tts-btn"'));
  check('session annotation modal supports insights', html.includes('id="note-form-summary"') && html.includes('id="note-form-insights"') && html.includes('id="note-form-new-insight"') && script.includes('renderNoteFormInsights') && script.includes('upsertSessionInsight'));
  check('modals expose dialog semantics', [...html.matchAll(/<div id="modal-[^"]+" class="modal"/g)].length > 0 && !/<div id="modal-[^"]+" class="modal"(?![^>]*role="dialog")/.test(html));
  check('modals start aria-hidden', !/<div id="modal-[^"]+" class="modal"(?![^>]*aria-hidden="true")/.test(html));
  check('focus trap is implemented', script.includes('Modal.trap') && script.includes('FOCUSABLE_SEL'));
  check('reduced motion support exists', html.includes('prefers-reduced-motion:reduce'));
  check('mobile GridStack stacking CSS exists', html.includes('body:not(.edit-mode) .grid-stack{display:flex!important;flex-direction:column!important'));
  check('mobile edit mode keeps GridStack interactive', script.includes('disableOneColumnMode: true') && script.includes("const narrowMobile = window.matchMedia('(max-width: 680px)').matches;") && script.includes("resizable: { handles: narrowMobile ? 's' : (coarsePointer ? 'se,s,sw' : 'e,se,s,sw,w') }") && script.includes('alwaysShowResizeHandle: !narrowMobile && coarsePointer') && !script.includes('mobile || !gsEditMode') && html.includes('body.edit-mode .grid-stack{display:block!important;height:auto!important;min-height:480px!important}') && html.includes('body.edit-mode .grid-stack-item .ui-resizable-handle:not(.ui-resizable-s){') && html.includes('body.edit-mode .grid-stack-item .ui-resizable-s{') && html.includes("toast('Modo edição ativo: arraste pelo topo do card e redimensione pelas bordas.')"));
  check('next-session CTA exists', html.includes('id="next-session-card"') && script.includes('function renderNextSession'));
  check('hero CTA is in the dashboard grid', /gs-id="hero"[\s\S]*id="next-session-card"/.test(html));
  check('workspace view shell exists', html.includes('id="appMain"') && html.includes('id="workspaceView"') && html.includes('workspace-shell'));
  check('sidebar uses data-view navigation', html.includes('data-view="dashboard"') && html.includes('data-view="agenda"') && html.includes('data-view="tasks"') && html.includes('data-view="pomodoro"') && html.includes('data-view="subjects"') && html.includes('data-view="mood"') && !html.includes('data-side-target'));
  check('sidebar active state is view-only', script.includes("aria-current','page'") && !script.includes("setSidebarActive('#side-edit-layout')") && !script.includes("setSidebarActive('#side-pmmg-reset')"));
  check('sidebar edital opens external PDF', script.includes('PMMG_EDITAL_URL') && script.includes('pmminas.com/wp-content/uploads/2024/05/EDITAL-VERTICALIZADO-CFSD-PMMG-2025') && script.includes("on('side-pmmg-reset','click',()=>{openPMMGEdital()"));
  check('sidebar can collapse and open subjects manager', script.includes('function setSidebarCollapsed') && script.includes('sf_sidebar_collapsed') && html.includes('id="side-subjects-btn"') && script.includes('openSubjectsModal'));
  check('active view persists and renders dedicated screens', script.includes('sf_active_view') && script.includes('function setActiveView') && script.includes('function renderWorkspace') && script.includes('function bindWorkspaceActions'));
  check('theme toggle switches dark mode', html.includes('id="side-theme-toggle"') && html.includes('class="switch"') && html.includes('class="slider"') && html.includes('role="switch"') && html.includes('body.theme-dark') && script.includes('function setThemeMode') && script.includes('sf_theme'));
  check('subjects and mood open dedicated views', html.includes('data-view="subjects"') && html.includes('data-view="mood"') && html.includes('id="workspaceView"'));
  check('subject content architecture exists', script.includes('SUBJECT_TOPIC_SEED') && script.includes('TOPIC_STATUS_META') && script.includes('function buildSubjectDetailWorkspace') && script.includes('function calculateSubjectProgress'));
  check('subject migration syncs only official edital subjects', script.includes('function syncSubjectsToOfficialEdital') && script.includes('syncStorageToOfficialEdital();') && !script.includes("{id:'s2', name:'Matemática'") && !script.includes("{id:'s11', name:'Direito Penal'") && !script.includes("{id:'s12', name:'Legislação PM'"));
  check('subject overview cards open contents', html.includes('subject-overview-card') && script.includes('data-action="subject-open"') && script.includes('Ver conteúdos'));
  check('subjects workspace uses split detail layout', html.includes('subjects-master-layout') && html.includes('subjects-side-column') && script.includes('buildSubjectsHeroCard'));
  check('topic detail controls exist', html.includes('topic-search-input') && html.includes('topic-filter-select') && html.includes('topic-row') && script.includes('data-action="topic-cycle-status"'));
  check('PMMG topic seed includes Portuguese edital items', script.includes('Adequação conceitual') && script.includes('Colocação pronominal') && script.includes('Noções de Direito e Direitos Humanos'));
  check('pomodoro handles completion and reset realistically', script.includes('if(this.leftSec<=0)') && script.includes("this.phase='focus'; this.sessionCount=0;") && script.includes('const elapsedMin = Math.round((this.totalSec - this.leftSec) / 60);'));
  check('next session updates after task and subject changes', script.includes('renderNextSession(); refreshWorkspaceView();') && script.includes('const lastSession = sessions[0] || null;'));
  check('hero CTA leads to pomodoro view', script.includes("setActiveView('pomodoro')") && html.includes('id="btn-next-session-start"'));
  check('delicate motion avoids continuous timer pulsing', html.includes('Dashboard 2.0 polish') && !html.includes('#pomodoro.is-active .pomo-time{animation:countdownBreath'));
  check('agenda week strip polish exists', html.includes('.schedule-week-strip{grid-template-columns:repeat(7,minmax(42px,1fr));gap:8px') && script.includes('schedule-day-pill') && script.includes('Nenhuma aula cadastrada.'));
  check('agenda workspace has interactive calendar controls', html.includes('data-action="agenda-month-prev"') && html.includes('data-action="agenda-month-next"') && html.includes('data-action="agenda-month-today"') && html.includes('data-action="agenda-day-add"') && html.includes('data-action="agenda-edit"'));
  check('schedule modal supports edit flow', script.includes('let _editingScheduleId = null') && script.includes('function updateScheduleEvent(') && script.includes('openScheduleModal({eventId: button.dataset.id})'));
  const visibleHtml = html.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const uiCopySurface = `${visibleHtml}\n${jsTextLiterals(script)}`;
  check('primary UI copy is readable Portuguese', !hasMojibakeText(uiCopySurface) && html.includes('Começar foco') && html.includes('Matérias'));
  check('visible UI has no mojibake', !hasMojibakeText(visibleHtml));
  check('dynamic UI copy has no mojibake', !hasMojibakeText(jsTextLiterals(script)));
  const brokenBullet = String.fromCharCode(0x00e2, 0x20ac, 0x00a2);
  check('hero dynamic copy uses clean separators', script.includes("'Base do ciclo • Revisão 1'") && script.includes("'Matérias • Planejamento inicial'") && !script.includes(brokenBullet));
  check('tablet touch targets are at least 44px in key controls', html.includes('.nav-btn,.menu-btn{width:44px;height:44px;}') && html.includes('.workspace-chip{display:inline-flex;align-items:center;justify-content:center;min-height:44px;') && html.includes('.workspace-row-icon{width:44px;height:44px;'));
  check('runtime guardrails exist', script.includes('function safeCall') && script.includes('unhandledrejection') && script.includes('safeCall(()=>initEventBindings()'));
  check('storage versioning exists', script.includes('STORAGE_VERSION') && script.includes('sf_data_version') && script.includes('function migrateAppData'));
  check('release telemetry exists', script.includes('const Analytics') && script.includes('focus_start') && script.includes('task_done') && script.includes('theme_toggle'));
  check('backup controls exist', html.includes('id=\"btn-export-json\"') && html.includes('id=\"btn-import-json\"') && html.includes('id=\"import-json-file\"') && script.includes('function exportAppData') && script.includes('function importAppData'));

  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  const unnamedIconButtons = buttons.filter(([, attrs, body]) => {
    const hasName = /aria-label=|title=/.test(attrs) || body.replace(/<i[^>]*><\/i>/g, '').replace(/<img[^>]*>/g, '').replace(/<[^>]+>/g, '').trim().length > 0;
    return !hasName;
  });
  check('icon-only buttons have accessible names', unnamedIconButtons.length === 0, unnamedIconButtons.slice(0, 3).map(button => button[0].slice(0, 80)).join(' | '));
  const unhandledButtons = buttons.filter(([, attrs]) => {
    const id = attrValue(attrs, 'id');
    const action = attrValue(attrs, 'data-action');
    const className = attrValue(attrs, 'class');
    if (/onclick=/.test(attrs) || /data-view=/.test(attrs)) return false;
    if (action && (action.includes('${') || script.includes(`case '${action}'`) || script.includes(`[data-action="${action}"]`) || script.includes(`data-action="${action}"`))) return false;
    if (id && (script.includes(`on('${id}'`) || script.includes(`getElementById('${id}')`) || script.includes(`byId('${id}')`))) return false;
    if (className.includes('widget-menu-btn') && script.includes("closest('.widget-menu-btn')")) return false;
    if (className.includes('mood-emoji-btn') && script.includes("querySelectorAll('.mood-emoji-btn')")) return false;
    if (className.includes('session-note-icon-option') && script.includes('#note-form-icon-pick .session-note-icon-option')) return false;
    if (/data-min=/.test(attrs) && script.includes('#pomo-dur-btns button')) return false;
    if (/data-search-index=/.test(attrs) && script.includes('[data-search-index]')) return false;
    if (/data-edit=/.test(attrs) && script.includes('[data-edit]')) return false;
    if (/data-del=/.test(attrs) && script.includes('[data-del]')) return false;
    if (className.includes('sched-delete') && script.includes("closest('.sched-delete')")) return false;
    return true;
  });
  check('static buttons are wired to actions', unhandledButtons.length === 0, unhandledButtons.slice(0, 3).map(button => button[0].slice(0, 100)).join(' | '));

  const ids = [...html.matchAll(/(?:^|\s)id=["']([^"'$]+)["']/g)].map(match => match[1]).filter(id => !id.includes('${'));
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  check('static ids are unique', duplicateIds.length === 0, duplicateIds.join(', '));

  const ctx = { console, crypto };
  vm.createContext(ctx);
  const subset = script.slice(script.indexOf('const MONTH_ABBR'), script.indexOf('function getPMMGSubjects'));
  vm.runInContext(`${subset}\nthis.__test={fmtMin,fmtSec,timeToMin,minToTime,esc,dateKey,AppStats,calculateSubjectProgress};`, ctx);
  const T = ctx.__test;
  const today = new Date();
  const todayKey = T.dateKey(today);
  const sessions = [
    { type: 'focus', startedAt: today.toISOString(), durationMinutes: 50, subjectId: 's1' },
    { type: 'break', startedAt: today.toISOString(), durationMinutes: 10, subjectId: 's1' },
  ];
  const tasks = [
    { done: true, completedAt: today.toISOString() },
  ];
  check('time helper formatting works', T.fmtMin(75) === '1h 15m' && T.fmtSec(65) === '01:05' && T.minToTime(T.timeToMin('08:30')) === '08:30');
  check('HTML escape helper works', T.esc('<x>&"') === '&lt;x&gt;&amp;&quot;');
  check('study stats aggregate focus and breaks', T.AppStats.focusOnDate(sessions, todayKey) === 50 && T.AppStats.breakOnDate(sessions, todayKey) === 10);
  check('weekly stats cover seven days', T.AppStats.weekDays(sessions, tasks).length === 7 && T.AppStats.weeklyLineData(sessions).focus.length === 7);
  check('subject topic progress weights work', T.calculateSubjectProgress({topics:[{status:'done'},{status:'review'},{status:'studying'},{status:'not_started'}]}) === 54);

  for (const icon of ['icons/icon-192.png', 'icons/icon-512.png']) {
    const metadata = await sharp(path.join(root, icon)).metadata();
    const expected = icon.includes('192') ? 192 : 512;
    check(`${icon} dimensions`, metadata.width === expected && metadata.height === expected, `${metadata.width}x${metadata.height}`);
  }

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});

