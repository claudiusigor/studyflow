
if(!window.lucide || typeof window.lucide.createIcons !== 'function'){
  // Keep the app interactive even when icon CDN fails.
  window.lucide = { createIcons: () => {} };
} else {
  const _createIcons = window.lucide.createIcons.bind(window.lucide);
  window.lucide.createIcons = (opts) => {
    try { return _createIcons(opts); } catch (err) {
      console.warn('[StudyFlow] Falha ao renderizar ícones.', err);
    }
  };
}

/* CONSTANTS */

const MONTH_ABBR = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const MONTH_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAY_ABBR   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const DAY_FULL   = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];

const COLOR_THEMES = [
  {key:'indigo', colorVar:'--indigo-l', bg:'rgba(0,87,255,0.15)', grad:'linear-gradient(90deg,#0057FF,#3B82F6)', glow:'rgba(0,87,255,0.35)', swatch:'#0057FF', lucide:'hash'},
  {key:'sky',    colorVar:'--sky-l',    bg:'rgba(14,165,233,0.18)', grad:'linear-gradient(90deg,#0ea5e9,#38bdf8)', glow:'rgba(14,165,233,0.5)', swatch:'#0ea5e9', lucide:'zap'},
  {key:'emerald',colorVar:'--emerald-l',bg:'rgba(16,185,129,0.16)', grad:'linear-gradient(90deg,#10b981,#34d399)', glow:'rgba(16,185,129,0.5)', swatch:'#10b981', lucide:'leaf'},
  {key:'rose',   colorVar:'--rose-l',   bg:'rgba(244,63,94,0.16)',  grad:'linear-gradient(90deg,#f43f5e,#fb7185)', glow:'rgba(244,63,94,0.5)',  swatch:'#f43f5e', lucide:'book'},
  {key:'amber',  colorVar:'--amber-l',  bg:'rgba(245,158,11,0.18)', grad:'linear-gradient(90deg,#f59e0b,#fbbf24)', glow:'rgba(245,158,11,0.5)', swatch:'#f59e0b', lucide:'star'},
  {key:'violet', colorVar:'--violet-l', bg:'rgba(139,92,246,0.18)', grad:'linear-gradient(90deg,#8b5cf6,#a78bfa)', glow:'rgba(139,92,246,0.5)', swatch:'#8b5cf6', lucide:'globe'},
];

const DEFAULT_POMO = {phase:'focus',sessionCount:0,focusDurationMinutes:25,breakDurationMinutes:5,longBreakDurationMinutes:15,longBreakAfter:4,activeSubjectId:null};

/* HELPERS */

function uid(){ return typeof crypto!=='undefined'&&crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2); }
function dateKey(d){ const dt=typeof d==='string'?new Date(d):(d||new Date()); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; }
function todayKey(){ return dateKey(new Date()); }
function fmtMin(m){ const h=Math.floor(m/60),mn=m%60; if(!h)return `${mn}m`; if(!mn)return `${h}h`; return `${h}h ${mn}m`; }
function fmtSec(s){ return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function timeToMin(t){ const[h,m]=t.split(':').map(Number); return h*60+m; }
function minToTime(m){ return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function relDate(str){ if(!str)return ''; const d=new Date(str),t=new Date(),dk=dateKey(d),tk=dateKey(t); if(dk===tk)return `Hoje, ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`; const y=new Date(t); y.setDate(t.getDate()-1); if(dk===dateKey(y))return `Ontem, ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`; return `${d.getDate()} ${MONTH_ABBR[d.getMonth()].toLowerCase()}, ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`; }
const FOCUSABLE_SEL = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/* AppDB */

const AppDB = {
  _cache: {},
  _get(k,fb){ 
    if(this._cache[k] !== undefined && this._cache[k] !== null) return this._cache[k];
    try{ const r=localStorage.getItem(k); let val = r?JSON.parse(r):fb; if(val===null)val=fb; this._cache[k]=val; return val; }
    catch(e){ return fb; } 
  },
  _set(k,v){ this._cache[k]=v; try{ localStorage.setItem(k,JSON.stringify(v)); } catch(e){ console.warn('[StudyFlow] localStorage falhou:',k,e.name); } },
  getSubjects() { return this._get('sf_subjects',[]); },
  getSessions() { return this._get('sf_sessions',[]); },
  getSchedule() { return this._get('sf_schedule',[]); },
  getTasks()    { return this._get('sf_tasks',[]); },
  getNote()     { return this._get('sf_note',{body:'',updatedAt:null,checklist:[]}); },
  getMoods()    { return this._get('sf_moods',{}); },
  getPomoState(){ return this._get('sf_pomo_state',{...DEFAULT_POMO}) || {...DEFAULT_POMO}; },
  getExamDate(){ return this._get('sf_exam_date',null); },
  saveSubjects(v){ this._set('sf_subjects',v); },
  saveSessions(v){ this._set('sf_sessions',v); },
  saveSchedule(v){ this._set('sf_schedule',v); },
  saveTasks(v)   { this._set('sf_tasks',v); },
  saveNote(v)    { this._set('sf_note',v); },
  saveMood(k,v)  { const m=this.getMoods(); if(!v)delete m[k]; else m[k]=v; this._set('sf_moods',m); },
  savePomoState(v){ this._set('sf_pomo_state',v); },
  saveExamDate(v){ this._set('sf_exam_date',v); },
};

/* AppStats */

const AppStats = {
  weekBounds(offset=0){
    const now=new Date(); const dow=now.getDay(); const dFm=dow===0?6:dow-1;
    const mon=new Date(now); mon.setDate(now.getDate()-dFm+offset*7); mon.setHours(0,0,0,0);
    const sun=new Date(mon); sun.setDate(mon.getDate()+6); sun.setHours(23,59,59,999);
    return {start:mon,end:sun};
  },
  sessionsOnDate(sessions,dk){ return sessions.filter(s=>dateKey(s.startedAt)===dk); },
  focusOnDate(sessions,dk){ return this.sessionsOnDate(sessions,dk).filter(s=>s.type==='focus').reduce((a,s)=>a+s.durationMinutes,0); },
  breakOnDate(sessions,dk){ return this.sessionsOnDate(sessions,dk).filter(s=>s.type==='break').reduce((a,s)=>a+s.durationMinutes,0); },
  weekDays(sessions,tasks,offset=0){
    const {start}=this.weekBounds(offset);
    return Array.from({length:5},(_,i)=>{
      const d=new Date(start); d.setDate(start.getDate()+i); const dk=dateKey(d);
      return { dk, date:d, focusMin:this.focusOnDate(sessions,dk), completedTasks:tasks.filter(t=>t.done&&t.completedAt&&dateKey(t.completedAt)===dk).length };
    });
  },
  weeklyFocusMin(sessions,offset=0){
    const {start,end}=this.weekBounds(offset);
    return sessions.filter(s=>s.type==='focus'&&new Date(s.startedAt)>=start&&new Date(s.startedAt)<=end).reduce((a,s)=>a+s.durationMinutes,0);
  },
  weeklyBreakMin(sessions,offset=0){
    const {start,end}=this.weekBounds(offset);
    return sessions.filter(s=>s.type==='break'&&new Date(s.startedAt)>=start&&new Date(s.startedAt)<=end).reduce((a,s)=>a+s.durationMinutes,0);
  },
  weeklyLineData(sessions,offset=0){
    const {start}=this.weekBounds(offset);
    const focus=[],brk=[];
    for(let i=0;i<5;i++){
      const d=new Date(start); d.setDate(start.getDate()+i); const dk=dateKey(d);
      focus.push(this.focusOnDate(sessions,dk)/60);
      brk.push(this.breakOnDate(sessions,dk)/60);
    }
    return {focus,break:brk};
  },
  monthlyMinBySubject(sessions){
    const now=new Date(); const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const map={};
    sessions.filter(s=>{if(s.type!=='focus')return false;const dt=new Date(s.startedAt);return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`===ym;}).forEach(s=>{ map[s.subjectId]=(map[s.subjectId]||0)+s.durationMinutes; });
    return map;
  },
  monthlyProgressPct(sessions,subjects){
    const target=subjects.reduce((a,s)=>a+(s.monthlyTargetHours||0),0)*60;
    if(!target)return 0;
    const actual=Object.values(this.monthlyMinBySubject(sessions)).reduce((a,m)=>a+m,0);
    return Math.min(100, (actual/target)*100);
  },
  streak(sessions){
    const today=new Date(); let s=0;
    for(let i=0;i<365;i++){
      const d=new Date(today); d.setDate(today.getDate()-i);
      if(sessions.some(se=>se.type==='focus'&&dateKey(se.startedAt)===dateKey(d))) s++;
      else break;
    }
    return s;
  },
};

/* SEED */

function getPMMGSubjects(){
  return [
    {id:'s1', name:'Língua Portuguesa', icon:'ðŸ“', colorVar:'--rose-l',    bg:'rgba(244,63,94,0.16)',   grad:'linear-gradient(90deg,#f43f5e,#fb7185)', glow:'rgba(244,63,94,0.5)',   lucide:'book',  monthlyTargetHours:20},
    {id:'s2', name:'Matemática',        icon:'ðŸ“', colorVar:'--indigo-l',  bg:'rgba(0,87,255,0.15)',  grad:'linear-gradient(90deg,#0057FF,#3B82F6)', glow:'rgba(0,87,255,0.35)', lucide:'hash',  monthlyTargetHours:20},
    {id:'s3', name:'Raciocínio Lógico', icon:'ðŸ§®', colorVar:'--violet-l',  bg:'rgba(139,92,246,0.18)',  grad:'linear-gradient(90deg,#8b5cf6,#a78bfa)', glow:'rgba(139,92,246,0.5)', lucide:'globe', monthlyTargetHours:15},
    {id:'s4', name:'Física',            icon:'âš›ï¸', colorVar:'--sky-l',     bg:'rgba(14,165,233,0.18)',  grad:'linear-gradient(90deg,#0ea5e9,#38bdf8)', glow:'rgba(14,165,233,0.5)', lucide:'zap',   monthlyTargetHours:12},
    {id:'s5', name:'Química',           icon:'ðŸ§ª', colorVar:'--emerald-l', bg:'rgba(16,185,129,0.16)',  grad:'linear-gradient(90deg,#10b981,#34d399)', glow:'rgba(16,185,129,0.5)', lucide:'leaf',  monthlyTargetHours:10},
    {id:'s6', name:'Biologia',          icon:'ðŸŒŽ', colorVar:'--emerald-l', bg:'rgba(16,185,129,0.16)',  grad:'linear-gradient(90deg,#10b981,#34d399)', glow:'rgba(16,185,129,0.5)', lucide:'leaf',  monthlyTargetHours:10},
    {id:'s7', name:'História',          icon:'ðŸ“œ', colorVar:'--amber-l',   bg:'rgba(245,158,11,0.18)',  grad:'linear-gradient(90deg,#f59e0b,#fbbf24)', glow:'rgba(245,158,11,0.5)', lucide:'star',  monthlyTargetHours:10},
    {id:'s8', name:'Geografia',         icon:'ðŸ—ºï¸', colorVar:'--sky-l',     bg:'rgba(14,165,233,0.18)',  grad:'linear-gradient(90deg,#0ea5e9,#38bdf8)', glow:'rgba(14,165,233,0.5)', lucide:'zap',   monthlyTargetHours:8},
    {id:'s9', name:'Inglês',            icon:'ðŸ—£ï¸', colorVar:'--rose-l',    bg:'rgba(244,63,94,0.16)',   grad:'linear-gradient(90deg,#f43f5e,#fb7185)', glow:'rgba(244,63,94,0.5)',   lucide:'book',  monthlyTargetHours:8},
    {id:'s10',name:'Dir. Constitucional',icon:'âš–ï¸',colorVar:'--indigo-l',  bg:'rgba(0,87,255,0.15)',  grad:'linear-gradient(90deg,#0057FF,#3B82F6)', glow:'rgba(0,87,255,0.35)', lucide:'hash',  monthlyTargetHours:15},
    {id:'s11',name:'Direito Penal',     icon:'ðŸ“˜', colorVar:'--violet-l',  bg:'rgba(139,92,246,0.18)',  grad:'linear-gradient(90deg,#8b5cf6,#a78bfa)', glow:'rgba(139,92,246,0.5)', lucide:'globe', monthlyTargetHours:15},
    {id:'s12',name:'Legislação PM',     icon:'ðŸ‘®', colorVar:'--amber-l',   bg:'rgba(245,158,11,0.18)',  grad:'linear-gradient(90deg,#f59e0b,#fbbf24)', glow:'rgba(245,158,11,0.5)', lucide:'star',  monthlyTargetHours:15},
  ];
}

function seedIfEmpty(){
  if(localStorage.getItem('sf_seeded_empty_v2')) return;
  const subjects=getPMMGSubjects();
  AppDB.saveSubjects(subjects);
  AppDB.saveSchedule([]);
  AppDB.saveTasks([]);
  AppDB.saveSessions([]);
  AppDB.saveNote({body:'',updatedAt:null,checklist:[]});
  // Limpando antigas flags de seed (mocked data migration)
  localStorage.removeItem('sf_seeded_pmmg_v1');
  localStorage.removeItem('sf_seeded');
  localStorage.setItem('sf_seeded_empty_v2','1');
}

/* MODAL */

const Modal = {
  _lastFocus:null,
  open(id){
    const modal=document.getElementById(id);
    if(!modal)return;
    this._lastFocus=document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    document.getElementById('modal-overlay').classList.add('active');
    document.body.classList.add('modal-open');
    const first=modal.querySelector(FOCUSABLE_SEL) || modal.querySelector('.modal-card');
    setTimeout(()=>first.focus(),0);
  },
  close(id){
    const modal=document.getElementById(id);
    if(!modal)return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    const anyOpen=[...document.querySelectorAll('.modal.open')].length>0;
    if(!anyOpen){
      document.getElementById('modal-overlay').classList.remove('active');
      document.body.classList.remove('modal-open');
      if(this._lastFocus && document.contains(this._lastFocus)) this._lastFocus.focus();
      this._lastFocus=null;
    }
  },
  closeAll(){
    document.querySelectorAll('.modal.open').forEach(m=>{m.classList.remove('open');m.setAttribute('aria-hidden','true');});
    document.getElementById('modal-overlay').classList.remove('active');
    document.body.classList.remove('modal-open');
    if(this._lastFocus && document.contains(this._lastFocus)) this._lastFocus.focus();
    this._lastFocus=null;
  },
  trap(e){
    if(e.key!=='Tab')return;
    const modal=document.querySelector('.modal.open');
    if(!modal)return;
    const nodes=[...modal.querySelectorAll(FOCUSABLE_SEL)].filter(el=>el.offsetParent!==null || el===document.activeElement);
    if(!nodes.length)return;
    const first=nodes[0], last=nodes[nodes.length-1];
    if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
  },
};

/* POMODORO */

const Pomo = {
  timer:null, leftSec:0, totalSec:0, isRunning:false, startedAt:null,
  phase:'focus', sessionCount:0, activeSubjectId:null,
  focusMin:25, breakMin:5, longBreakMin:15, longBreakAfter:4,

  init(){
    const s=AppDB.getPomoState();
    this.phase=s.phase||'focus'; this.sessionCount=s.sessionCount||0;
    this.activeSubjectId=s.activeSubjectId || (AppDB.getSubjects()[0].id || null);
    this.focusMin=s.focusDurationMinutes||25; this.breakMin=s.breakDurationMinutes||5;
    this.longBreakMin=s.longBreakDurationMinutes||15; this.longBreakAfter=s.longBreakAfter||4;
    this.totalSec=this._phaseDur()*60; this.leftSec=this.totalSec;
    this.isRunning=false; this.startedAt=null;
  },
  _phaseDur(){ if(this.phase==='focus')return this.focusMin; if(this.phase==='longBreak')return this.longBreakMin; return this.breakMin; },
  _persist(){
    AppDB.savePomoState({phase:this.phase,sessionCount:this.sessionCount,focusDurationMinutes:this.focusMin,breakDurationMinutes:this.breakMin,longBreakDurationMinutes:this.longBreakMin,longBreakAfter:this.longBreakAfter,activeSubjectId:this.activeSubjectId});
  },
  start(subjId,durMin){
    if(subjId) this.activeSubjectId=subjId;
    if(durMin){ this.focusMin=durMin; this.totalSec=durMin*60; this.leftSec=this.totalSec; }
    this.startedAt=new Date().toISOString();
    this.isRunning=true; this._persist();
    this.timer=setInterval(()=>this._tick(),1000);
    renderPomo();
  },
  pause(){ clearInterval(this.timer); this.isRunning=false; this._persist(); renderPomo(); },
  resume(){
    if(this.isRunning)return;
    this.isRunning=true;
    this.timer=setInterval(()=>this._tick(),1000);
    renderPomo();
  },
  reset(){
    clearInterval(this.timer); this.isRunning=false; this.startedAt=null;
    this.leftSec=this._phaseDur()*60; this.totalSec=this.leftSec;
    this._persist(); renderPomo();
  },
  _tick(){
    this.leftSec--;
    renderPomo();
  },
  _complete(early = false){
    clearInterval(this.timer); this.isRunning=false;
    if(this.startedAt){
      const sessions=AppDB.getSessions();
      const elapsedMin = Math.round((new Date() - new Date(this.startedAt)) / 60000);
      const dur = elapsedMin > 0 ? elapsedMin : 1;
      sessions.push({id:uid(),subjectId:this.activeSubjectId,startedAt:this.startedAt,endedAt:new Date().toISOString(),durationMinutes:dur,type:this.phase==='focus'?'focus':'break'});
      AppDB.saveSessions(sessions);
    }
    if(this.phase==='focus'){ this.sessionCount++; this.phase=this.sessionCount%this.longBreakAfter===0?'longBreak':'break'; }
    else { this.phase='focus'; }
    this.totalSec=this._phaseDur()*60; this.leftSec=this.totalSec; this.startedAt=null;
    this._persist();
    renderPomo(); renderTodayHours(); renderStreak(); renderWeeklyAnalysis(); renderSubjectGrid(); renderGoals(); renderTasks();
    this.resume();
  },
};

/* RENDER FUNCTIONS */

let scheduleWeekOffset=0;

function renderSchedule(){
  const events=AppDB.getSchedule(); const subjects=AppDB.getSubjects();
  const {start}=AppStats.weekBounds(scheduleWeekOffset); const tk=todayKey();
  const items=events.map(ev=>{
    const wi=ev.dayOfWeek===0?6:ev.dayOfWeek-1;
    const d=new Date(start); d.setDate(start.getDate()+wi);
    const subj=subjects.find(s=>s.id===ev.subjectId);
    return{...ev,date:d,subj};
  }).sort((a,b)=>(a.date-b.date)||timeToMin(a.startTime)-timeToMin(b.startTime));
  const sl=document.getElementById('scheduleList');
  if(!items.length){sl.innerHTML='<div class="empty-state">Nenhuma aula cadastrada.<br>Clique em + para adicionar.</div>'; return;}
  sl.innerHTML=items.map(ev=>{
    if(!ev.subj)return '';
    const isToday=dateKey(ev.date)===tk;
    return `<div class="sched-item">
      <div class="sched-dot" style="background:var(${ev.subj.colorVar});box-shadow:0 0 6px var(${ev.subj.colorVar})"></div>
      <div class="sched-date"><div class="mo">${MONTH_ABBR[ev.date.getMonth()]}</div><div class="dy">${ev.date.getDate()}</div></div>
      <div class="sched-info">
        <div class="sched-subject">${ev.subj.icon} ${esc(ev.subj.name)}${ev.label ? `  -  ${esc(ev.label)}` : ''}${isToday ? '<span class="today-chip">Hoje</span>' : ''}</div>
        <div class="sched-time"><i data-lucide="clock" style="width:11px;height:11px"></i>${ev.startTime}  -  ${minToTime(timeToMin(ev.startTime)+ev.durationMinutes)}  -  ${ev.durationMinutes}min</div>
      </div>
      <button class="sched-delete nav-btn" data-id="${ev.id}" title="Remover"><i data-lucide="x"></i></button>
    </div>`;
  }).join('');
  lucide.createIcons({nodes:sl.querySelectorAll('[data-lucide]')});
}

function renderTodayHours(){
  const sessions=AppDB.getSessions(); const tk=todayKey();
  const focMin=AppStats.focusOnDate(sessions,tk);
  const brkMin=AppStats.breakOnDate(sessions,tk);
  const total=focMin+brkMin;
  const yd=new Date(); yd.setDate(yd.getDate()-1);
  const ydFoc=AppStats.focusOnDate(sessions,dateKey(yd));
  const delta=ydFoc>0 ? Math.round(((focMin-ydFoc)/ydFoc)*100) : 0;
  document.getElementById('today-total').textContent=fmtMin(total)||'0m';
  document.getElementById('today-focus-val').textContent=fmtMin(focMin)||'0m';
  document.getElementById('today-break-val').textContent=fmtMin(brkMin)||'0m';
  const df=document.getElementById('today-delta');
  const dv=document.getElementById('today-delta-val');
  dv.textContent=(delta>=0?'+':'')+delta+'%';
  df.className='stat-delta '+(delta>=0?'delta-up':'delta-down');
  df.querySelector('svg').setAttribute('data-lucide',delta>=0?'trending-up':'trending-down');
  lucide.createIcons({nodes:[df]});
  const sf=document.getElementById('today-seg-focus');
  const sr=document.getElementById('today-seg-rest');
  if(focMin+brkMin>0){ sf.style.flex=focMin; sr.style.flex=Math.max(brkMin,0.1); }
  else { sf.style.flex=1; sr.style.flex=0.01; }
}

function renderStreak(){
  const s=AppStats.streak(AppDB.getSessions());
  document.getElementById('streak-count').textContent=`${s} dia${s!==1?'s':''} seguido${s!==1?'s':''}`;
}

function renderCountdown(){
  const examDate=AppDB.getExamDate();
  const lbl=document.getElementById('exam-days-label');
  if(!examDate){lbl.textContent='Definir data';return;}
  const now=new Date(); now.setHours(0,0,0,0);
  const exam=new Date(examDate+'T00:00:00');
  const diff=Math.ceil((exam-now)/(1000*60*60*24));
  if(diff<0)lbl.textContent='Concurso realizado!';
  else if(diff===0)lbl.textContent='Concurso HOJE!';
  else lbl.textContent=`${diff} dia${diff!==1?'s':''} p/ concurso`;
}

function getNextStudyTarget(){
  const subjects=AppDB.getSubjects();
  if(!subjects.length)return null;
  const schedule=AppDB.getSchedule();
  const now=new Date();
  const currentMin=now.getHours()*60+now.getMinutes();
  const todayDow=now.getDay();
  const scheduled=schedule.map(ev=>{
    const offset=(ev.dayOfWeek-todayDow+7)%7;
    const when=new Date(now);
    const start=timeToMin(ev.startTime);
    when.setDate(now.getDate()+offset);
    when.setHours(Math.floor(start/60), start%60,0,0);
    if(offset===0 && start<currentMin) when.setDate(when.getDate()+7);
    return {...ev,when,subj:subjects.find(s=>s.id===ev.subjectId)};
  }).filter(ev=>ev.subj).sort((a,b)=>a.when-b.when)[0];
  if(scheduled)return {type:'scheduled',subject:scheduled.subj,event:scheduled};
  const sessions=AppDB.getSessions().filter(x=>x.type==='focus'&&x.subjectId).sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt));
  const last=subjects.find(subj=>subj.id===sessions[0].subjectId);
  if(last)return {type:'resume',subject:last};
  return {type:'first',subject:subjects[0]};
}

function renderNextSession(){
  const target=getNextStudyTarget();
  const title=document.getElementById('next-session-title');
  const meta=document.getElementById('next-session-meta');
  const btn=document.getElementById('btn-next-session-start');
  if(!title||!meta||!btn)return;
  if(!target){
    title.textContent='Cadastre uma matéria para liberar seu próximo bloco.';
    meta.innerHTML='<i data-lucide="book-plus"></i><span>Comece criando seu mapa de estudos.</span>';
    btn.disabled=true;
  } else {
    btn.disabled=false;
    btn.dataset.subjectId=target.subject.id;
    if(target.type==='scheduled'){
      title.textContent=target.subject.icon+' '+target.subject.name;
      meta.innerHTML='<i data-lucide="calendar-clock"></i><span>'+target.event.when.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})+' às '+target.event.startTime+' - '+target.event.durationMinutes+'min</span>';
    } else if(target.type==='resume'){
      title.textContent='Retomar '+target.subject.icon+' '+target.subject.name;
      meta.innerHTML='<i data-lucide="rotate-ccw"></i><span>Ãšltima matéria estudada. Bom para manter o ritmo.</span>';
    } else {
      title.textContent='Começar por '+target.subject.icon+' '+target.subject.name;
      meta.innerHTML='<i data-lucide="sparkles"></i><span>Primeiro bloco: pequeno, claro e sem drama.</span>';
    }
  }
  lucide.createIcons({nodes:[document.getElementById('next-session-card')]});
}

function renderNote(){
  const note=AppDB.getNote();
  const bd=document.getElementById('note-body-display');
  bd.textContent=note.body||'Use o botão de edição para adicionar uma anotação.';
  document.getElementById('note-ts').textContent=note.updatedAt?relDate(note.updatedAt):'';
  
  let wordCount = (note.body||'').split(/\s+/).filter(w=>w.length>0).length;
  if(note.checklist) wordCount += note.checklist.reduce((acc,c)=>acc+c.label.split(/\s+/).length,0);
  const totalSecs = Math.ceil((wordCount / 150) * 60);
  const metaEl = document.getElementById('audio-meta-time');
  if(metaEl) metaEl.textContent = `${Math.floor(totalSecs/60)}:${String(totalSecs%60).padStart(2,'0')}`;
  const cl=document.getElementById('checklist');
  cl.innerHTML=(note.checklist||[]).map(it=>`
    <div class="check-row${it.done?' done':''}" data-id="${it.id}">
      <div class="check-box"><i data-lucide="check"></i></div>
      <span class="check-label">${esc(it.label)}</span>
    </div>`).join('');
  lucide.createIcons({nodes:cl.querySelectorAll('[data-lucide]')});
  cl.querySelectorAll('.check-row').forEach(row=>row.addEventListener('click',()=>toggleChecklistItem(row.dataset.id)));
}

function renderPomo(){
  const C=2*Math.PI*42;
  const isOvertime = Pomo.leftSec <= 0;
  const absSec = Math.abs(Pomo.leftSec);
  const progress=isOvertime ? 0 : Pomo.leftSec/Math.max(Pomo.totalSec,1);
  
  const displayEl = document.getElementById('pomoDisplay');
  displayEl.textContent = (isOvertime ? '+' : '') + fmtSec(absSec);
  displayEl.style.color = isOvertime ? 'var(--rose-l)' : '';
  
  const circleEl = document.getElementById('pomoCircle');
  circleEl.style.strokeDashoffset=C*progress;
  if(isOvertime) {
    circleEl.style.filter=`drop-shadow(0 0 14px rgba(244,63,94,0.6))`;
    circleEl.setAttribute('stroke', 'var(--rose-l)');
  } else {
    circleEl.style.filter=`drop-shadow(0 0 ${4+(1-progress)*10}px rgba(34,211,238,0.5))`;
    circleEl.setAttribute('stroke', 'url(#pg)');
  }
  
  const phases={focus:'Sessão de Foco',break:'Pausa Curta',longBreak:'Pausa Longa'};
  document.getElementById('pomoPhase').textContent=phases[Pomo.phase]||'Foco';
  
  const chip=document.getElementById('pomo-subject-chip');
  if(Pomo.activeSubjectId&&Pomo.isRunning){
    const subj=AppDB.getSubjects().find(s=>s.id===Pomo.activeSubjectId);
    if(subj){chip.innerHTML=`${subj.icon} ${esc(subj.name)}`;chip.classList.add('visible');}
  } else { chip.classList.remove('visible'); }
  const btnTxt=document.getElementById('pomoBtnTxt');
  const btnIco=document.getElementById('pomoIcon');
  const btnFin=document.getElementById('btn-pomo-finish');
  if(btnFin){
    if(Pomo.isRunning){
      btnTxt.textContent='Pausar';btnIco.setAttribute('data-lucide','pause');
      btnFin.style.display='flex';
    }
    else if(Pomo.leftSec<Pomo.totalSec){
      btnTxt.textContent='Continuar';btnIco.setAttribute('data-lucide','play');
      btnFin.style.display='flex';
    }
    else{
      btnTxt.textContent='Iniciar';btnIco.setAttribute('data-lucide','play');
      btnFin.style.display='none';
    }
  }
  lucide.createIcons({nodes:[btnIco]});
}

function drawLineChart(focusArr,breakArr){
  const canvas=document.getElementById('lineChart');
  if(!canvas)return;
  const dpr=window.devicePixelRatio||1;
  const rect=canvas.getBoundingClientRect();
  if(!rect.width)return;
  canvas.width=rect.width*dpr; canvas.height=80*dpr;
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const W=rect.width,H=80;
  const allVals=[...focusArr,...breakArr].filter(v=>v>0);
  const maxVal=allVals.length?Math.max(...allVals)*1.2:4;
  function drawLine(data,stroke,glowColor,fill1){
    const xs=W/(data.length-1);
    ctx.beginPath();
    data.forEach((v,i)=>{
      const x=i*xs,y=H-(v/maxVal)*H;
      if(i===0)ctx.moveTo(x,y);
      else ctx.bezierCurveTo((i-.5)*xs,H-(data[i-1]/maxVal)*H,(i-.5)*xs,y,x,y);
    });
    ctx.shadowColor=glowColor;ctx.shadowBlur=8;
    ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke();
    ctx.shadowBlur=0;
    ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,fill1);g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.fill();ctx.beginPath();
  }
  [0.25,0.5,0.75].forEach(p=>{ctx.beginPath();ctx.strokeStyle='rgba(255,255,255,0.04)';ctx.lineWidth=1;ctx.moveTo(0,H*p);ctx.lineTo(W,H*p);ctx.stroke();});
  drawLine(breakArr,'#fbbf24','#fbbf24','rgba(251,191,36,0.15)');
  drawLine(focusArr,'#3B82F6','#3B82F6','rgba(59,130,246,0.2)');
}

function renderWeeklyAnalysis(){
  const sessions=AppDB.getSessions();
  const focMin=AppStats.weeklyFocusMin(sessions);
  const prevFocMin=AppStats.weeklyFocusMin(sessions,-1);
  const delta=prevFocMin>0 ? Math.round(((focMin-prevFocMin)/prevFocMin)*100) : 0;
  document.getElementById('analysis-total').textContent=fmtMin(focMin)||'0m';
  const dv=document.getElementById('analysis-delta-val');
  dv.textContent=(delta>=0?'+':'')+delta+'%';
  const dd=document.getElementById('analysis-delta');
  dd.className='stat-delta '+(delta>=0?'delta-up':'delta-down');
  const now=new Date();
  document.getElementById('analysis-sub').textContent=`vs semana anterior  -  ${fmtMin(prevFocMin)||'0m'}`;
  const ld=AppStats.weeklyLineData(sessions);
  const {start}=AppStats.weekBounds(0);
  const todayDow=new Date().getDay(); const todayIdx=todayDow===0?6:todayDow-1;
  const axEl=document.getElementById('analysis-days-x');
  axEl.innerHTML=Array.from({length:5},(_,i)=>`<span${i===Math.min(todayIdx,4)?' class="now"':''}>${DAY_ABBR[(i+1)%7]}</span>`).join('');
  setTimeout(()=>drawLineChart(ld.focus,ld.break),50);
}

function renderTasks(){
  const sessions=AppDB.getSessions(); const tasks=AppDB.getTasks();
  const weekData=AppStats.weekDays(sessions,tasks);
  const total=weekData.reduce((a,d)=>a+d.completedTasks,0);
  const prevWeekData=AppStats.weekDays(sessions,tasks,-1);
  const prevTotal=prevWeekData.reduce((a,d)=>a+d.completedTasks,0);
  const delta=total-prevTotal;
  document.getElementById('tasks-count').textContent=total;
  document.getElementById('tasks-delta-val').textContent=(delta>=0?'+':'')+delta;
  document.getElementById('tasks-delta').className='stat-delta '+(delta>=0?'delta-up':'delta-down');
  // Bar chart
  const bc=document.getElementById('barChart');
  const maxTasks=Math.max(...weekData.map(d=>d.completedTasks),1);
  const todayDow=new Date().getDay(); const todayIdx=todayDow===0?6:todayDow-1;
  bc.innerHTML=weekData.map((d,i)=>{
    const h=Math.round((d.completedTasks/maxTasks)*68);
    const ph=Math.max(0,Math.round(((maxTasks-d.completedTasks)/maxTasks)*28));
    return `<div class="bc-col"><div class="bc-seg bc-pend" style="height:${ph}px"></div><div class="bc-seg bc-done" style="height:${h}px"></div></div>`;
  }).join('');
  const ax=document.getElementById('tasks-days-x');
  ax.innerHTML=weekData.map((d,i)=>`<span${i===Math.min(todayIdx,4)?' class="now"':''}>${DAY_ABBR[(i+1)%7]}</span>`).join('');
  // Day breakdown
  const db=document.getElementById('dayBreakdown');
  const sorted=[...weekData].filter(d=>d.completedTasks>0).sort((a,b)=>b.completedTasks-a.completedTasks).slice(0,3);
  if(!sorted.length){db.innerHTML='<div class="empty-state">Nenhuma tarefa concluída esta semana.</div>';return;}
  db.innerHTML=sorted.map(d=>{
    const pct=Math.round((d.completedTasks/maxTasks)*100);
    return `<div class="db-row"><div class="db-row-meta"><span>${DAY_FULL[(d.date.getDay())]}</span><span style="color:var(--indigo-l);font-weight:700">${d.completedTasks} tarefa${d.completedTasks!==1?'s':''}</span></div><div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:var(--indigo);box-shadow:0 0 6px var(--indigo)"></div></div></div>`;
  }).join('');
}

function renderSubjectGrid(){
  const subjects=AppDB.getSubjects(); const tasks=AppDB.getTasks(); const sessions=AppDB.getSessions();
  const minMap=AppStats.monthlyMinBySubject(sessions);
  const sg=document.getElementById('subjectGrid');
  if(!subjects.length){sg.innerHTML='<div class="empty-state" style="grid-column:span 2">Nenhuma matéria cadastrada.<br>Clique em Configurações para adicionar.</div>';return;}
  sg.innerHTML=subjects.map(subj=>{
    const actualMin=minMap[subj.id]||0;
    const targetMin=(subj.monthlyTargetHours||10)*60;
    const pct=Math.min(100,(actualMin/targetMin)*100);
    const subjTasks=tasks.filter(t=>t.subjectId===subj.id);
    const doneCnt=subjTasks.filter(t=>t.done).length;
    const tasksHtml=subjTasks.slice(0,4).map(t=>`
      <div class="subj-task-row${t.done?' done':''}" data-tid="${t.id}">
        <i data-lucide="${t.done?'check-circle-2':'circle'}" style="color:${t.done?'var(--emerald-l)':'var(--t3)'}"></i>
        <span class="subj-task-label">${esc(t.title)}</span>
      </div>`).join('');
    return `<div class="subj-card">
      <div class="subj-top">
        <div class="subj-left">
          <div class="subj-icon" style="background:${subj.bg}">${subj.icon}</div>
          <div><div class="subj-name">${esc(subj.name)}</div><div class="subj-time">${fmtMin(actualMin)} este mês</div></div>
        </div>
        <span class="subj-pct" style="color:var(${subj.colorVar})">${pct.toFixed(2)}%</span>
      </div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:${subj.grad};box-shadow:0 0 6px ${subj.glow}"></div></div>
      <div class="subj-tasks-list">${tasksHtml}</div>
      <button class="subj-add-task-btn" data-sid="${subj.id}"><i data-lucide="plus"></i>Adicionar tarefa</button>
    </div>`;
  }).join('');
  lucide.createIcons({nodes:sg.querySelectorAll('[data-lucide]')});
}

function renderGoals(){
  const subjects=AppDB.getSubjects(); const sessions=AppDB.getSessions();
  const minMap=AppStats.monthlyMinBySubject(sessions);
  const pct=AppStats.monthlyProgressPct(sessions,subjects);
  const totalTargetH=subjects.reduce((a,s)=>a+(s.monthlyTargetHours||0),0);
  const totalActualH=Object.values(minMap).reduce((a,m)=>a+m,0)/60;
  const now=new Date();
  document.getElementById('goals-month-pct').textContent=`${pct.toFixed(2)}%`;
  document.getElementById('goals-month-label').textContent=`${MONTH_FULL[now.getMonth()]} ${now.getFullYear()}`;
  document.getElementById('goals-hours-label').textContent=`de ${totalTargetH}h`;
  document.getElementById('goals-sub').textContent=`${totalActualH.toFixed(2)}h / ${totalTargetH}h concluídos este mês`;
  document.getElementById('mainProg').style.width=`${pct}%`;
  const gl=document.getElementById('goalsList');
  gl.innerHTML=subjects.map(s=>{
    const actualMin=minMap[s.id]||0;
    const targetMin=(s.monthlyTargetHours||1)*60;
    const sp=Math.min(100,(actualMin/targetMin)*100);
    return `<div class="goal-row">
      <div class="goal-meta">
        <span class="goal-name-txt"><i data-lucide="${s.lucide||'book'}" style="color:var(${s.colorVar})"></i>${esc(s.name)}</span>
        <span class="goal-pct-txt" style="color:var(${s.colorVar})">${sp.toFixed(2)}%</span>
      </div>
      <div class="goal-bar"><div class="goal-fill" style="width:${sp}%;background:${s.grad};box-shadow:0 0 6px ${s.glow}"></div></div>
    </div>`;
  }).join('');
  lucide.createIcons({nodes:gl.querySelectorAll('[data-lucide]')});
}

function renderAll(){
  renderSchedule(); renderTodayHours(); renderStreak(); renderCountdown(); renderNote();
  renderPomo(); renderWeeklyAnalysis(); renderTasks(); renderSubjectGrid(); renderGoals();
  renderNextSession(); renderMoodBtn();
}

function renderMoodBtn(){
  const moods = AppDB.getMoods();
  const tk = todayKey();
  const mood = moods[tk];
  document.getElementById('btn-mood-current').innerHTML = mood
    ?
    `<img src="${mood}" alt="humor" style="width:26px;height:26px;" draggable="false">`
    : `<img src="icons/nohumor.png" alt="Humor" style="width:26px;height:26px;" draggable="false">`;
}

/* MUTATIONS */

function addScheduleEvent(data){
  const events=AppDB.getSchedule();
  events.push({id:uid(),...data});
  AppDB.saveSchedule(events); renderSchedule(); renderNextSession();
}
function deleteScheduleEvent(id){
  AppDB.saveSchedule(AppDB.getSchedule().filter(e=>e.id!==id)); renderSchedule(); renderNextSession();
}
function addTask(subjectId,title){
  const tasks=AppDB.getTasks();
  tasks.push({id:uid(),subjectId,title,done:false,createdAt:new Date().toISOString(),completedAt:null});
  AppDB.saveTasks(tasks); renderSubjectGrid(); renderTasks();
}
function toggleTask(id){
  const tasks=AppDB.getTasks(); const t=tasks.find(t=>t.id===id);
  if(!t)return;
  t.done=!t.done; t.completedAt=t.done?new Date().toISOString():null;
  AppDB.saveTasks(tasks); renderSubjectGrid(); renderTasks(); renderGoals();
}
function deleteTask(id){
  AppDB.saveTasks(AppDB.getTasks().filter(t=>t.id!==id)); renderSubjectGrid(); renderTasks();
}
function saveNote(body,checklist){
  AppDB.saveNote({body,checklist,updatedAt:new Date().toISOString()}); renderNote();
}
function toggleChecklistItem(itemId){
  const note=AppDB.getNote();
  const item=note.checklist.find(c=>c.id===itemId);
  if(item){item.done=!item.done; note.updatedAt=new Date().toISOString(); AppDB.saveNote(note); renderNote();}
}
function addSubject(data){
  const subjects=AppDB.getSubjects();
  subjects.push({id:uid(),...data});
  AppDB.saveSubjects(subjects); renderSubjectGrid(); renderGoals(); renderSchedule();
}
function updateSubject(id,patch){
  const subjects=AppDB.getSubjects(); const s=subjects.find(s=>s.id===id);
  if(s)Object.assign(s,patch);
  AppDB.saveSubjects(subjects); renderSubjectGrid(); renderGoals(); renderSchedule();
}
function deleteSubject(id){
  AppDB.saveSubjects(AppDB.getSubjects().filter(s=>s.id!==id));
  AppDB.saveTasks(AppDB.getTasks().filter(t=>t.subjectId!==id));
  AppDB.saveSchedule(AppDB.getSchedule().filter(e=>e.subjectId!==id));
  renderSubjectGrid(); renderGoals(); renderSchedule(); renderTasks();
}

/* MODAL OPENERS */

let _selectedPomoSubj=null, _selectedPomoDur=25;
let _moodMonthOffset=0; // 0=mês atual, -1=anterior, etc.

function _renderMoodCalendar(){
  const base = new Date();
  const year  = base.getFullYear();
  const month = base.getMonth() + _moodMonthOffset;
  const disp  = new Date(year, month, 1);
  const dispY = disp.getFullYear();
  const dispM = disp.getMonth();

  document.getElementById('mood-cal-month-label').textContent = `${MONTH_FULL[dispM]} ${dispY}`;

  // Botão next: desabilitado no mês atual (sem futuro)
  const nextBtn = document.getElementById('mood-next-month');
  if(nextBtn) nextBtn.disabled = _moodMonthOffset >= 0;

  const tk = todayKey();
  const moods = AppDB.getMoods();
  const grid = document.getElementById('mood-calendar-grid');
  let html = DAY_ABBR.map(d=>`<div class="mood-cal-hdr">${d}</div>`).join('');

  const startDow   = new Date(dispY, dispM, 1).getDay();
  const daysInMonth = new Date(dispY, dispM+1, 0).getDate();

  for(let i=0;i<startDow;i++) html+=`<div class="mood-day empty"></div>`;
  for(let i=1;i<=daysInMonth;i++){
    const dk = dateKey(new Date(dispY, dispM, i));
    const isToday = dk===tk;
    const em = moods[dk]||'';
    html+=`<div class="mood-day${isToday?' today':''}">
      ${em?`<div class="mood-day-emoji"><img src="${em}" alt="humor" draggable="false"></div>`:''}
      <div class="mood-day-num">${i}</div>
    </div>`;
  }
  grid.innerHTML=html;
}

function openMoodModal(){
  _moodMonthOffset=0; // sempre abre no mês atual
  const tk=todayKey();
  const moods=AppDB.getMoods();
  const pickerBtns=document.querySelectorAll('.mood-emoji-btn');
  pickerBtns.forEach(b=>{
    b.classList.toggle('selected', b.dataset.mood===moods[tk]);
    b.onclick=()=>{
      AppDB.saveMood(tk, b.dataset.mood);
      renderMoodBtn();
      // Refresh apenas picker + calendário, sem reabrir o modal
      pickerBtns.forEach(x=>x.classList.toggle('selected', x.dataset.mood===AppDB.getMoods()[tk]));
      _renderMoodCalendar();
    };
  });

  document.getElementById('mood-prev-month').onclick=()=>{ _moodMonthOffset--; _renderMoodCalendar(); lucide.createIcons({nodes:document.getElementById('modal-mood').querySelectorAll('[data-lucide]')}); };
  document.getElementById('mood-next-month').onclick=()=>{ if(_moodMonthOffset<0){ _moodMonthOffset++; _renderMoodCalendar(); lucide.createIcons({nodes:document.getElementById('modal-mood').querySelectorAll('[data-lucide]')}); } };

  _renderMoodCalendar();
  Modal.open('modal-mood');
}

function openPomoModal(){
  const subjects=AppDB.getSubjects();
  _selectedPomoSubj=Pomo.activeSubjectId||subjects[0].id||null;
  _selectedPomoDur=Pomo.focusMin;
  const list=document.getElementById('pomo-subject-list');
  list.innerHTML=subjects.length?subjects.map(s=>`
    <div class="subj-select-row${s.id===_selectedPomoSubj?' selected':''}" data-sid="${s.id}">
      <span style="font-size:1.1rem">${s.icon}</span>
      <span style="color:var(${s.colorVar})">${esc(s.name)}</span>
    </div>`).join(''):`<div class="empty-state">Nenhuma matéria. Adicione em Configurações Matérias.</div>`;
  list.querySelectorAll('.subj-select-row').forEach(r=>r.addEventListener('click',()=>{
    _selectedPomoSubj=r.dataset.sid;
    list.querySelectorAll('.subj-select-row').forEach(x=>x.classList.remove('selected'));
    r.classList.add('selected');
  }));
  const durBtns=document.querySelectorAll('#pomo-dur-btns button');
  durBtns.forEach(b=>{
    b.classList.toggle('primary',parseInt(b.dataset.min,10)===_selectedPomoDur);
    b.onclick=()=>{_selectedPomoDur=parseInt(b.dataset.min,10);durBtns.forEach(x=>x.classList.remove('primary'));b.classList.add('primary');};
  });
  Modal.open('modal-pomo-subject');
}

function openScheduleModal(){
  const subjects=AppDB.getSubjects();
  const sel=document.getElementById('sched-form-subject');
  sel.innerHTML=subjects.map(s=>`<option value="${s.id}">${s.icon} ${esc(s.name)}</option>`).join('');
  document.getElementById('sched-form-label').value='';
  Modal.open('modal-schedule');
}

function openAddTaskModal(preSubjectId){
  const subjects=AppDB.getSubjects();
  const sel=document.getElementById('task-form-subject');
  sel.innerHTML=subjects.map(s=>`<option value="${s.id}"${s.id===preSubjectId?' selected':''}>${s.icon} ${esc(s.name)}</option>`).join('');
  document.getElementById('task-form-title').value='';
  Modal.open('modal-add-task');
}

function openNoteModal(){
  const note=AppDB.getNote();
  document.getElementById('note-form-body').value=note.body||'';
  const cl=document.getElementById('note-form-checklist');
  cl.innerHTML=(note.checklist||[]).map(it=>`
    <div class="note-cl-item" data-id="${it.id}">
      <input type="checkbox" ${it.done?'checked':''} onchange="this.closest('.note-cl-item').dataset.done=this.checked">
      <span class="cl-label">${esc(it.label)}</span>
      <button class="note-cl-del" type="button" aria-label="Remover item do checklist" onclick="this.closest('.note-cl-item').remove()"><i data-lucide="x"></i></button>
    </div>`).join('');
  lucide.createIcons({nodes:cl.querySelectorAll('[data-lucide]')});
  document.getElementById('note-form-new-item').value='';
  Modal.open('modal-note');
}

let _subjFormSelectedColor='indigo';
function openSubjectsModal(){
  refreshSubjectsList();
  document.getElementById('subject-form-section').style.display='none';
  document.getElementById('subj-modal-footer').style.display='flex';
  // Build color swatches
  const sw=document.getElementById('subj-color-swatches');
  sw.innerHTML=COLOR_THEMES.map(t=>`<div class="color-swatch${t.key===_subjFormSelectedColor?' selected':''}" data-key="${t.key}" style="background:${t.swatch}" title="${t.key}"></div>`).join('');
  sw.querySelectorAll('.color-swatch').forEach(s=>s.addEventListener('click',()=>{_subjFormSelectedColor=s.dataset.key;sw.querySelectorAll('.color-swatch').forEach(x=>x.classList.remove('selected'));s.classList.add('selected');}));
  Modal.open('modal-subjects');
}

function refreshSubjectsList(){
  const subjects=AppDB.getSubjects();
  const list=document.getElementById('subjects-list-in-modal');
  list.innerHTML=subjects.length?subjects.map(s=>`
    <div class="subj-modal-row">
      <div class="subj-modal-row-info"><span style="font-size:1.1rem">${s.icon}</span><span style="font-weight:600">${esc(s.name)}</span><span style="font-size:0.75rem;color:var(--t2)">${s.monthlyTargetHours}h/mês</span></div>
      <div class="subj-modal-actions">
        <button class="nav-btn" data-edit="${s.id}" title="Editar"><i data-lucide="pen-line"></i></button>
        <button class="nav-btn" data-del="${s.id}" title="Excluir" style="color:var(--rose-l)"><i data-lucide="trash-2"></i></button>
      </div>
    </div>`).join(''):`<div class="empty-state">Nenhuma matéria cadastrada ainda.</div>`;
  lucide.createIcons({nodes:list.querySelectorAll('[data-lucide]')});
}

function showSubjectForm(editId){
  const sec=document.getElementById('subject-form-section');
  document.getElementById('subj-modal-footer').style.display='none';
  sec.style.display='block';
  document.getElementById('subj-form-subtitle').textContent=editId?'Editar Matéria':'Nova Matéria';
  document.getElementById('subj-form-edit-id').value=editId||'';
  if(editId){
    const s=AppDB.getSubjects().find(x=>x.id===editId);
    if(s){
      document.getElementById('subj-form-name').value=s.name;
      document.getElementById('subj-form-icon').value=s.icon;
      document.getElementById('subj-form-target').value=s.monthlyTargetHours;
      _subjFormSelectedColor=COLOR_THEMES.find(t=>t.colorVar===s.colorVar).key||'indigo';
    }
  } else {
    document.getElementById('subj-form-name').value='';
    document.getElementById('subj-form-icon').value='';
    document.getElementById('subj-form-target').value=10;
    _subjFormSelectedColor='indigo';
  }
  // Refresh swatches
  const sw=document.getElementById('subj-color-swatches');
  sw.querySelectorAll('.color-swatch').forEach(s=>{s.classList.toggle('selected',s.dataset.key===_subjFormSelectedColor);});
}

/* EVENT BINDINGS */


function setSidebarActive(source){
  document.querySelectorAll('.side-link.active').forEach(el=>el.classList.remove('active'));
  const link = typeof source === 'string' ? document.querySelector(source) : source;
  link.classList.add('active');
}
function focusDashboardCard(id){
  const el=document.getElementById(id);
  if(!el)return;
  el.scrollIntoView({behavior:'smooth',block:'center'});
  const card=el.querySelector('.grid-stack-item-content,.card') || el;
  card.setAttribute('tabindex','-1');
  setTimeout(()=>card.focus({preventScroll:true}),220);
}
function setSidebarCollapsed(collapsed){
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  AppDB._set('sf_sidebar_collapsed', collapsed);
  const btn=document.getElementById('sidebar-toggle');
  if(!btn)return;
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.setAttribute('aria-label', collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral');
  btn.setAttribute('title', collapsed ? 'Expandir menu' : 'Recolher menu');
  btn.innerHTML='<i data-lucide="'+(collapsed?'panel-left-open':'panel-left-close')+'"></i>';
  lucide.createIcons({nodes:[btn]});
}
function initSidebarInteractions(){
  setSidebarCollapsed(!!AppDB._get('sf_sidebar_collapsed', false));
  document.getElementById('sidebar-toggle').addEventListener('click',()=>setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed')));
  document.querySelectorAll('[data-side-target]').forEach(link=>{
    link.addEventListener('click',event=>{
      event.preventDefault();
      setSidebarActive(link);
      focusDashboardCard(link.dataset.sideTarget);
    });
  });
  document.getElementById('side-subjects-btn').addEventListener('click',()=>{setSidebarActive('#side-subjects-btn');openSubjectsModal();});
}

function setThemeMode(mode){
  const dark=mode==='dark';
  document.body.classList.toggle('theme-dark', dark);
  AppDB._set('sf_theme', dark?'dark':'light');
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark?'#11100f':'#f5efe7');
  const btn=document.getElementById('side-theme-toggle');
  if(!btn)return;
  btn.checked=dark;
  btn.setAttribute('aria-label', dark?'Ativar tema claro':'Ativar tema escuro');
  const label=document.getElementById('theme-toggle-label');
  if(label) label.textContent=dark?'Tema claro':'Tema escuro';
  const icon=document.querySelector('.theme-switch-copy [data-lucide]');
  icon.setAttribute('data-lucide', dark?'sun':'moon');
  lucide.createIcons({nodes:[document.querySelector('.theme-switch-row')]});
}
function initThemeMode(){
  const saved=AppDB._get('sf_theme', 'light');
  setThemeMode(saved==='dark'?'dark':'light');
  document.getElementById('side-theme-toggle').addEventListener('change',event=>setThemeMode(event.target.checked?'dark':'light'));
}

function initEventBindings(){
  const byId = id => document.getElementById(id);
  const on = (id, event, handler) => byId(id).addEventListener(event, handler);
  // Overlay + Escape
  on('modal-overlay','click',()=>Modal.closeAll());
  document.addEventListener('keydown',e=>{ if(e.key==='Escape')Modal.closeAll(); Modal.trap(e); });

  // Event Delegation for Schedule List
  byId('scheduleList').addEventListener('click', e => {
    const btn = e.target.closest('.sched-delete');
    if(btn) deleteScheduleEvent(btn.dataset.id);
  });

  // Event Delegation for Subject Grid
  byId('subjectGrid').addEventListener('click', e => {
    const taskRow = e.target.closest('.subj-task-row');
    if(taskRow) toggleTask(taskRow.dataset.tid);
    const addBtn = e.target.closest('.subj-add-task-btn');
    if(addBtn) openAddTaskModal(addBtn.dataset.sid);
  });

  // Event Delegation for Note Checklist
  byId('checklist').addEventListener('click', e => {
    const row = e.target.closest('.check-row');
    if(row) toggleChecklistItem(row.dataset.id);
  });

  // Event Delegation for Subjects Modal
  byId('subjects-list-in-modal').addEventListener('click', e => {
    const editBtn = e.target.closest('[data-edit]');
    if(editBtn) showSubjectForm(editBtn.dataset.edit);
    const delBtn = e.target.closest('[data-del]');
    if(delBtn && confirm('Excluir matéria e todas as tarefas relacionadas')){ deleteSubject(delBtn.dataset.del); refreshSubjectsList(); }
  });

  // Date display
  if(byId('dateDisplay')) byId('dateDisplay').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
  on('topbar-date-pill','click',()=>openMoodModal());
  on('btn-mood-current','click',()=>openMoodModal());
  on('btn-next-session-start','click',()=>{
    const sid=byId('btn-next-session-start').dataset.subjectId || AppDB.getSubjects()[0].id;
    if(sid) Pomo.start(sid, Pomo.focusMin || 25);
  });
  on('btn-next-task-create','click',()=>openAddTaskModal(byId('btn-next-session-start').dataset.subjectId || null));
  initSidebarInteractions();
  initThemeMode();
  document.getElementById('side-mood-btn').addEventListener('click',()=>{setSidebarActive('#side-mood-btn');openMoodModal();});
  document.getElementById('side-edit-layout').addEventListener('click',()=>{setSidebarActive('#side-edit-layout');document.getElementById('btn-edit-layout').click();});
  document.getElementById('side-focus-now').addEventListener('click',()=>document.getElementById('btn-next-session-start').click());
  document.getElementById('side-pmmg-reset').addEventListener('click',()=>{setSidebarActive('#side-pmmg-reset');document.getElementById('btn-pmmg-reset').click();});

  // Schedule
  on('btn-schedule-prev','click',()=>{scheduleWeekOffset--;renderSchedule();});
  on('btn-schedule-next','click',()=>{scheduleWeekOffset++;renderSchedule();});
  on('btn-schedule-add','click',()=>openScheduleModal());
  on('btn-sched-save','click',()=>{
    const subjectId=byId('sched-form-subject').value;
    const dayOfWeek=parseInt(byId('sched-form-day').value,10);
    const startTime=byId('sched-form-time').value;
    const durationMinutes=parseInt(byId('sched-form-dur').value,10)||90;
    const label=byId('sched-form-label').value.trim() || '';
    if(!subjectId)return;
    addScheduleEvent({subjectId,dayOfWeek,startTime,durationMinutes,label});
    Modal.close('modal-schedule');
  });

  // Tasks
  on('btn-tasks-add','click',()=>openAddTaskModal(null));
  on('btn-task-save','click',()=>{
    const subjectId=byId('task-form-subject').value;
    const title=byId('task-form-title').value.trim();
    if(!title||!subjectId)return;
    addTask(subjectId,title); Modal.close('modal-add-task');
  });
  on('task-form-title','keydown',e=>{ if(e.key==='Enter')byId('btn-task-save').click(); });

  // Pomodoro
  on('btn-pomo-main','click',()=>{
    if(Pomo.isRunning){Pomo.pause();}
    else if(Pomo.leftSec<Pomo.totalSec){Pomo.resume();}
    else{openPomoModal();}
  });
  on('btn-pomo-reset','click',()=>Pomo.reset());
  on('btn-pomo-start-confirm','click',()=>{
    if(!_selectedPomoSubj)return;
    Modal.close('modal-pomo-subject');
    Pomo.start(_selectedPomoSubj,_selectedPomoDur);
  });

  // Note
  document.getElementById('btn-note-edit').addEventListener('click',()=>openNoteModal());
  document.getElementById('btn-note-add-item').addEventListener('click',()=>{
    const inp=document.getElementById('note-form-new-item');
    const val=inp.value.trim(); if(!val)return;
    const cl=document.getElementById('note-form-checklist');
    const nid=uid();
    const div=document.createElement('div');
    div.className='note-cl-item'; div.dataset.id=nid;
    div.innerHTML=`<input type="checkbox"><span class="cl-label">${esc(val)}</span><button class="note-cl-del" type="button" aria-label="Remover item do checklist" onclick="this.closest('.note-cl-item').remove()"><i data-lucide="x"></i></button>`;
    cl.appendChild(div); lucide.createIcons({nodes:[div]}); inp.value='';
  });
  document.getElementById('note-form-new-item').addEventListener('keydown',e=>{ if(e.key==='Enter')document.getElementById('btn-note-add-item').click(); });
  document.getElementById('btn-note-save').addEventListener('click',()=>{
    const body=document.getElementById('note-form-body').value;
    const items=[...document.getElementById('note-form-checklist').querySelectorAll('.note-cl-item')].map(el=>({
      id:el.dataset.id||uid(),
      label:el.querySelector('.cl-label').textContent,
      done:el.querySelector('input[type=checkbox]').checked,
    }));
    saveNote(body,items); Modal.close('modal-note');
  });

  // Subjects
  document.getElementById('btn-subjects-manage').addEventListener('click',()=>openSubjectsModal());
  document.getElementById('btn-subj-add-new').addEventListener('click',()=>showSubjectForm(null));
  document.getElementById('btn-subj-form-cancel').addEventListener('click',()=>{
    document.getElementById('subject-form-section').style.display='none';
    document.getElementById('subj-modal-footer').style.display='flex';
  });
  document.getElementById('btn-subj-form-save').addEventListener('click',()=>{
    const name=document.getElementById('subj-form-name').value.trim();
    const icon=document.getElementById('subj-form-icon').value.trim()||'📘';
    const target=parseInt(document.getElementById('subj-form-target').value,10)||10;
    const editId=document.getElementById('subj-form-edit-id').value;
    const theme=COLOR_THEMES.find(t=>t.key===_subjFormSelectedColor)||COLOR_THEMES[0];
    if(!name)return;
    const data={name,icon,colorVar:theme.colorVar,bg:theme.bg,grad:theme.grad,glow:theme.glow,lucide:theme.lucide,monthlyTargetHours:target};
    if(editId){updateSubject(editId,data);}else{addSubject(data);}
    document.getElementById('subject-form-section').style.display='none';
    document.getElementById('subj-modal-footer').style.display='flex';
    refreshSubjectsList();
  });

  // Edit layout toggle
  on('btn-edit-layout','click', toggleEditMode);

  // Widget 3 Dots Resize Handler
  document.addEventListener('click', e => {
    const wBtn = e.target.closest('.widget-menu-btn');
    if(wBtn) {
      if(!gsEditMode) toggleEditMode();
      const t = document.getElementById('global-toast');
      if(t) {
        t.innerHTML = `<i data-lucide="info" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;color:var(--indigo-l)"></i>Modo Ajuste Ativado: Arraste às bordas do cartão.`;
        lucide.createIcons({nodes:[t]});
        t.classList.add('show');
        clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(()=>t.classList.remove('show'), 4000);
      }
    }
  });

  // Pomodoro Finish Early
  const btnFin = document.getElementById('btn-pomo-finish');
  if(btnFin) btnFin.addEventListener('click', () => Pomo._complete(true));

  // Exam date countdown
  document.getElementById('exam-countdown-pill').addEventListener('click',()=>{
    const d=AppDB.getExamDate();
    document.getElementById('exam-date-input').value=d||'';
    Modal.open('modal-exam-date');
  });
  document.getElementById('btn-exam-date-save').addEventListener('click',()=>{
    const val=document.getElementById('exam-date-input').value;
    AppDB.saveExamDate(val||null);
    Modal.close('modal-exam-date');
    renderCountdown();
    lucide.createIcons();
  });

  // PMMG subjects reset
  on('btn-pmmg-reset','click',()=>{
    if(!confirm('Substituir matérias atuais pelas 12 matérias do edital PMMG')) return;
    AppDB.saveSubjects(getPMMGSubjects());
    renderSubjectGrid(); renderGoals(); renderSchedule();
    refreshSubjectsList();
  });

  // TTS (Text-to-Speech) Audio & Export TXT
  let audioPlaying=false, wfAnim;
  const wf=document.getElementById('waveform');
  for(let i=0;i<30;i++){const h=3+Math.random()*15;const b=document.createElement('div');b.className='wf-bar';b.style.cssText=`height:${h}px;opacity:${0.3+Math.random()*0.7}`;wf.appendChild(b);}
  function animateWave(){wf.querySelectorAll('.wf-bar').forEach(b=>{b.style.height=(3+Math.random()*15)+'px';});wfAnim=requestAnimationFrame(()=>setTimeout(animateWave,80));}
  
  let synthUtterance = null;
  if('speechSynthesis' in window) {
    synthUtterance = new SpeechSynthesisUtterance();
    synthUtterance.lang = 'pt-BR';
    synthUtterance.rate = 1.0;
    synthUtterance.onend = () => {
      audioPlaying = false;
      const ico=document.getElementById('audioIcon');
      ico.setAttribute('data-lucide','play');
      lucide.createIcons({nodes:[ico]});
      cancelAnimationFrame(wfAnim);
    };
  }

  document.getElementById('audioBtn').addEventListener('click',()=>{
    if(!synthUtterance) { alert('Seu navegador não suporta leitura de voz.'); return; }
    audioPlaying=!audioPlaying;
    const ico=document.getElementById('audioIcon');
    ico.setAttribute('data-lucide',audioPlaying?'pause':'play');
    lucide.createIcons({nodes:[ico]});
    
    if(audioPlaying) {
      const note=AppDB.getNote();
      let textToRead = note.body || 'Nenhuma anotação disponível para leitura.';
      if(note.checklist&&note.checklist.length){
        textToRead += '. Checklist: ';
        note.checklist.forEach(c => textToRead += c.label + '. ');
      }
      synthUtterance.text = textToRead;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(synthUtterance);
      animateWave();
    } else {
      window.speechSynthesis.cancel();
      cancelAnimationFrame(wfAnim);
    }
  });

  document.getElementById('btn-export-txt').addEventListener('click',()=>{
    const note = AppDB.getNote();
    let text = "=== RESUMO DE ESTUDOS: " + new Date().toLocaleDateString('pt-BR') + " ===\n\n";
    text += (note.body || "Sem anotações no corpo principal.") + "\n\n";
    if(note.checklist && note.checklist.length){
      text += "--- CHECKLIST ---\n";
      note.checklist.forEach(c => { text += `[${c.done?'X':' '}] ${c.label}\n`; });
    }
    const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Resumo-PMMG-${dateKey(new Date())}.txt`;
    a.click();
  });

  // Chart resize
  window.addEventListener('resize',()=>renderWeeklyAnalysis());
}

/* STARTUP */

/* GRIDSTACK  -  WIDGET LAYOUT */

const DEFAULT_LAYOUT = [
  {id:'hero',     x:0,  y:0,  w:8,  h:5},
  {id:'today',    x:8,  y:0,  w:4,  h:5},
  {id:'schedule', x:0,  y:5,  w:4,  h:7},
  {id:'pomodoro', x:4,  y:5,  w:4,  h:6},
  {id:'tasks',    x:8,  y:5,  w:4,  h:13},
  {id:'analysis', x:4,  y:11, w:4,  h:6},
  {id:'note',     x:0,  y:12, w:4,  h:7},
  {id:'subjects', x:0,  y:19, w:8,  h:10},
  {id:'goals',    x:8,  y:18, w:4,  h:11},
];

let gsGrid = null;
let gsEditMode = false;

function enableGridFallback(reason){
  console.warn('[StudyFlow] GridStack indisponível, usando layout fallback.', reason || '');
  const grid=document.getElementById('mainGrid');
  grid.classList.add('grid-fallback');
  gsGrid=null;
}

function initGrid(){
  if(!window.GridStack){
    enableGridFallback('GridStack não carregou');
    return;
  }
  gsGrid = GridStack.init({
    column: 12,
    cellHeight: 60,
    margin: 6,
    animate: true,
    draggable: { handle: '.drag-handle, .card-hd', scroll: true },
    resizable: { handles: 'e,se,s,sw,w' },
  }, '#mainGrid');

  // Start static (locked)
  gsGrid.setStatic(true);
  const applyResponsiveGridMode=()=>{
    const mobile=window.matchMedia('(max-width: 680px)').matches;
    gsGrid.setStatic(mobile || !gsEditMode);
  };
  applyResponsiveGridMode();
  window.matchMedia('(max-width: 680px)').addEventListener?.('change',applyResponsiveGridMode);

  // Load saved layout
  const saved = AppDB._get('sf_layout', null);
  if(saved && Array.isArray(saved)){
    try{ gsGrid.load(saved, false); } catch(e){ console.warn('[StudyFlow] Layout corrompido, usando padrão.',e); }
  }

  // Persist on change
  gsGrid.on('change dragstop resizestop', ()=>{
    AppDB._set('sf_layout', gsGrid.save(false));
    setTimeout(()=>{ renderWeeklyAnalysis(); }, 80);
  });
}

function toggleEditMode(){
  if(!gsGrid){
    toast('Layout livre indisponível: GridStack não carregou.');
    return;
  }
  gsEditMode = !gsEditMode;
  document.getElementById('mainGrid').classList.toggle('grid-fallback', !gsEditMode);
  const btn = document.getElementById('btn-edit-layout');
  const lbl = btn.querySelector('span');
  const ico = btn.querySelector('[data-lucide]');
  if(gsEditMode){
    gsGrid.setStatic(false);
    document.body.classList.add('edit-mode');
    btn.classList.add('active');
    btn.setAttribute('aria-pressed','true');
    lbl.textContent = 'Salvar layout';
    ico.setAttribute('data-lucide','lock-open');
  } else {
    gsGrid.setStatic(true);
    document.body.classList.remove('edit-mode');
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed','false');
    lbl.textContent = 'Editar layout';
    ico.setAttribute('data-lucide','layout-dashboard');
  }
  lucide.createIcons({nodes:[btn]});
}

function resetLayout(){
  if(!gsGrid){
    toast('Layout padrão já está ativo.');
    return;
  }
  AppDB._set('sf_layout', null);
  gsGrid.load(DEFAULT_LAYOUT, true);
  AppDB._set('sf_layout', gsGrid.save(false));
}

// Exit edit mode when clicking outside any block
document.addEventListener('pointerdown', (e) => {
  if (!gsEditMode) return;
  if (e.target.closest('.grid-stack-item')) return;
  if (e.target.closest('#btn-edit-layout')) return;
  if (e.target.closest('#btn-reset-layout')) return;
  toggleEditMode();
});

seedIfEmpty();
Pomo.init();
lucide.createIcons();
initEventBindings();
renderAll();
try{ initGrid(); } catch(e){ enableGridFallback(e); }
// Re-draw chart after layout settles
setTimeout(()=>renderWeeklyAnalysis(),200);
// Register Service Worker
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('[PWA] SW:',e));
}
