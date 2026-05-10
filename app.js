const REVIEW_KEY = 'quiz_review_ids_v8';
const SIM_KEY = 'quiz_sim_state_v8';
const TRAIN_SEEN_KEY = 'quiz_training_seen_v1';
const FAV_KEY = 'quiz_favorites_v1';
const CONSULT_STATE_KEY = 'quiz_consult_state_v1';

const $ = (id) => document.getElementById(id);
const els = {
  homeBtn: $('homeBtn'), timer: $('timer'), datasetInfo: $('datasetInfo'),
  homePanel: $('homePanel'), goTraining: $('goTraining'), goSimulation: $('goSimulation'), goReview: $('goReview'), goConsult: $('goConsult'),
  openReviewFromHome: $('openReviewFromHome'), clearReviewFromHome: $('clearReviewFromHome'),

  quizPanel: $('quizPanel'), qaWrap: $('qaWrap'), qid: $('qid'), progress: $('progress'), qtext: $('qtext'), answers: $('answers'),
  simNav: $('simNav'), simBottomNav: $('simBottomNav'), simPrevBtn: $('simPrevBtn'), simNextBtn: $('simNextBtn'),
  skipBtn: $('skipBtn'), flagBtn: $('flagBtn'), finishBtn: $('finishBtn'), navGrid: $('navGrid'), navHint: $('navHint'),

  after: $('after'), backToResultsBtn: $('backToResultsBtn'), backToResultsTopBtn: $('backToResultsTopBtn'), nextBtn: $('nextBtn'),
  addToReviewBtn: $('addToReviewBtn'), removeFromReviewBtn: $('removeFromReviewBtn'), openReviewBtn: $('openReviewBtn'), clearReviewBtn: $('clearReviewBtn'),

  resultsPanel: $('resultsPanel'), resultsSummary: $('resultsSummary'), resultsBody: $('resultsBody'), newSimBtn: $('newSimBtn'), choiceFilter: $('choiceFilter'),

  reviewPanel: $('reviewPanel'), reviewList: $('reviewList'), startReviewModeBtn: $('startReviewModeBtn'),
  clearReviewBtn2: $('clearReviewBtn2'), closeReviewBtn: $('closeReviewBtn'),

  consultPanel: $('consultPanel'), closeConsultBtn: $('closeConsultBtn'),
  consultSearch: $('consultSearch'), consultFavOnly: $('consultFavOnly'),
  consultListView: $('consultListView'), consultDetailView: $('consultDetailView'),
  consultCount: $('consultCount'), consultList: $('consultList'),
  consultBackBtn: $('consultBackBtn'), consultPrevBtn: $('consultPrevBtn'), consultNextBtn: $('consultNextBtn'),
  consultStarBtn: $('consultStarBtn'), consultDetailPos: $('consultDetailPos'),
  consultDetailTitle: $('consultDetailTitle'), consultDetailQuestion: $('consultDetailQuestion'),
  consultEff: $('consultEff'), consultMid: $('consultMid'), consultBad: $('consultBad')
};

let dataset = null;
let mode = null;
let deck = [];
let index = 0;
let answeredThis = false;
// flag to show completion message exactly once at the end
let trainingCompletedAllNow = false;

let sim = {
  perScore: [],
  perChoice: [],
  flagged: [],
  endAt: 0,
  timerUiId: null,
  autosaveId: null,
  finished: false,
};

let resultsView = { rows: [], filterChoice: 'all' };

// Consultazione state
let consult = {
  query: '',
  favOnly: false,
  selectedId: null,
  scrollTop: 0,
  filteredIds: []
};

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

function resetPanels(){
  els.homePanel.hidden = true;
  els.quizPanel.hidden = true;
  els.reviewPanel.hidden = true;
  els.resultsPanel.hidden = true;
  els.after.hidden = true;
  els.consultPanel.hidden = true;
}

function stopTimer(){
  if(sim.timerUiId) clearInterval(sim.timerUiId);
  if(sim.autosaveId) clearInterval(sim.autosaveId);
  sim.timerUiId = null;
  sim.autosaveId = null;
  els.timer.textContent = '';
}

function scrollToQuestion(){
  requestAnimationFrame(() => {
    const header = document.querySelector('.appHeader');
    const headerH = header ? header.offsetHeight : 0;
    const y = els.qid.getBoundingClientRect().top + window.pageYOffset;
    const target = Math.max(0, y - headerH - 8);
    window.scrollTo({ top: target, behavior: 'smooth' });
  });
}

function showResultsOnly(){
  // Risultati simulazione: mostra SOLO riepilogo
  els.qaWrap.hidden = true;
  els.after.hidden = true;
  els.simNav.hidden = true;
  if(els.simBottomNav) els.simBottomNav.hidden = true;
  els.resultsPanel.hidden = false;
  els.resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ensureDataset(){
  if(!dataset || !dataset.length){
    alert('Dataset non caricato. Attendi qualche secondo…');
    return false;
  }
  return true;
}

function goHome(force=false){
  if(!force && mode){
    if(!confirm('Vuoi tornare alla Home? La sessione verrà terminata.')) return;
  }
  stopTimer();
  mode = null; deck = []; index = 0; answeredThis = false; trainingCompletedAllNow = false;
  sim = { perScore:[], perChoice:[], flagged:[], endAt:0, timerUiId:null, autosaveId:null, finished:false };
  resultsView = { rows:[], filterChoice:'all' };
  resetPanels();
  els.homePanel.hidden = false;
  els.qaWrap.hidden = false;
  // safety: nascondi bottom nav quando non in simulazione
  if(els.simBottomNav) els.simBottomNav.hidden = true;
}

// ---- Review list (legacy) ----
function loadReviewSet(){
  try{ return new Set(JSON.parse(localStorage.getItem(REVIEW_KEY)||'[]')); }
  catch{ return new Set(); }
}
function saveReviewSet(set){
  const ids=[...set].sort((a,b)=>a-b);
  localStorage.setItem(REVIEW_KEY, JSON.stringify(ids));
}

// ---- Training seen ----
function loadTrainingSeen(){
  try{ return new Set(JSON.parse(localStorage.getItem(TRAIN_SEEN_KEY)||'[]')); }
  catch{ return new Set(); }
}
function saveTrainingSeen(set){
  const ids=[...set].sort((a,b)=>a-b);
  localStorage.setItem(TRAIN_SEEN_KEY, JSON.stringify(ids));
}
function resetTrainingSeen(){ localStorage.removeItem(TRAIN_SEEN_KEY); }

// ---- Favorites ----
function loadFavSet(){
  try{ return new Set(JSON.parse(localStorage.getItem(FAV_KEY)||'[]')); }
  catch{ return new Set(); }
}
function saveFavSet(set){
  localStorage.setItem(FAV_KEY, JSON.stringify([...set].sort((a,b)=>a-b)));
}

// ---- Consult state persistence ----
function loadConsultState(){
  try{ return JSON.parse(localStorage.getItem(CONSULT_STATE_KEY)||'{}') || {}; }
  catch{ return {}; }
}
function saveConsultState(){
  const state={ query: consult.query, favOnly: consult.favOnly, selectedId: consult.selectedId, scrollTop: consult.scrollTop };
  localStorage.setItem(CONSULT_STATE_KEY, JSON.stringify(state));
}

// ---- Simulation resume ----
function saveSimState(){
  try{
    if(mode!=='simulation' || sim.finished) return;
    const state={
      v:1,
      savedAt: Date.now(),
      deckIds: deck.map(q=>q.id),
      index,
      perChoice: sim.perChoice,
      perScore: sim.perScore,
      flagged: sim.flagged,
      endAt: sim.endAt
    };
    localStorage.setItem(SIM_KEY, JSON.stringify(state));
  }catch{}
}
function clearSimState(){ localStorage.removeItem(SIM_KEY); }

function tryResumeSimulationPrompt(){
  const raw = localStorage.getItem(SIM_KEY);
  if(!raw || !dataset) return false;
  let state=null;
  try{ state=JSON.parse(raw); }catch{ clearSimState(); return false; }
  if(!state || !Array.isArray(state.deckIds) || !state.endAt) { clearSimState(); return false; }
  if(Date.now() >= state.endAt){ clearSimState(); return false; }

  const ok = confirm('Ho trovato una simulazione in corso. Vuoi riprendere?');
  if(!ok){ clearSimState(); return false; }

  const rebuilt = state.deckIds.map(id => dataset.find(q=>q.id===id)).filter(Boolean);
  if(rebuilt.length !== state.deckIds.length){ clearSimState(); return false; }

  mode='simulation';
  deck=rebuilt;
  index=Math.min(state.index||0, deck.length-1);
  sim.perChoice=Array.isArray(state.perChoice)?state.perChoice:new Array(deck.length).fill(null);
  sim.perScore=Array.isArray(state.perScore)?state.perScore:new Array(deck.length).fill(null);
  sim.flagged=Array.isArray(state.flagged)?state.flagged:new Array(deck.length).fill(false);
  sim.endAt=state.endAt;
  sim.finished=false;

  startTimerFromEndAt();
  showQuiz();
  return true;
}

function startTimerFromEndAt(){
  stopTimer();
  const renderTick = () => {
    const left = Math.max(0, Math.floor((sim.endAt - Date.now()) / 1000));
    const mm = String(Math.floor(left / 60)).padStart(2,'0');
    const ss = String(left % 60).padStart(2,'0');
    els.timer.textContent = `⏱️ ${mm}:${ss}`;
    if(left === 0 && !sim.finished){
      alert('Tempo scaduto');
      finishSimulation();
    }
  };
  renderTick();
  sim.timerUiId = setInterval(renderTick, 1000);
  sim.autosaveId = setInterval(() => {
    if(mode === 'simulation' && !sim.finished) saveSimState();
  }, 5000);
}

function startTimer(seconds){
  sim.endAt=Date.now()+seconds*1000;
  startTimerFromEndAt();
}

// ---- Modes ----
function startTraining(){
  if(!ensureDataset()) return;
  mode='training';
  trainingCompletedAllNow=false;

  const seen = loadTrainingSeen();
  let unseen = dataset.filter(q => !seen.has(q.id));
  if(unseen.length === 0){
    // auto restart
    resetTrainingSeen();
    unseen = dataset.slice();
  }
  deck = shuffle(unseen.slice());
  index = 0;
  showQuiz();
}

function startSimulation(){
  if(!ensureDataset()) return;
  mode='simulation';
  const n=Math.min(30, dataset.length);
  deck=shuffle(dataset.slice()).slice(0,n);
  index=0;
  sim.perScore=new Array(deck.length).fill(null);
  sim.perChoice=new Array(deck.length).fill(null);
  sim.flagged=new Array(deck.length).fill(false);
  sim.finished=false;
  startTimer(90*60);
  saveSimState();
  showQuiz();
}

function startReviewMode(){
  if(!ensureDataset()) return;
  const set=loadReviewSet();
  const only=dataset.filter(q=>set.has(q.id));
  if(!only.length){ alert('“Da rivedere” è vuota.'); return; }
  mode='review';
  deck=shuffle(only.slice());
  index=0;
  showQuiz();
}

function showQuiz(){
  resetPanels();
  els.quizPanel.hidden=false;

  // quando si entra in quiz, si vede la domanda
  els.qaWrap.hidden=false;

  // risultati sempre nascosti finché non termini
  els.resultsPanel.hidden=true;
  els.after.hidden=true;

  // sim nav / bottom nav solo in simulazione non finita
  const simActive = (mode === 'simulation' && !sim.finished);
  els.simNav.hidden = !simActive;
  if(els.simBottomNav) els.simBottomNav.hidden = !simActive;

  buildNavGrid();
  renderQuestion();
  scrollToQuestion();
}

function renderQuestion(){
  answeredThis=false;
  els.after.hidden=true;
  if(els.backToResultsBtn) els.backToResultsBtn.hidden=true;
  if(els.backToResultsTopBtn) els.backToResultsTopBtn.hidden=true;

  const q=deck[index];
  els.qid.textContent=`Domanda ${q.id}`;
  els.progress.textContent=`${index+1} / ${deck.length}`;
  els.qtext.textContent=q.domanda;

  if(mode==='simulation' && !sim.finished){
    els.flagBtn.textContent=sim.flagged[index] ? '🔖 Segnata' : '🔖 Segna';
    els.navHint.textContent='Blu=risposta data • Contorno=corrente • 🔖=flag';
  } else {
    els.navHint.textContent='';
  }

  const answers=shuffle(q.risposte.map(r=>({...r})));
  els.answers.innerHTML='';
  for(const a of answers){
    const b=document.createElement('button');
    b.type='button';
    b.className='answer';
    b.textContent=a.testo;
    b.dataset.tipo=a.tipo;
    b.dataset.valore=String(a.valore);
    b.addEventListener('click',()=>onAnswer(b,q));
    els.answers.appendChild(b);
  }

  if(mode==='simulation' && sim.perChoice[index]){
    const chosen=sim.perChoice[index];
    for(const b of els.answers.querySelectorAll('button.answer')){
      if(b.dataset.tipo===chosen) b.classList.add('selected');
    }
  }

  updateNavGridStyles();

  // abilita/disabilita prev/next in simulazione
  if(mode === 'simulation' && !sim.finished && els.simPrevBtn && els.simNextBtn){
    els.simPrevBtn.disabled = (index === 0);
    els.simNextBtn.disabled = (index === deck.length - 1);
  }
}

function colorizeAllAnswers(){
  for(const b of els.answers.querySelectorAll('button.answer')){
    b.classList.remove('ok','mid','bad');
    const t=b.dataset.tipo;
    if(t==='efficace') b.classList.add('ok');
    else if(t==='mediamente_efficace') b.classList.add('mid');
    else b.classList.add('bad');
  }
}

function onAnswer(btn,q){
  if(mode==='simulation'){
    if(sim.finished) return;
  } else {
    if(answeredThis) return;
  }

  const tipo=btn.dataset.tipo;
  const score=parseFloat(btn.dataset.valore);

  for(const b of els.answers.querySelectorAll('button.answer')) b.classList.remove('selected');
  btn.classList.add('selected');

  if(mode!=='simulation'){
    answeredThis=true;
    for(const b of els.answers.querySelectorAll('button.answer')) b.disabled=true;
  }

  if(mode==='training' || mode==='review'){
    colorizeAllAnswers();

    if(mode==='training'){
      const seen=loadTrainingSeen();
      if(!seen.has(q.id)){
        seen.add(q.id);
        saveTrainingSeen(seen);
        if(seen.size >= dataset.length) trainingCompletedAllNow=true;
      }
    }

    if(tipo!=='efficace'){
      const set=loadReviewSet();
      set.add(q.id);
      saveReviewSet(set);
    }

    els.after.hidden=false;
    els.simNav.hidden=true;
    if(els.simBottomNav) els.simBottomNav.hidden = true;
    els.nextBtn.textContent=(index===deck.length-1)?'Fine':'Prossima';
  }

  if(mode==='simulation'){
    sim.perChoice[index]=tipo;
    sim.perScore[index]=score;
    updateNavGridStyles();
    saveSimState();
  }
}

function nextTrainingLike(){
  if(!answeredThis){ alert('Rispondi prima.'); return; }

  if(mode==='training' && index===deck.length-1 && trainingCompletedAllNow){
    alert('Hai completato tutte le 297 domande! Ricomincio da capo.');
    trainingCompletedAllNow=false;
    resetTrainingSeen();
    startTraining();
    return;
  }

  if(mode==='training' && index===deck.length-1){
    startTraining();
    return;
  }

  if(index===deck.length-1){
    goHome(true);
    alert('Fine giro.');
    return;
  }

  index+=1;
  renderQuestion();
  scrollToQuestion();
}

function buildNavGrid(){
  if(!(mode==='simulation' && !sim.finished)){
    els.navGrid.innerHTML='';
    return;
  }
  els.navGrid.innerHTML='';
  for(let i=0;i<deck.length;i++){
    const b=document.createElement('button');
    b.type='button';
    b.className='navItem';
    b.textContent=String(i+1);
    b.addEventListener('click',()=>{ 
      index=i; 
      renderQuestion(); 
      saveSimState(); 
      scrollToQuestion();
    });
    els.navGrid.appendChild(b);
  }
  updateNavGridStyles();
}

function updateNavGridStyles(){
  if(!(mode==='simulation' && !sim.finished)) return;
  const nodes=[...els.navGrid.querySelectorAll('button.navItem')];
  nodes.forEach((b,i)=>{
    b.classList.remove('current','answered','flagged');
    if(i===index) b.classList.add('current');
    if(sim.perChoice[i]) b.classList.add('answered');
    if(sim.flagged[i]) b.classList.add('flagged');
  });
}

function skipSimulation(){
  const n=deck.length;
  for(let step=1;step<=n;step++){
    const j=(index+step)%n;
    if(!sim.perChoice[j]){
      index=j;
      renderQuestion();
      saveSimState();
      scrollToQuestion();
      return;
    }
  }
  index=Math.min(index+1,n-1);
  renderQuestion();
  saveSimState();
  scrollToQuestion();
}

function simPrev(){
  if(!(mode === 'simulation' && !sim.finished)) return;
  if(index <= 0) return;
  index -= 1;
  renderQuestion();
  saveSimState();
  scrollToQuestion();
}

function simNext(){
  if(!(mode === 'simulation' && !sim.finished)) return;
  if(index >= deck.length - 1) return;
  index += 1;
  renderQuestion();
  saveSimState();
  scrollToQuestion();
}

function toggleFlag(){
  sim.flagged[index]=!sim.flagged[index];
  els.flagBtn.textContent=sim.flagged[index] ? '🔖 Segnata' : '🔖 Segna';
  updateNavGridStyles();
  saveSimState();
}

function buildResultsRows(){
  resultsView.rows = deck.map((q,i)=>({
    pos: i+1,
    id: q.id,
    choice: sim.perChoice[i] || null,
    score: (typeof sim.perScore[i]==='number') ? sim.perScore[i] : null,
    flagged: !!sim.flagged[i],
    originalIndex: i
  }));
}

function labelChoice(c){
  if(c==='efficace') return 'Efficace';
  if(c==='mediamente_efficace') return 'Mediamente efficace';
  if(c==='non_efficace') return 'Non efficace';
  return '—';
}

function applyChoiceFilter(){
  const f = resultsView.filterChoice;
  if(f==='all') return resultsView.rows;
  if(f==='unanswered') return resultsView.rows.filter(r=>!r.choice);
  return resultsView.rows.filter(r=>r.choice===f);
}

function renderResultsTable(){
  const filtered = applyChoiceFilter();
  els.resultsBody.innerHTML='';
  for(const r of filtered){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.pos}</td><td>${r.id}</td><td>${labelChoice(r.choice)}</td><td>${r.score==null?'—':r.score.toFixed(1)}</td><td style="text-align:center;">${r.flagged?'🔖':''}</td><td><button class="linkBtn" data-i="${r.originalIndex}">Apri</button></td>`;
    els.resultsBody.appendChild(tr);
  }
  els.resultsBody.querySelectorAll('button.linkBtn').forEach(btn=>{
    btn.addEventListener('click', ()=>openSimReview(parseInt(btn.dataset.i,10)));
  });
}

function finishSimulation(){
  stopTimer();
  sim.finished=true;
  clearSimState();

  if(els.simBottomNav) els.simBottomNav.hidden = true;

  const total=sim.perScore.reduce((a,s)=>a+(typeof s==='number'?s:0),0);
  const answeredCount=sim.perChoice.filter(Boolean).length;
  const flaggedCount=sim.flagged.filter(Boolean).length;

  const set=loadReviewSet();
  for(let i=0;i<deck.length;i++) if(sim.perChoice[i] !== 'efficace') set.add(deck[i].id);
  saveReviewSet(set);

  els.simNav.hidden=true;
  els.after.hidden=true;
  els.resultsPanel.hidden=false;

  els.resultsSummary.innerHTML=`
    <div><strong>Punteggio:</strong> ${total.toFixed(1)} / ${deck.length}</div>
    <div><strong>Risposte date:</strong> ${answeredCount} / ${deck.length}</div>
    <div><strong>Segnalibri:</strong> ${flaggedCount}</div>
  `;

  buildResultsRows();
  resultsView.filterChoice='all';
  els.choiceFilter.value='all';
  renderResultsTable();

  showResultsOnly();
}

function openSimReview(i){
  // Mostra domanda (review) e nasconde risultati
  els.qaWrap.hidden=false;
  els.resultsPanel.hidden=true;
  els.after.hidden=false;
  els.simNav.hidden=true;
  if(els.simBottomNav) els.simBottomNav.hidden = true;

  index=i;
  renderQuestion();
  scrollToQuestion();

  if(els.backToResultsBtn) els.backToResultsBtn.hidden=false;
  if(els.backToResultsTopBtn) els.backToResultsTopBtn.hidden=false;

  colorizeAllAnswers();
  const chosen=sim.perChoice[index];
  for(const b of els.answers.querySelectorAll('button.answer')){
    b.disabled=true;
    if(b.dataset.tipo===chosen) b.classList.add('selected');
  }
  els.nextBtn.textContent='Prossima da rivedere';
}

function backToResults(){
  if(!sim.finished) return;
  if(els.backToResultsBtn) els.backToResultsBtn.hidden=true;
  if(els.backToResultsTopBtn) els.backToResultsTopBtn.hidden=true;
  showResultsOnly();
}

function openReviewPanel(){
  if(!ensureDataset()) return;
  resetPanels();
  els.reviewPanel.hidden=false;

  const set=loadReviewSet();
  const ids=[...set].sort((a,b)=>a-b);
  els.reviewList.innerHTML='';
  if(!ids.length){ els.reviewList.innerHTML='<p>Nessuna domanda in “Da rivedere”.</p>'; return; }

  ids.forEach(id=>{
    const q=dataset.find(x=>x.id===id);
    const d=document.createElement('details'); d.className='acc';
    const s=document.createElement('summary'); s.innerHTML=`<strong>${id}</strong> <span class="muted">(clicca per aprire)</span>`;
    d.appendChild(s);
    const body=document.createElement('div'); body.className='accBody'; body.textContent=q?q.domanda:'';
    d.appendChild(body);
    els.reviewList.appendChild(d);
  });
}

function clearReview(){ if(!confirm('Vuoi davvero svuotare “Da rivedere”?')) return; localStorage.removeItem(REVIEW_KEY); }
function clearReviewAndRefresh(){ clearReview(); if(!els.reviewPanel.hidden) openReviewPanel(); }
function addCurrentToReview(){ const q=deck[index]; const s=loadReviewSet(); s.add(q.id); saveReviewSet(s); alert('Aggiunta'); }
function removeFromReview(){ const q=deck[index]; const s=loadReviewSet(); s.delete(q.id); saveReviewSet(s); alert('Rimossa'); }

// ---- CONSULTAZIONE ----
function openConsult(){
  if(!ensureDataset()) return;
  mode='consult';
  resetPanels();
  els.consultPanel.hidden=false;

  const st=loadConsultState();
  consult.query = (st.query||'');
  consult.favOnly = !!st.favOnly;
  consult.selectedId = st.selectedId || null;
  consult.scrollTop = st.scrollTop || 0;

  els.consultSearch.value = consult.query;
  els.consultFavOnly.checked = consult.favOnly;

  renderConsultList();
  setTimeout(()=>{ els.consultList.scrollTop = consult.scrollTop; }, 0);

  if(consult.selectedId){
    const q = dataset.find(x=>x.id===consult.selectedId);
    if(q) openConsultDetail(consult.selectedId, false);
  }
}

function closeConsult(){
  consult.scrollTop = els.consultList.scrollTop || 0;
  saveConsultState();
  goHome(true);
}

function normalize(s){ return (s||'').toLowerCase(); }

function getConsultFilteredIds(){
  const fav=loadFavSet();
  const q = normalize(consult.query).trim();

  let ids = dataset.map(x=>x.id);
  if(consult.favOnly){
    ids = ids.filter(id=>fav.has(id));
  }
  if(!q) return ids;

  const isNum = /^\d+$/.test(q);
  if(isNum){
    const needle = parseInt(q,10);
    if(ids.includes(needle)) return [needle];
    return ids.filter(id => String(id).includes(q));
  }

  const out=[];
  for(const id of ids){
    const item = dataset[id-1];
    if(!item) continue;
    const hay = normalize(item.domanda) + ' ' + normalize(item.risposte?.map(r=>r.testo).join(' ')||'');
    if(hay.includes(q)) out.push(id);
  }
  return out;
}

function renderConsultList(){
  consult.filteredIds = getConsultFilteredIds();
  els.consultCount.textContent = `Mostrate: ${consult.filteredIds.length} / ${dataset.length}`;

  const fav=loadFavSet();
  els.consultList.innerHTML='';

  for(const id of consult.filteredIds){
    const q = dataset[id-1];
    if(!q) continue;

    const row=document.createElement('div');
    row.className='consultRow';

    const left=document.createElement('div');
    left.className='consultLeft';

    const idEl=document.createElement('div');
    idEl.className='consultId';
    idEl.textContent=String(id);

    const prev=document.createElement('div');
    prev.className='consultPreview';
    prev.textContent=q.domanda;

    left.appendChild(idEl);
    left.appendChild(prev);

    const star=document.createElement('button');
    star.type='button';
    star.className='starBtn' + (fav.has(id)?' on':'');
    star.textContent = fav.has(id)?'★':'☆';
    star.title = 'Preferito';

    left.addEventListener('click', ()=> openConsultDetail(id, true));
    star.addEventListener('click', (e)=>{
      e.stopPropagation();
      toggleFavorite(id);
      renderConsultList();
    });

    row.appendChild(left);
    row.appendChild(star);
    els.consultList.appendChild(row);
  }

  saveConsultState();
}

function toggleFavorite(id){
  const fav=loadFavSet();
  if(fav.has(id)) fav.delete(id); else fav.add(id);
  saveFavSet(fav);
}

function openConsultDetail(id){
  consult.selectedId = id;
  saveConsultState();

  els.consultListView.hidden=true;
  els.consultDetailView.hidden=false;

  const fav=loadFavSet();
  els.consultStarBtn.classList.toggle('on', fav.has(id));
  els.consultStarBtn.textContent = fav.has(id)?'★':'☆';

  const pos = consult.filteredIds.indexOf(id);
  els.consultDetailPos.textContent = (pos>=0)?`${pos+1} / ${consult.filteredIds.length}`:`ID ${id}`;

  const q = dataset[id-1];
  els.consultDetailTitle.textContent = `Domanda ${id}`;
  els.consultDetailQuestion.textContent = q.domanda;

  const eff = q.risposte.find(r=>r.tipo==='efficace')?.testo || '';
  const mid = q.risposte.find(r=>r.tipo==='mediamente_efficace')?.testo || '';
  const bad = q.risposte.find(r=>r.tipo==='non_efficace')?.testo || '';

  els.consultEff.textContent = eff;
  els.consultMid.textContent = mid;
  els.consultBad.textContent = bad;

  els.consultStarBtn.onclick = ()=>{
    toggleFavorite(id);
    const fav2=loadFavSet();
    els.consultStarBtn.classList.toggle('on', fav2.has(id));
    els.consultStarBtn.textContent = fav2.has(id)?'★':'☆';
    if(consult.favOnly && !fav2.has(id)){
      backToConsultList();
      renderConsultList();
    }
  };

  els.consultPrevBtn.disabled = (pos<=0);
  els.consultNextBtn.disabled = (pos<0 || pos>=consult.filteredIds.length-1);

  els.consultPrevBtn.onclick = ()=>{
    const p=consult.filteredIds.indexOf(consult.selectedId);
    if(p>0) openConsultDetail(consult.filteredIds[p-1]);
  };
  els.consultNextBtn.onclick = ()=>{
    const p=consult.filteredIds.indexOf(consult.selectedId);
    if(p>=0 && p<consult.filteredIds.length-1) openConsultDetail(consult.filteredIds[p+1]);
  };

  window.scrollTo({top:0, behavior:'smooth'});
}

function backToConsultList(){
  els.consultDetailView.hidden=true;
  els.consultListView.hidden=false;
  setTimeout(()=>{ els.consultList.scrollTop = consult.scrollTop || 0; }, 0);
}

// ---- events ----
els.homeBtn.addEventListener('click',()=>goHome(false));
els.goTraining.addEventListener('click', startTraining);
els.goSimulation.addEventListener('click', ()=>{
  if(!ensureDataset()) return;
  const resumed = tryResumeSimulationPrompt();
  if(resumed) return;
  startSimulation();
});
els.goReview.addEventListener('click', startReviewMode);
els.goConsult.addEventListener('click', openConsult);

els.openReviewFromHome.addEventListener('click', openReviewPanel);
els.clearReviewFromHome.addEventListener('click', ()=>{ clearReviewAndRefresh(); alert('Svuotata'); });

els.openReviewBtn.addEventListener('click', openReviewPanel);
els.clearReviewBtn.addEventListener('click', ()=>{ clearReviewAndRefresh(); alert('Svuotata'); });
els.clearReviewBtn2.addEventListener('click', ()=>{ clearReviewAndRefresh(); alert('Svuotata'); });
els.closeReviewBtn.addEventListener('click', ()=>goHome(true));
els.startReviewModeBtn.addEventListener('click', startReviewMode);

els.addToReviewBtn.addEventListener('click', addCurrentToReview);
els.removeFromReviewBtn.addEventListener('click', removeFromReview);
els.backToResultsBtn.addEventListener('click', backToResults);
els.backToResultsTopBtn.addEventListener('click', backToResults);

if(els.simPrevBtn) els.simPrevBtn.addEventListener('click', simPrev);
if(els.simNextBtn) els.simNextBtn.addEventListener('click', simNext);

els.nextBtn.addEventListener('click', ()=>{
  if(mode==='training'||mode==='review') nextTrainingLike();
  else if(mode==='simulation' && sim.finished) backToResults();
});

els.skipBtn.addEventListener('click', skipSimulation);
els.flagBtn.addEventListener('click', toggleFlag);

els.finishBtn.addEventListener('click', ()=>{
  const unanswered = sim.perChoice.filter(x=>!x).length;
  const flagged = sim.flagged.filter(Boolean).length;
  let msg = 'Terminare la simulazione adesso?';
  if(unanswered>0 || flagged>0){
    msg = `Hai ancora ${unanswered} domande non risposte e ${flagged} segnate. Vuoi terminare lo stesso?`;
  }
  if(!confirm(msg)) return;
  finishSimulation();
});

els.choiceFilter.addEventListener('change', ()=>{
  resultsView.filterChoice = els.choiceFilter.value;
  renderResultsTable();
});

els.newSimBtn.addEventListener('click', ()=>{ clearSimState(); startSimulation(); });

// Consultazione events
els.closeConsultBtn.addEventListener('click', closeConsult);
els.consultBackBtn.addEventListener('click', backToConsultList);
els.consultSearch.addEventListener('input', ()=>{
  consult.query = els.consultSearch.value;
  consult.scrollTop = 0;
  renderConsultList();
});
els.consultFavOnly.addEventListener('change', ()=>{
  consult.favOnly = els.consultFavOnly.checked;
  consult.scrollTop = 0;
  renderConsultList();
});
els.consultList.addEventListener('scroll', ()=>{
  consult.scrollTop = els.consultList.scrollTop || 0;
  saveConsultState();
});

// init
resetPanels();
els.homePanel.hidden=false;

// Auto-load dataset from GitHub Pages
async function loadDefaultDataset(){
  try{
    const res = await fetch('domande_297.json', { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if(!Array.isArray(data)) throw new Error('Formato non valido (atteso array)');
    dataset = data.sort((a,b)=>a.id-b.id);
    els.datasetInfo.textContent = `Dataset caricato automaticamente: ${dataset.length} domande (ID ${dataset[0].id}–${dataset[dataset.length-1].id})`;
  }catch(err){
    console.log('Auto-load dataset fallito:', err);
    els.datasetInfo.textContent = 'Errore caricamento dataset (controlla domande_297.json nel repo).';
  }
}
loadDefaultDataset();
