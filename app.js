// v8: Smart finish confirm + Resume simulation prompt + Choice filter (no spaced repetition)
const REVIEW_KEY = 'quiz_review_ids_v8';
const SIM_KEY = 'quiz_sim_state_v8';

const $ = (id) => document.getElementById(id);
const els = {
  homeBtn: $('homeBtn'), timer: $('timer'), fileInput: $('fileInput'), datasetInfo: $('datasetInfo'),
  homePanel: $('homePanel'), goTraining: $('goTraining'), goSimulation: $('goSimulation'), goReview: $('goReview'),
  openReviewFromHome: $('openReviewFromHome'), clearReviewFromHome: $('clearReviewFromHome'),

  quizPanel: $('quizPanel'), qaWrap: $('qaWrap'), qid: $('qid'), progress: $('progress'), qtext: $('qtext'), answers: $('answers'),
  simNav: $('simNav'), skipBtn: $('skipBtn'), flagBtn: $('flagBtn'), finishBtn: $('finishBtn'), navGrid: $('navGrid'), navHint: $('navHint'),

  after: $('after'), backToResultsBtn: $('backToResultsBtn'), backToResultsTopBtn: $('backToResultsTopBtn'), nextBtn: $('nextBtn'),
  addToReviewBtn: $('addToReviewBtn'), removeFromReviewBtn: $('removeFromReviewBtn'), openReviewBtn: $('openReviewBtn'), clearReviewBtn: $('clearReviewBtn'),

  resultsPanel: $('resultsPanel'), resultsSummary: $('resultsSummary'), resultsBody: $('resultsBody'), newSimBtn: $('newSimBtn'), choiceFilter: $('choiceFilter'),

  reviewPanel: $('reviewPanel'), reviewList: $('reviewList'), startReviewModeBtn: $('startReviewModeBtn'),
  clearReviewBtn2: $('clearReviewBtn2'), closeReviewBtn: $('closeReviewBtn')
};

let dataset = null;
let mode = null; // training | simulation | review
let deck = [];
let index = 0;
let answeredThis = false;

let sim = {
  perScore: [],
  perChoice: [],
  flagged: [],
  endAt: 0,
  timerUiId: null,
  autosaveId: null,
  finished: false,
};

let resultsView = {
  rows: [], // full list
  filterChoice: 'all',
};

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

function loadReviewSet(){
  try{ return new Set(JSON.parse(localStorage.getItem(REVIEW_KEY)||'[]')); }
  catch{ return new Set(); }
}
function saveReviewSet(set){
  const ids=[...set].sort((a,b)=>a-b);
  localStorage.setItem(REVIEW_KEY, JSON.stringify(ids));
}

function resetPanels(){
  els.homePanel.hidden=true;
  els.quizPanel.hidden=true;
  els.reviewPanel.hidden=true;
  els.resultsPanel.hidden=true;
  els.after.hidden=true;
}

function stopTimer(){
  if(sim.timerUiId) clearInterval(sim.timerUiId);
  if(sim.autosaveId) clearInterval(sim.autosaveId);
  sim.timerUiId=null;
  sim.autosaveId=null;
  els.timer.textContent='';
}

function showQuestionArea(){ els.qaWrap.hidden=false; }
function showResultsOnly(){
  els.qaWrap.hidden=true;
  els.after.hidden=true;
  els.simNav.hidden=true;
  els.resultsPanel.hidden=false;
  els.resultsPanel.scrollIntoView({behavior:'smooth', block:'start'});
}

function goHome(force=false){
  if(!force && mode){
    if(!confirm('Vuoi tornare alla Home? La sessione verrà terminata.')) return;
  }
  stopTimer();
  mode=null; deck=[]; index=0; answeredThis=false;
  sim={perScore:[],perChoice:[],flagged:[],endAt:0,timerId:null,finished:false};
  resultsView={rows:[],filterChoice:'all'};
  resetPanels();
  els.homePanel.hidden=false;
  els.qaWrap.hidden=false;
}

// --- Resume simulation persistence ---
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
  }catch{ /* ignore */ }
}

function clearSimState(){
  localStorage.removeItem(SIM_KEY);
}

function tryResumeSimulationPrompt(){
  const raw = localStorage.getItem(SIM_KEY);
  if(!raw || !dataset) return false;

  let state=null;
  try{ state=JSON.parse(raw); }catch{ clearSimState(); return false; }
  if(!state || !Array.isArray(state.deckIds) || !state.endAt) { clearSimState(); return false; }

  // timer expired?
  if(Date.now() >= state.endAt){ clearSimState(); return false; }

  const ok = confirm('Ho trovato una simulazione in corso. Vuoi riprendere?');
  if(!ok){ clearSimState(); return false; }

  // rebuild deck
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

  // 1) Timer UI fluido: ogni secondo
  renderTick();
  sim.timerUiId = setInterval(renderTick, 1000);

  // 2) Autosave separato: ogni 5 secondi
  sim.autosaveId = setInterval(() => {
    if(mode === 'simulation' && !sim.finished) saveSimState();
  }, 5000);
}

function startTimer(seconds){
  sim.endAt=Date.now()+seconds*1000;
  startTimerFromEndAt();
}

function ensureDataset(){
  if(!dataset || !dataset.length){
    alert('Dataset non caricato. Attendi qualche secondo oppure carica domande_297.json manualmente.');
    return false;
  }
  return true;
}

function startTraining(){
  if(!ensureDataset()) return;
  mode='training';
  deck=shuffle(dataset.slice());
  index=0;
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
  showQuestionArea();
  els.resultsPanel.hidden=true;
  els.after.hidden=true;
  els.simNav.hidden=!(mode==='simulation' && !sim.finished);
  buildNavGrid();
  renderQuestion();
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

  // In simulation, keep enabled to allow changing before termina
  if(mode==='simulation' && sim.perChoice[index]){
    const chosen=sim.perChoice[index];
    for(const b of els.answers.querySelectorAll('button.answer')){
      if(b.dataset.tipo===chosen) b.classList.add('selected');
    }
  }

  updateNavGridStyles();
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
    if(tipo!=='efficace'){
      const set=loadReviewSet();
      set.add(q.id);
      saveReviewSet(set);
    }
    els.after.hidden=false;
    els.simNav.hidden=true;
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
  if(index===deck.length-1){ goHome(true); alert('Fine giro.'); return; }
  index+=1; renderQuestion();
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
    b.addEventListener('click',()=>{ index=i; renderQuestion(); saveSimState(); });
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
    if(!sim.perChoice[j]){ index=j; renderQuestion(); saveSimState(); return; }
  }
  index=Math.min(index+1,n-1);
  renderQuestion();
  saveSimState();
}

function toggleFlag(){
  sim.flagged[index]=!sim.flagged[index];
  els.flagBtn.textContent=sim.flagged[index] ? '🔖 Segnata' : '🔖 Segna';
  updateNavGridStyles();
  saveSimState();
}

function labelChoice(c){
  if(c==='efficace') return 'Efficace';
  if(c==='mediamente_efficace') return 'Mediamente efficace';
  if(c==='non_efficace') return 'Non efficace';
  return '—';
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

  const total=sim.perScore.reduce((a,s)=>a+(typeof s==='number'?s:0),0);
  const answeredCount=sim.perChoice.filter(Boolean).length;
  const flaggedCount=sim.flagged.filter(Boolean).length;

  // Add all non-efficaci to review list
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
  resultsView.filterChoice = 'all';
  els.choiceFilter.value = 'all';
  renderResultsTable();

  showResultsOnly();
}

function openSimReview(i){
  showQuestionArea();
  els.resultsPanel.hidden=true;
  els.after.hidden=false;
  els.simNav.hidden=true;

  index=i;
  renderQuestion();

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
  if(!ids.length){
    els.reviewList.innerHTML='<p>Nessuna domanda in “Da rivedere”.</p>';
    return;
  }
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
function removeCurrentFromReview(){ const q=deck[index]; const s=loadReviewSet(); s.delete(q.id); saveReviewSet(s); alert('Rimossa'); }

// --- Events ---
els.homeBtn.addEventListener('click',()=>goHome(false));
els.goTraining.addEventListener('click',startTraining);
els.goSimulation.addEventListener('click',startSimulation);
els.goReview.addEventListener('click',startReviewMode);

els.openReviewFromHome.addEventListener('click',openReviewPanel);
els.clearReviewFromHome.addEventListener('click',()=>{clearReviewAndRefresh(); alert('Svuotata');});

els.openReviewBtn.addEventListener('click',openReviewPanel);
els.clearReviewBtn.addEventListener('click',()=>{clearReviewAndRefresh(); alert('Svuotata');});
els.clearReviewBtn2.addEventListener('click',()=>{clearReviewAndRefresh(); alert('Svuotata');});
els.closeReviewBtn.addEventListener('click',()=>goHome(true));
els.startReviewModeBtn.addEventListener('click',startReviewMode);

els.addToReviewBtn.addEventListener('click',addCurrentToReview);
els.removeFromReviewBtn.addEventListener('click',removeCurrentFromReview);
els.backToResultsBtn.addEventListener('click',backToResults);
els.backToResultsTopBtn.addEventListener('click',backToResults);

els.nextBtn.addEventListener('click',()=>{
  if(mode==='training'||mode==='review') nextTrainingLike();
  else if(mode==='simulation' && sim.finished) backToResults();
});

els.skipBtn.addEventListener('click',skipSimulation);
els.flagBtn.addEventListener('click',toggleFlag);

// Smart finish confirm
els.finishBtn.addEventListener('click',()=>{
  const unanswered = sim.perChoice.filter(x=>!x).length;
  const flagged = sim.flagged.filter(Boolean).length;
  let msg = 'Terminare la simulazione adesso?';
  if(unanswered>0 || flagged>0){
    msg = `Hai ancora ${unanswered} domande non risposte e ${flagged} segnate. Vuoi terminare lo stesso?`;
  }
  if(!confirm(msg)) return;
  finishSimulation();
});

els.choiceFilter.addEventListener('change',()=>{
  resultsView.filterChoice = els.choiceFilter.value;
  renderResultsTable();
});

els.newSimBtn.addEventListener('click',()=>{ clearSimState(); startSimulation(); });

els.fileInput.addEventListener('change', async (e)=>{
  const file=e.target.files?.[0];
  if(!file) return;
  const text=await file.text();
  try{
    const data=JSON.parse(text);
    if(!Array.isArray(data)) throw new Error('Formato non valido (atteso array)');
    dataset=data.sort((a,b)=>a.id-b.id);
    els.datasetInfo.textContent=`Dataset caricato: ${dataset.length} domande (ID ${dataset[0].id}–${dataset[dataset.length-1].id})`;
    // Prompt resume after dataset loaded
    tryResumeSimulationPrompt();
    if(!els.reviewPanel.hidden) openReviewPanel();
  }catch(err){
    alert('Errore nel JSON: '+err.message);
  }
});

// init
resetPanels();
els.homePanel.hidden=false;

// --- Auto-load dataset from GitHub Pages (optional) ---
// Metti il file "domande_297.json" nella stessa cartella di index.html
async function loadDefaultDataset(){
  // Se dataset è già stato caricato manualmente, non fare nulla
  if (dataset && dataset.length) return;

  try{
    const res = await fetch('domande_297.json', { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if(!Array.isArray(data)) throw new Error('Formato non valido (atteso array)');

    dataset = data.sort((a,b)=>a.id-b.id);
    els.datasetInfo.textContent =
      `Dataset caricato automaticamente: ${dataset.length} domande (ID ${dataset[0].id}–${dataset[dataset.length-1].id})`;

    // Dopo il load automatico, se c'è una simulazione salvata propone il resume
    tryResumeSimulationPrompt();

  }catch(err){
    console.log('Auto-load dataset fallito:', err);
    // Non blocchiamo nulla: l’utente può comunque caricare manualmente dal bottone file
    // (opzionale) puoi mostrare un hint:
    // els.datasetInfo.textContent = 'Carica domande_297.json (auto-load non riuscito).';
  }
}

// Avvia auto-load all’avvio
loadDefaultDataset();
