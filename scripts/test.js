const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const marcellusFontPath = path.join(root, 'fonts', 'marcellus-latin-400-normal.woff2');
const authColonnadeTransparentPath = path.join(root, 'assets', 'auth-colonnade-ghost-transparent.png');
const schema = fs.existsSync(path.join(root, 'supabase', 'schema.sql'))
  ? fs.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8')
  : '';
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
  check('sidebar uses dynamic viewport height for tablet stability', html.includes('.app-sidebar{grid-column:1;grid-row:1 / span 2;position:sticky;top:14px;height:calc(100dvh - 28px);max-height:calc(100dvh - 28px);display:flex;flex-direction:column;overflow:auto;') && html.includes('.app-sidebar::-webkit-scrollbar{display:none;}') && html.includes('.side-upgrade{margin-top:16px;flex-shrink:0;'));
  check('brand logos render without orange backing blocks', html.includes('.auth-logo-mark{width:172px;height:132px;border-radius:0;display:grid;place-items:center;margin:0 auto 18px;background:transparent;box-shadow:none;}') && html.includes('.auth-logo-mark img{width:132px;height:132px;object-fit:contain;') && html.includes('.side-logo{width:92px;height:92px;border-radius:0;background:transparent;'));
  check('auth Marcellus font is bundled locally', fs.existsSync(marcellusFontPath) && html.includes("@font-face") && html.includes("font-family:'Marcellus Local'") && html.includes("src:url('./fonts/marcellus-latin-400-normal.woff2')"));
  check('auth classical background asset is bundled locally', fs.existsSync(authColonnadeTransparentPath) && html.includes("assets/auth-colonnade-ghost-transparent.png") && html.includes('.auth-window::before') && !html.includes("mix-blend-mode:multiply;filter:saturate(.88)"));
  check('auth classical background asset has alpha', fs.existsSync(authColonnadeTransparentPath) && (await sharp(authColonnadeTransparentPath).metadata()).hasAlpha);
  check('auth brand typography matches premium spaced wordmark', html.includes('.auth-brand-panel{position:relative;z-index:1;align-self:center;padding-left:62px;text-align:center;justify-self:center;}') && html.includes(".auth-brand-name{font-family:'Marcellus Local',Georgia,\"Times New Roman\",serif;font-size:2.28rem;font-weight:400;line-height:1;letter-spacing:.22em;color:#3c332e;text-indent:.22em;}") && html.includes('.auth-brand-subtitle{margin-top:11px;font-size:.86rem;color:#9e8d82;font-weight:700;text-transform:uppercase;letter-spacing:.28em;text-indent:.28em;}') && html.includes('.auth-brand-panel p::before'));
  check('sidebar toggle uses refined chevrons', html.includes('sidebar-toggle-mark') && html.includes('Recolher menu lateral') && script.includes("(collapsed ?'›' : '‹')") && !script.includes('panel-left-close') && !script.includes('panel-left-open'));
  check('professional topbar exists', html.includes('class="workspace-search"') && html.includes('Abrir agenda mensal') && html.includes('workspace-title') && html.includes('id="btn-topbar-logout"') && html.includes('Como você está hoje?'));
  check('topbar period pill opens agenda', html.includes('id="topbar-period-pill"') && script.includes("on('topbar-period-pill','click'") && script.includes("setActiveView('agenda')"));
  check('dashboard 2.0 topbar polish exists', html.includes('id="btn-notifications"') && html.includes('class="topbar-icon-btn"') && script.includes("on('btn-notifications','click',()=>OnboardingTour.open())"));
  check('professional light theme tokens exist', html.includes('--bg-base:#f5efe7') && html.includes('--surface:#fffdf9') && html.includes('--amber:#ff5a1f'));
  check('hero GridStack item exists', html.includes('gs-id="hero"') && html.includes('Próxima ação recomendada') && html.includes('id="next-session-chip"'));
  check('hero primary CTA keeps flat white style', html.includes('.next-session-actions #btn-next-session-start{background:#fffdf9;color:#241a14;border-color:rgba(255,255,255,.72);box-shadow:none;}') && html.includes('.next-session-actions #btn-next-session-start:hover{background:#fff4e8;color:#241a14;box-shadow:none;}'));
  check('hero text has overflow guards', html.includes('.next-session-title{font-size:clamp(1.95rem,3.05vw,3rem);line-height:1.02;max-width:min(610px,100%);display:-webkit-box') && html.includes('-webkit-line-clamp:3;overflow:hidden;overflow-wrap:anywhere') && html.includes('.next-session-detail{letter-spacing:-.01em;max-width:min(780px,100%);display:-webkit-box') && html.includes('.subjects-hero-title{margin:18px 0 0;font-family:Georgia') && html.includes('.workspace-title-xl{font-family:Georgia'));
  check('hero has integrated pomodoro panel', html.includes('id="hero-pomodoro"') && html.includes('id="hero-pomodoro-time"') && html.includes('id="hero-pomodoro-progress"') && html.includes('id="btn-hero-pomo-main"') && script.includes('function renderHeroPomodoro') && script.includes("on('btn-hero-pomo-main','click'"));
  check('integrated pomodoro start opens subject and topic picker in place', script.includes('_pomoStartStayOnCurrentView') && script.includes('stayOnCurrentView:true') && script.includes("if(!_pomoStartStayOnCurrentView) setActiveView('pomodoro')") && script.includes('openPomoModal({subjectId:target?.subject?.id || null, topicId:target?.topic?.id || null, forceExplicitTopicChoice:true, stayOnCurrentView:true})'));
  check('dashboard standalone pomodoro block is removed', !/<div class="grid-stack-item" id="pomodoro"\b/.test(html) && !script.includes("{id:'pomodoro'") && script.includes('function sanitizeDashboardLayout'));
  check('dashboard layout migration prevents hidden cards', html.includes('id="tasks" gs-id="tasks" gs-x="8" gs-y="6" gs-w="4" gs-h="13"') && script.includes("dashboard-layout-with-hero-pomodoro-v3") && script.includes("AppDB._set('sf_layout', DEFAULT_LAYOUT)") && script.includes('AppDB._set(\'sf_layout\', gsGrid.save(false))'));
  check('dashboard layout migration preserves cloud layout', script.includes('if(Array.isArray(saved) && saved.length) return sanitizeDashboardLayout(saved)'));
  check('dashboard applies cloud layout after async pull', script.includes('function applyDashboardLayoutFromStorage') && script.includes('gsGrid.load(layout, false)') && script.includes('applyDashboardLayoutFromStorage();'));
  check('removed pomodoro card does not break dashboard render', script.includes("document.getElementById('pomodoro')?.classList.toggle") && script.includes('function hasPomoRemaining()'));
  check('official subjects recover from empty storage', script.includes("DataStoreLocal.getRaw('sf_seeded_empty_v2', null) && AppDB.getSubjects().length") && script.includes('sf_reset_pmmg_done_v6'));
  check('clean seed maintenance hook exists', script.includes('function resetLocalDataForCleanSeedRequest') && script.includes("params.get('cleanseed') !== '1'") && script.includes("safeCall(()=>resetLocalDataForCleanSeedRequest()"));
  check('data links are reconciled across storage', script.includes('const STORAGE_VERSION = 8') && script.includes('function subjectHasTopic') && script.includes('function cleanLinkedTopic') && script.includes('AppDB.saveSessionNotes(AppDB.getSessionNotes()') && script.includes('AppDB.savePomoState({...pomoState, activeTopicId:null})'));
  check('session annotation card exists', html.includes('session-note-card') && html.includes('id="note-meta-row"') && html.includes('id="note-summary-input"') && html.includes('id="note-insights-grid"'));
  check('session annotation audio strip exists', html.includes('id="note-audio-toggle"') && html.includes('id="note-waveform"') && html.includes('id="note-audio-current"') && html.includes('id="note-tts-btn"'));
  check('session annotation modal is insight-only', !html.includes('id="note-form-summary"') && html.includes('id="note-form-insights"') && html.includes('id="note-form-new-insight"') && html.includes('Use esta janela apenas para destacar ideias-chave') && script.includes('renderNoteFormInsights') && script.includes('upsertSessionInsight'));
  check('session annotation dark input is legible', html.includes('body.theme-dark #note-form-new-insight{background:#1d1511;border-color:#3a2d25;color:#f3ebe5;}') && html.includes('body.theme-dark #note-form-new-insight::placeholder{color:#9f806c;}'));
  check('session annotation saved insight is dark-mode legible', html.includes('body.theme-dark .session-note-modal-item{background:#1d1511;border-color:#3a2d25;color:#f3ebe5;}') && html.includes('body.theme-dark .session-note-modal-item-icon{background:#261c17;border-color:#3a2d25;color:#ff9b64;}') && html.includes('body.theme-dark .session-note-modal-item-remove:hover{background:#2a1f1a;color:#ff9c78;}'));
  check('session annotation card is not hidden by auth-screen CSS in dark mode', !/body\.theme-dark #note \.grid-stack-item-content \.card,\s*\.auth-screen\{position:fixed/.test(html));
  check('session notes are stored per pomodoro session', script.includes('sf_session_notes') && script.includes('getCurrentSessionAnnotation') && script.includes('saveCurrentSessionAnnotation') && script.includes('activeSessionId') && script.includes('AppDB.saveSessionNote(next)'));
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
  check('subjects and mood open dedicated views', html.includes('data-view="subjects"') && html.includes('data-view="mood"') && html.includes('id="workspaceView"') && script.includes("on('topbar-date-pill','click',()=>openMoodModal())"));
  check('subject content architecture exists', script.includes('SUBJECT_TOPIC_SEED') && script.includes('TOPIC_STATUS_META') && script.includes('function buildSubjectDetailWorkspace') && script.includes('function calculateSubjectProgress'));
  check('subject migration syncs only official edital subjects', script.includes('function syncSubjectsToOfficialEdital') && script.includes('syncStorageToOfficialEdital();') && !script.includes("{id:'s2', name:'Matemática'") && !script.includes("{id:'s11', name:'Direito Penal'") && !script.includes("{id:'s12', name:'Legislação PM'"));
  check('subject overview cards open contents', html.includes('subject-overview-card') && script.includes('data-action="subject-open"') && script.includes('Ver conteúdos'));
  check('dashboard subject cards use progress icons', script.includes("data-lucide=\"${subj.lucide||'book'}\"") && script.includes('style="background:${subj.bg};color:var(${subj.colorVar})"') && !script.includes("icon: hasVisibleEmoji(safe.icon) ?safe.icon : '??'"));
  check('tasks and agenda can link to edital topics', html.includes('id="task-form-topic"') && html.includes('id="sched-form-topic"') && script.includes('topicId: safe.topicId ?sanitizeText(safe.topicId, null) : null') && script.includes('function fillLinkedTopicSelect') && script.includes('addTask(subjectId,title,topicId)'));
  check('task completion uses elegant animated check control', html.includes('task-complete-btn') && html.includes('task-row-exiting') && script.includes('function animateWorkspaceTaskToggle') && script.includes("case 'tasks-toggle':") && script.includes('animateWorkspaceTaskToggle(button)') && html.includes("data-lucide=\"check\"") && !script.includes("task.done ?'<i data-lucide=\"check-check\"></i>' : (subj.icon || 'Aa')"));
  check('subjects workspace uses split detail layout', html.includes('subjects-master-layout') && html.includes('subjects-side-column') && script.includes('buildSubjectsHeroCard'));
  check('topic detail controls exist', html.includes('topic-search-input') && html.includes('topic-filter-select') && html.includes('topic-row') && script.includes('data-action="topic-cycle-status"'));
  check('PMMG topic seed includes Portuguese edital items', script.includes('Adequação conceitual') && script.includes('Colocação pronominal') && script.includes('Noções de Direito e Direitos Humanos'));
  check('PMMG topic seed starts clean', script.includes("return sanitizeTopic({id:`${subjectId}-topic-${String(index+1).padStart(2,'0')}`, code, title, status:'not_started'});"));
  check('pomodoro handles completion and reset realistically', script.includes('if(this.leftSec<=0)') && script.includes("this.phase='focus'; this.sessionCount=0;") && script.includes('const elapsedMin = Math.max(0, Math.round((this.totalSec - this.leftSec) / 60));'));
  check('pomodoro completion does not create orphan running phase', script.includes("topic.status !== 'done'") && script.includes("topic.status = early ?'studying' : 'review'") && !/this\.resume\(\);\s*\n\s*},\s*\n\s*};/.test(script));
  check('pomodoro pause starts real 10 minute break', script.includes('breakDurationMinutes:10') && script.includes("_startPhase('break', 10)") && script.includes("toast('Descanso iniciado: 10 minutos para recuperar o foco.')") && script.includes("type:this.phase==='focus'?'focus':'break'") && script.includes("Pomo.phase==='focus' ?'Descansar 10min' : 'Pausar descanso'"));
  check('pomodoro runtime survives page reload', script.includes('leftSec:this.leftSec') && script.includes('totalSec:this.totalSec') && script.includes('isRunning:this.isRunning') && script.includes('lastTickAt:new Date().toISOString()') && script.includes('Date.now()-lastTick') && script.includes('this.timer=setInterval(()=>this._tick(),1000);'));
  check('next session updates after task and subject changes', script.includes('renderNextSession(); refreshWorkspaceView();') && script.includes('const lastSession = sessions[0] || null;'));
  check('hero recommendation engine is balanced', script.includes('function getRecommendedStudyAction') && script.includes("source:'agenda'") && script.includes("source:'review'") && script.includes("source:'task'") && script.includes("source:'progress'") && script.includes('confidenceLabel'));
  check('hero pomodoro target follows active session', script.includes('function getHeroPomodoroTarget') && script.includes('return getRecommendedStudyAction();') && script.includes("source:'pomodoro'"));
  const heroCtaHandler = (script.match(/on\('btn-next-session-start','click',\(\)=>\{([\s\S]*?)\n  \}\);/) || [])[1] || '';
  check('hero CTA controls pomodoro directly', heroCtaHandler.includes('if(Pomo.isRunning){') && heroCtaHandler.includes('Pomo.pause();') && heroCtaHandler.includes('Pomo.resume();') && heroCtaHandler.includes('Pomo.start(sid,Pomo.focusMin,topicId);') && !heroCtaHandler.includes('openPomoModal'));
  check('pomodoro render uses valid subject topic reference', !script.includes('subjá') && script.includes('const topic=subj?.topics?.find'));
  check('hero CTA leads to pomodoro view', script.includes("setActiveView('pomodoro')") && html.includes('id="btn-next-session-start"'));
  check('delicate motion avoids continuous timer pulsing', html.includes('Dashboard 2.0 polish') && !html.includes('#pomodoro.is-active .pomo-time{animation:countdownBreath'));
  check('agenda week strip polish exists', html.includes('.schedule-week-strip{grid-template-columns:repeat(7,minmax(42px,1fr));gap:8px') && script.includes('schedule-day-pill') && script.includes('Nenhuma aula cadastrada.'));
  check('agenda workspace has interactive calendar controls', html.includes('data-action="agenda-month-prev"') && html.includes('data-action="agenda-month-next"') && html.includes('data-action="agenda-month-today"') && html.includes('data-action="agenda-day-add"') && html.includes('data-action="agenda-edit"'));
  check('schedule modal supports edit flow', script.includes('let _editingScheduleId = null') && script.includes('function updateScheduleEvent(') && script.includes('openScheduleModal({eventId: button.dataset.id})'));
  check('schedule model separates single and weekly events', html.includes('id="sched-form-date"') && html.includes('id="sched-form-repeat"') && script.includes("recurrence === 'weekly'") && script.includes('function scheduleEventOccursOnDate') && script.includes('function getScheduleNextOccurrence') && script.includes('prefillDate: dateKey(new Date(parseInt(button.dataset.year,10), parseInt(button.dataset.month,10), parseInt(button.dataset.day,10)))'));
  const visibleHtml = html.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const uiCopySurface = `${visibleHtml}\n${jsTextLiterals(script)}`;
  check('primary UI copy is readable Portuguese', !hasMojibakeText(uiCopySurface) && html.includes('Começar foco') && html.includes('Matérias'));
  check('visible UI has no mojibake', !hasMojibakeText(visibleHtml));
  check('dynamic UI copy has no mojibake', !hasMojibakeText(jsTextLiterals(script)));
  const brokenBullet = String.fromCharCode(0x00e2, 0x20ac, 0x00a2);
  check('hero dynamic copy uses real recommendation reasons', script.includes('Revisão pendente para hoje.') && script.includes('Conteúdo com menor avanço no mês.') && script.includes('Continue de onde parou na última sessão registrada.') && !script.includes("'Base do ciclo • Revisão 1'") && !script.includes("'Retomar ritmo • Revisão 2'") && !script.includes(brokenBullet));
  check('tablet touch targets are at least 44px in key controls', html.includes('.nav-btn,.menu-btn{width:44px;height:44px;}') && html.includes('.workspace-chip{display:inline-flex;align-items:center;justify-content:center;min-height:44px;') && html.includes('.workspace-row-icon{width:44px;height:44px;'));
  check('runtime guardrails exist', script.includes('function safeCall') && script.includes('unhandledrejection') && script.includes('safeCall(()=>initEventBindings()'));
  check('storage versioning exists', script.includes('STORAGE_VERSION') && script.includes('sf_data_version') && script.includes('function migrateAppData'));
  check('local DataStore facade exists', script.includes('const DataStoreLocal') && script.includes('const DataStore =') && script.includes("mode: 'local'") && script.includes('exportSnapshot()') && script.includes('importSnapshot(parsed)'));
  check('AppDB delegates to local DataStore', script.includes('AppDB compatibility layer') && script.includes('return DataStoreLocal.subjects.getAll();') && script.includes('DataStoreLocal.tasks.saveAll(v);') && script.includes('DataStoreLocal.notes.saveOne(v);'));
  check('Supabase DataStore bridge is gated behind config and auth', script.includes('const SupabaseConfig') && script.includes('const DataStoreSupabase') && script.includes("reason:'supabase-auth-required'") && script.includes('DataStoreSupabase.isReady()') && script.includes('sf_supabase_config'));
  check('Supabase catalog maps official edital without user progress', script.includes('official_subjects?select=id,name,short_label') && script.includes("status:'not_started'") && script.includes('DataStoreLocal.subjects.saveAll(catalog.data)'));
  check('Supabase user modules persist cloud data', script.includes('DataStoreSupabase.tasks.replaceAll') && script.includes('DataStoreSupabase.schedule.replaceAll') && script.includes('DataStoreSupabase.progress.replaceFromSubjects') && script.includes('DataStoreSupabase.sessions.replaceAll') && script.includes('DataStoreSupabase.notes.replaceAll') && script.includes('DataStoreSupabase.moods.replaceAll') && script.includes('DataStoreSupabase.pomodoro.upsert'));
  check('Supabase pull hydrates local cache', script.includes('const [tasks,schedule,sessions,notes,moods,pomo] = await Promise.all') && script.includes('DataStoreLocal.tasks.saveAll(tasks.data)') && script.includes('DataStoreLocal.schedule.saveAll(schedule.data)') && script.includes('DataStoreLocal.setRaw(STORAGE_KEYS.moods, moods.data)'));
  check('cloud writes are guarded and user-owned', script.includes('getUserId()') && script.includes('user_id:userId') && script.includes('DataStore.cloudWrite') && script.includes('Não foi possível sincronizar') && script.includes('resetLocalStudyDataForAccount') && script.includes('DataStoreLocal.tasks.saveAll([])'));
  check('Supabase public project config is present', html.includes('window.STUDYFLOW_SUPABASE_CONFIG') && html.includes('https://katyzecqeodacutbmuvr.supabase.co') && html.includes('sb_publishable_pQHqENje7HP66qjJNIckCg_ue2T3o03'));
  check('auth screen gates the app before session', html.includes('<body class="auth-required">') && html.includes('id="auth-screen"') && html.includes('id="auth-form"') && html.includes('data-auth-mode="signup"'));
  check('first access onboarding tour exists', html.includes('id="onboarding-tour"') && html.includes('Primeiro acesso') && html.includes('Pular tour') && html.includes('Bem-vindo ao<span>COLISEU</span>') && script.includes('const OnboardingTour') && script.includes('OnboardingTour.maybeOpen') && script.includes('OnboardingTour.bind()') && script.includes("onboardingSeen: 'sf_onboarding_seen'"));
  check('notifications button can reopen onboarding during tests', script.includes("on('btn-notifications','click',()=>OnboardingTour.open())"));
  check('logout moved to topbar with confirmation', html.includes('id="btn-topbar-logout"') && html.includes('aria-label="Sair da conta"') && !html.includes('<span>Sair</span>') && script.includes('async function requestLogout()') && script.includes("kicker:'Encerrar sessão'") && script.includes("confirmLabel:'Sair da conta'") && script.includes("on('btn-topbar-logout','click',()=>requestLogout())") && !html.includes('id="side-logout"'));
  check('mood selector is integrated into topbar pill', html.includes('id="topbar-date-pill"') && html.includes('Como você está hoje?</span>') && !html.includes('data-lucide="sparkles"></i><span id="dateDisplay"') && !html.includes('id="btn-mood-current"') && html.includes('#topbar-date-pill{cursor:pointer;gap:0;padding:0 2px;min-height:auto;background:transparent!important;border-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important;') && html.includes('#topbar-date-pill.mood-selected #dateDisplay img{width:24px;height:24px;display:block;pointer-events:none;}') && script.includes("moodLabel.innerHTML = mood ?`<img src=\"${mood}\" alt=\"${moodText}\" draggable=\"false\">` : 'Como você está hoje?';"));
  check('professional signup fields exist', html.includes('id="auth-full-name"') && html.includes('id="auth-display-name"') && html.includes('id="auth-password-confirm"') && html.includes('id="auth-study-goal"') && html.includes('id="auth-terms"') && html.includes('Comece sua jornada'));
  check('Supabase auth flow stores session safely', script.includes('const AuthController') && script.includes("/auth/v1/${endpoint}") && script.includes("token?grant_type=password") && script.includes('DataStoreLocal.setRaw(STORAGE_KEYS.supabaseSession') && script.includes('AuthController.init()'));
  check('Supabase session reload restores cloud data', script.includes('this.isAuthenticated()') && script.includes('this.loadProfile()') && script.includes('.then(()=>DataStore.sync.pull())') && script.includes("Falha ao restaurar sessão Supabase"));
  check('Supabase REST calls refresh expired auth sessions', script.includes('sessionNeedsRefresh(session)') && script.includes('refreshSession()') && script.includes("token?grant_type=refresh_token") && script.includes('if(response.status === 401 && retry)'));
  check('invalid Supabase refresh tokens force a clean re-login', script.includes('isAuthExpiredResult(result)') && script.includes('handleExpiredSession()') && script.includes('DataStoreLocal.removeRaw(STORAGE_KEYS.supabaseSession)') && script.includes('Sua sessão expirou. Entre novamente'));
  check('Supabase profile flow stores display name and goal', script.includes('full_name') && script.includes('study_goal') && script.includes('DataStoreSupabase.profiles.upsert') && script.includes('DataStoreSupabase.profiles.getCurrent') && script.includes('DataStoreLocal.settings.saveProfile') && script.includes('password !== passwordConfirm') && script.includes('auth-terms'));
  check('profile greeting falls back to auth metadata', script.includes('function getSessionProfileFallback') && script.includes('mergeProfileForDisplay') && script.includes('meta.display_name') && script.includes('profile.displayName || profile.fullName || profile.email'));
  check('Supabase profile preferences preserve dashboard layout and exam date', script.includes('syncPreferences()') && script.includes('active_view') && script.includes('exam_date: DataStoreLocal.settings.getExamDate()') && script.includes('sidebar_collapsed') && script.includes('layout: DataStoreLocal.getRaw(STORAGE_KEYS.layout, null)') && script.includes("method:'PATCH'") && script.includes('DataStoreLocal.settings.saveExamDate(profile.data.examDate || null)') && script.includes('if(profile.layout) DataStoreLocal.setRaw(STORAGE_KEYS.layout, profile.layout)'));
  check('Supabase profile preference writes are debounced', script.includes('_preferenceTimer') && script.includes('clearTimeout(this._preferenceTimer)') && script.includes('pausePreferenceSync(fn)') && script.includes('DataStore.pausePreferenceSync(()=>'));
  check('Supabase writes use explicit conflict targets and uuid ids', script.includes('function uuidOrNew') && script.includes('profiles?on_conflict=id') && script.includes('tasks?on_conflict=id') && script.includes('user_topic_progress?on_conflict=user_id,topic_id') && script.includes('mood_entries?on_conflict=user_id,entry_date') && script.includes('pomodoro_states?on_conflict=user_id'));
  check('Supabase schema grants authenticated access before RLS policies', schema.includes('grant usage on schema public to authenticated;') && schema.includes('grant select, insert, update, delete') && schema.includes('public.tasks') && schema.includes('public.profiles') && schema.includes('to authenticated;'));
  check('temporary Supabase debug helper is removed', !script.includes('studyflowDebugSupabase') && !script.includes('Supabase debug'));
  check('task modal recovers official subjects before opening', script.includes('function ensureSubjectsAvailableForAction') && script.includes('DataStoreLocal.subjects.saveAll(fallback)') && script.includes('const subjects=ensureSubjectsAvailableForAction();') && script.includes('Carregando matérias do edital'));
  check('auth icons use aligned input action styling', html.includes('.auth-input-wrap{position:relative;') && html.includes('.auth-input-wrap>i,.auth-input-wrap>svg,.auth-input-action') && html.includes('right:10px;top:50%;transform:translateY(-50%)') && html.includes('right:8px;width:30px;height:30px') && html.includes('#subj-modal-footer{display:flex;flex-wrap:wrap'));
  check('hardcoded user name is removed', !html.includes('Olá, Claus') && !script.includes('Olá, Claus'));
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
    if (/onclick=/.test(attrs) || /data-view=/.test(attrs) || /data-onboarding-action=/.test(attrs) || /data-onboarding-step=/.test(attrs)) return false;
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
  vm.runInContext(`${subset}\nthis.__test={fmtMin,fmtSec,timeToMin,minToTime,esc,dateKey,parseLocalDate,scheduleEventOccursOnDate,getScheduleNextOccurrence,isScheduleEventActiveNow,AppStats,calculateSubjectProgress};`, ctx);
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
  const singleSchedule = { date:'2026-04-24', recurrence:'once', dayOfWeek:5, startTime:'10:00' };
  const weeklySchedule = { date:'2026-04-24', recurrence:'weekly', dayOfWeek:5, startTime:'10:00' };
  check('single schedule does not repeat across same weekdays', T.scheduleEventOccursOnDate(singleSchedule, T.parseLocalDate('2026-04-24')) && !T.scheduleEventOccursOnDate(singleSchedule, T.parseLocalDate('2026-05-01')) && T.scheduleEventOccursOnDate(weeklySchedule, T.parseLocalDate('2026-05-01')));
  const nextWeekly = T.getScheduleNextOccurrence(weeklySchedule, new Date('2026-04-25T08:00:00'));
  check('expired single schedule is not reused as next target', T.getScheduleNextOccurrence(singleSchedule, new Date('2026-04-25T08:00:00')) === null && T.dateKey(nextWeekly) === '2026-05-01' && nextWeekly.getHours() === 10);
  check('schedule in progress remains actionable', T.dateKey(T.getScheduleNextOccurrence({...singleSchedule,durationMinutes:90}, new Date('2026-04-24T10:30:00'))) === '2026-04-24' && T.isScheduleEventActiveNow({...weeklySchedule,durationMinutes:90}, new Date('2026-04-24T10:30:00')));
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

