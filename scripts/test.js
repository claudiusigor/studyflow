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
  check('professional topbar exists', html.includes('class="workspace-search"') && html.includes('Período mensal') && html.includes('workspace-title'));
  check('professional light theme tokens exist', html.includes('--bg-base:#f5efe7') && html.includes('--surface:#fffdf9') && html.includes('--amber:#ff5a1f'));
  check('hero GridStack item exists', html.includes('gs-id="hero"') && html.includes('Próximo foco'));
  check('modals expose dialog semantics', [...html.matchAll(/<div id="modal-[^"]+" class="modal"/g)].length > 0 && !/<div id="modal-[^"]+" class="modal"(?![^>]*role="dialog")/.test(html));
  check('modals start aria-hidden', !/<div id="modal-[^"]+" class="modal"(?![^>]*aria-hidden="true")/.test(html));
  check('focus trap is implemented', script.includes('Modal.trap') && script.includes('FOCUSABLE_SEL'));
  check('reduced motion support exists', html.includes('prefers-reduced-motion:reduce'));
  check('mobile GridStack stacking CSS exists', html.includes('body:not(.edit-mode) .grid-stack{display:flex!important;flex-direction:column!important'));
  check('next-session CTA exists', html.includes('id="next-session-card"') && script.includes('function renderNextSession'));
  check('hero CTA is in the dashboard grid', /gs-id="hero"[\s\S]*id="next-session-card"/.test(html));
  check('workspace view shell exists', html.includes('id="appMain"') && html.includes('id="workspaceView"') && html.includes('workspace-shell'));
  check('sidebar uses data-view navigation', html.includes('data-view="dashboard"') && html.includes('data-view="agenda"') && html.includes('data-view="tasks"') && html.includes('data-view="pomodoro"') && html.includes('data-view="subjects"') && html.includes('data-view="mood"') && !html.includes('data-side-target'));
  check('sidebar can collapse and open subjects manager', script.includes('function setSidebarCollapsed') && script.includes('sf_sidebar_collapsed') && html.includes('id="side-subjects-btn"') && script.includes('openSubjectsModal'));
  check('active view persists and renders dedicated screens', script.includes('sf_active_view') && script.includes('function setActiveView') && script.includes('function renderWorkspace') && script.includes('function bindWorkspaceActions'));
  check('theme toggle switches dark mode', html.includes('id="side-theme-toggle"') && html.includes('class="switch"') && html.includes('class="slider"') && html.includes('role="switch"') && html.includes('body.theme-dark') && script.includes('function setThemeMode') && script.includes('sf_theme'));
  check('subjects and mood open dedicated views', html.includes('data-view="subjects"') && html.includes('data-view="mood"') && html.includes('id="workspaceView"'));
  check('hero CTA leads to pomodoro view', script.includes("setActiveView('pomodoro')") && html.includes('id="btn-next-session-start"'));
  check('agenda workspace has interactive calendar controls', html.includes('data-action="agenda-month-prev"') && html.includes('data-action="agenda-month-next"') && html.includes('data-action="agenda-month-today"') && html.includes('data-action="agenda-day-add"') && html.includes('data-action="agenda-edit"'));
  check('schedule modal supports edit flow', script.includes('let _editingScheduleId = null') && script.includes('function updateScheduleEvent(') && script.includes('openScheduleModal({eventId: button.dataset.id})'));
  check('primary UI copy is readable Portuguese', !/M\u00c3|mat\u00c3|Sess\u00c3|anota\u00c3|Pr\u00c3|conclu\u00c3|Dura\u00c3|Descri\u00c3|Conte\u00c3/.test(html) && html.includes('Começar foco') && html.includes('Matérias'));
  const visibleHtml = html.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  check('visible UI has no mojibake', !/[\u00c2\u00c3\u00e2]|\?\?/.test(visibleHtml));
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

  const ids = [...html.matchAll(/(?:^|\s)id=["']([^"'$]+)["']/g)].map(match => match[1]).filter(id => !id.includes('${'));
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  check('static ids are unique', duplicateIds.length === 0, duplicateIds.join(', '));

  const ctx = { console, crypto };
  vm.createContext(ctx);
  const subset = script.slice(script.indexOf('const MONTH_ABBR'), script.indexOf('function getPMMGSubjects'));
  vm.runInContext(`${subset}\nthis.__test={fmtMin,fmtSec,timeToMin,minToTime,esc,dateKey,AppStats};`, ctx);
  const T = ctx.__test;
  const today = new Date();
  const todayKey = T.dateKey(today);
  const sessions = [
    { type: 'focus', startedAt: today.toISOString(), durationMinutes: 50, subjectId: 's1' },
    { type: 'break', startedAt: today.toISOString(), durationMinutes: 10, subjectId: 's1' },
  ];
  check('time helper formatting works', T.fmtMin(75) === '1h 15m' && T.fmtSec(65) === '01:05' && T.minToTime(T.timeToMin('08:30')) === '08:30');
  check('HTML escape helper works', T.esc('<x>&"') === '&lt;x&gt;&amp;&quot;');
  check('study stats aggregate focus and breaks', T.AppStats.focusOnDate(sessions, todayKey) === 50 && T.AppStats.breakOnDate(sessions, todayKey) === 10);

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

