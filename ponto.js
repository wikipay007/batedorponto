// ====== COLE AQUI A CONFIG DO SEU PROJETO FIREBASE ======
// Sem apiKey o app funciona em modo local (salva só neste navegador).
// Inclua storageBucket, copiado da configuração do app Web no Firebase, para habilitar fotos.
const FB = { apiKey:"AIzaSyCjKyRLUf2rs56mm8sA75rkls4hEa2fOyY", authDomain:"batedorponto.firebaseapp.com", projectId:"batedorponto", storageBucket:"batedorponto.firebasestorage.app", appId:"1:537488362989:web:8b1e2a14e5c28d1492ebe4" };
// ========================================================

const $ = s => document.querySelector(s);
const useFB = !!FB.apiKey && typeof firebase !== 'undefined';
let db, auth, storage, storageError, uid, days = {}, loaded = {}, sel, period, started = false;
let meta = +localStorage.meta || 8;

/* ---------- utilidades ---------- */
const m = t => { const [a,b] = t.split(':'); return +a*60 + +b };
const hm = n => String(Math.floor(n/60)%24).padStart(2,'0') + ':' + String(n%60).padStart(2,'0');
const nowM = () => { const d = new Date(); return d.getHours()*60 + d.getMinutes() };
const nowS = () => hm(nowM());
const ymd = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const parse = s => { const [a,b,c] = s.split('-'); return new Date(+a, b-1, +c) };
const periodFor = s => {
  const d = parse(s);
  if(d.getDate() < 16) d.setMonth(d.getMonth()-1);
  d.setDate(16);
  return ymd(d);
};
const periodEnd = start => {
  const d = parse(start);
  d.setMonth(d.getMonth()+1);
  d.setDate(15);
  return ymd(d);
};
const todayS = () => ymd(new Date());
const dur = n => { const s = n<0 ? '−' : ''; n = Math.abs(Math.round(n)); return s + Math.floor(n/60) + 'h' + String(n%60).padStart(2,'0') };
const sgn = n => (n>0 ? '+' : '') + dur(n);
const esc = s => (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const goalHours = d => d.targetHours == null ? meta : +d.targetHours;

/* ---------- cálculo ---------- */
function segs(d, isT){
  if(!d.in) return [];
  const a = m(d.in), L = d.lunch ? m(d.lunch) : null, B = d.back ? m(d.back) : null, O = d.out ? m(d.out) : null, n = nowM(), r = [];
  if(L != null){ r.push([a,L]); if(B != null) r.push([B, O ?? (isT ? n : B)]); }
  else r.push([a, O ?? (isT ? n : a)]);
  return r.filter(s => s[1] > s[0]);
}
const brks = d => (d.breaks||[]).filter(b => b.s && b.e && m(b.e) > m(b.s)).map(b => [m(b.s), m(b.e)]);
function stats(d, isT){
  const S = segs(d, isT); let w = 0, bk = 0;
  S.forEach(([a,b]) => { w += b-a; brks(d).forEach(([x,y]) => { const o = Math.min(b,y) - Math.max(a,x); if(o > 0) bk += o; }); });
  return { w: w-bk, bk, lunch: d.lunch && d.back ? Math.max(0, m(d.back)-m(d.lunch)) : 0 };
}

/* ---------- desenho ---------- */
function range(list){
  const t = [];
  list.forEach(([d,isT]) => {
    [d.in,d.lunch,d.back,d.out].forEach(x => x && t.push(m(x)));
    (d.breaks||[]).forEach(b => { b.s && t.push(m(b.s)); b.e && t.push(m(b.e)); });
    if(isT && d.in && !d.out) t.push(nowM());
  });
  let lo = Math.min(480, ...t), hi = Math.max(1080, ...t);
  return [Math.max(0, Math.floor((lo-30)/60)*60), Math.min(1440, Math.ceil((hi+30)/60)*60)];
}
function draw(d, isT, big, [lo,hi]){
  const p = t => ((t-lo)/(hi-lo)*100).toFixed(2) + '%', w = (a,b) => ((b-a)/(hi-lo)*100).toFixed(2) + '%';
  let h = '<div class="tl' + (big ? ' big' : '') + '"><div class="track">';
  if(d.lunch && d.back && m(d.back) > m(d.lunch)) h += `<i class="gap" style="left:${p(m(d.lunch))};width:${w(m(d.lunch),m(d.back))}"></i>`;
  segs(d,isT).forEach(([a,b]) => h += `<i class="seg" style="left:${p(a)};width:${w(a,b)}"></i>`);
  brks(d).forEach(([a,b]) => h += `<i class="brk" style="left:${p(a)};width:${w(a,b)}"></i>`);
  if(big) [['in','l'],['lunch','r'],['back','l'],['out','r']].forEach(([k,s]) => { if(d[k]) h += `<b class="mk ${s}" style="left:${p(m(d[k]))}"><span>${d[k]}</span></b>`; });
  h += '</div>';
  if(big){
    h += '<div class="ax">';
    const st = (hi-lo) > 720 ? 180 : 120;
    for(let t = Math.ceil(lo/st)*st; t <= hi; t += st) h += `<span style="left:${p(t)}">${String(t/60%24)}h</span>`;
    h += '</div>';
  }
  return h + '</div>';
}

/* ---------- armazenamento ---------- */
const col = () => db.collection('users').doc(uid).collection('ponto');
function status(t){ $('#st').textContent = t; }
async function loadPeriod(start){
  if(!useFB || loaded[start]) return;
  loaded[start] = 1; status('carregando…');
  try{
    const D = firebase.firestore.FieldPath.documentId();
    const s = await col().where(D,'>=',start).where(D,'<=',periodEnd(start)).get();
    s.forEach(x => days[x.id] = x.data());
    status('');
  }catch(e){ loaded[start] = 0; status('erro ao carregar'); console.error(e); }
}
async function save(k){
  if(!useFB){ localStorage.ponto = JSON.stringify(days); status('salvo neste navegador'); return true; }
  try{ status('salvando…'); await col().doc(k).set(days[k]); status('salvo'); return true; }
  catch(e){ status('erro ao salvar'); console.error(e); return false; }
}

/* ---------- render ---------- */
const cur = () => days[sel] || (days[sel] = { breaks: [] });
function rDraw(){
  const d = days[sel] || {}, isT = sel === todayS();
  $('#draw').innerHTML = d.in ? draw(d, isT, 1, range([[d,isT]])) : '<div class="empty">Sem registro neste dia</div>';
  const s = stats(d, isT), diff = s.w - goalHours(d)*60;
  const c = [['Trabalhado', d.in ? dur(s.w) : '—'],
    d.excused ? ['Saldo','Abonado'] : d.out ? ['Saldo', sgn(diff)] : d.in ? (diff < 0 ? ['Faltam', dur(-diff)] : ['Extra', sgn(diff)]) : ['Saldo','—'],
    ['Almoço', s.lunch ? dur(s.lunch) : '—'], ['Interrupções', s.bk ? dur(s.bk) : '—']];
  $('#sum').innerHTML = c.map(([a,b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('');
}
function rSettings(){
  const d = days[sel] || {};
  $('#excused').checked = !!d.excused;
  $('#day-meta').value = goalHours(d);
}
function rFields(){
  const d = days[sel] || {}, marks = [['in','Entrada'],['lunch','Saída almoço'],['back','Volta'],['out','Saída']];
  $('#f').innerHTML = marks.map(([k,label]) => {
    const photo = d.photos && d.photos[k], status = storageError
      ? 'Firebase Storage indisponível. Confira a configuração storageBucket do Firebase.'
      : useFB && storage ? '' : 'Envio de fotos requer Firebase Storage configurado.';
    return `<div class="fld">
      <label for="f_${k}">${label}</label>
      <input id="f_${k}" type="time" data-k="${k}" value="${d[k]||''}">
      <button data-now="${k}">Agora</button>
      <div class="mark-photo">
        ${photo ? `<img class="photo-preview" src="${esc(photo.url)}" alt="Foto da marcação: ${label}">` : ''}
        <label class="photo-pick" for="photo-${k}">${photo ? 'Trocar foto' : 'Adicionar foto'}</label>
        <input class="photo-file" id="photo-${k}" type="file" accept="image/*" capture="environment" data-photo="${k}">
        ${photo ? '<button class="photo-remove" type="button" data-photo-remove="' + k + '">Remover foto</button>' : ''}
        <p class="photo-status mut" role="status" aria-live="polite">${status}</p>
      </div>
    </div>`;
  }).join('');
}
function rBrk(){
  const b = (days[sel] && days[sel].breaks) || [];
  $('#brk').innerHTML = b.map((x,i) => `<div class="br" data-i="${i}">
    <input type="time" data-f="s" value="${x.s||''}" aria-label="Início">
    <input type="time" data-f="e" value="${x.e||''}" aria-label="Fim">
    <button class="x" aria-label="Remover">×</button>
    <input class="n" data-f="n" placeholder="Motivo (opcional)" value="${esc(x.n)}">
    <button class="a" data-act="end" title="Encerrar agora">Fim</button></div>`).join('');
}
async function uploadPhoto(input, mark){
  const file = input.files[0], card = input.closest('.mark-photo'), status = card.querySelector('.photo-status');
  if(!file) return;
  if(!storage){ status.textContent = 'Configure o Firebase Storage para enviar fotos.'; input.value = ''; return; }
  if(!file.type.startsWith('image/')){ status.textContent = 'Selecione um arquivo de imagem.'; input.value = ''; return; }
  if(file.size > 10 * 1024 * 1024){ status.textContent = 'A imagem deve ter no máximo 10 MB.'; input.value = ''; return; }

  const key = sel, day = days[key] || { breaks: [] };
  const photos = day.photos || {}, previous = photos[mark];
  const path = `users/${uid}/ponto/${key}/${mark}/${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  const ref = storage.ref(path);
  let uploaded = false, committed = false;
  status.textContent = 'Enviando foto…';
  input.disabled = true;
  try{
    await ref.put(file, { contentType: file.type });
    uploaded = true;
    const next = { url: await ref.getDownloadURL(), path, name: file.name };
    day.photos = { ...photos, [mark]: next };
    days[key] = day;
    if(!await save(key)){
      if(previous) day.photos[mark] = previous;
      else delete day.photos[mark];
      try{ await ref.delete(); }
      catch(error){ console.error('Não foi possível limpar a foto enviada sem referência:', error); }
      uploaded = false;
      if(card.isConnected) status.textContent = 'Não foi possível salvar a referência da foto no Firestore.';
      return;
    }
    committed = true;
    if(previous && previous.path){
      try{ await storage.ref(previous.path).delete(); }
      catch(error){ console.error('Não foi possível excluir a foto substituída:', error); }
    }
    if(sel === key){
      rFields();
      const updatedStatus = document.querySelector(`#f [data-photo="${mark}"]`)?.closest('.mark-photo')?.querySelector('.photo-status');
      if(updatedStatus) updatedStatus.textContent = 'Foto salva.';
    }
  }catch(error){
    if(uploaded && !committed){
      try{ await ref.delete(); }
      catch(cleanupError){ console.error('Não foi possível limpar a foto enviada sem referência:', cleanupError); }
    }
    status.textContent = 'Erro ao enviar a foto. Verifique as regras do Firebase Storage e tente novamente.';
    console.error(error);
  }finally{
    input.disabled = false;
    input.value = '';
  }
}
async function removePhoto(event){
  const button = event.target.closest('[data-photo-remove]');
  if(!button) return;
  const mark = button.dataset.photoRemove, key = sel, day = days[key];
  const photo = day && day.photos && day.photos[mark];
  if(!storage || !photo) return;
  const card = button.closest('.mark-photo');
  const status = card.querySelector('.photo-status');
  status.textContent = 'Removendo foto…';
  button.disabled = true;
  delete day.photos[mark];
  if(!await save(key)){
    day.photos[mark] = photo;
    if(card.isConnected) status.textContent = 'Não foi possível atualizar o registro no Firestore; a foto não foi removida.';
    button.disabled = false;
    return;
  }
  if(sel === key) rFields();
  try{
    await storage.ref(photo.path).delete();
    const updatedStatus = sel === key && document.querySelector(`#f [data-k="${mark}"]`).closest('.fld').querySelector('.photo-status');
    if(updatedStatus) updatedStatus.textContent = 'Foto removida.';
  }catch(error){
    console.error(error);
    const updatedStatus = sel === key && document.querySelector(`#f [data-k="${mark}"]`).closest('.fld').querySelector('.photo-status');
    if(updatedStatus) updatedStatus.textContent = 'A referência foi removida, mas não foi possível excluir a imagem do Storage.';
  }
}
function rList(){
  const start = period, end = periodEnd(start), T = todayS();
  const keys = Object.keys(days).filter(k => k >= start && k <= end && (days[k].in || days[k].excused)).sort().reverse();
  const rg = range(keys.map(k => [days[k], k === T]));
  let tw = 0, ts = 0, h = '';
  keys.forEach(k => {
    const d = days[k], isT = k === T, s = stats(d, isT), dt = parse(k);
    const diff = s.w - goalHours(d)*60;
    tw += s.w; if(!d.excused && d.out) ts += diff;
    const total = d.in ? dur(s.w) : 'Abonado';
    const balance = d.excused ? 'Abonado' : d.out ? sgn(diff) : 'em aberto';
    h += `<div class="row${k===sel?' on':''}" data-d="${k}"><div class="dl">${dt.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')}<b>${String(dt.getDate()).padStart(2,'0')}</b></div><div class="mini">${draw(d,isT,0,rg)}</div><div class="tt">${total}<small>${balance}</small></div></div>`;
  });
  $('#list').innerHTML = h || '<p class="mut" style="padding:14px 0">Nenhum registro neste período. Preencha os horários acima.</p>';
  $('#mh').textContent = `${parse(start).toLocaleDateString('pt-BR')} a ${parse(end).toLocaleDateString('pt-BR')}`;
  $('#mt').innerHTML = `<span><b>${keys.length}</b> dias</span><span><b>${dur(tw)}</b> trabalhadas</span><span>Saldo <b>${sgn(ts)}</b></span><span>Meta diária <input id="meta" type="number" min="1" max="12" step=".25" value="${meta}"> h</span>`;
}
const rAll = () => { rDraw(); rSettings(); rFields(); rBrk(); rList(); };

async function setSel(s){
  sel = s; period = periodFor(s); $('#dt').value = s;
  await loadPeriod(period); rAll();
}
async function setPeriod(delta){
  const d = parse(period); d.setMonth(d.getMonth()+delta);
  period = ymd(d);
  await loadPeriod(period); rList();
}

/* ---------- eventos ---------- */
function build(){
  $('#f').addEventListener('change', e => {
    const photoMark = e.target.dataset.photo;
    if(photoMark){
      uploadPhoto(e.target, photoMark);
      return;
    }
    const k = e.target.dataset.k; if(!k) return;
    const d = cur(); e.target.value ? d[k] = e.target.value : delete d[k];
    save(sel); rDraw(); rList();
  });
  $('#f').addEventListener('click', e => {
    const k = e.target.dataset.now; if(!k) return;
    cur()[k] = nowS(); save(sel); rAll();
  });
  $('#excused').addEventListener('change', e => {
    cur().excused = e.target.checked;
    save(sel); rAll();
  });
  $('#day-meta').addEventListener('change', e => {
    if(!e.target.checkValidity()){ e.target.reportValidity(); return; }
    const d = cur(), value = e.target.value === '' ? null : Number(e.target.value);
    if(value === null || value === meta) delete d.targetHours;
    else d.targetHours = value;
    save(sel); rAll();
  });
  $('#f').addEventListener('click', removePhoto);
  $('#addb').onclick = () => { const d = cur(); (d.breaks = d.breaks || []).push({ s: nowS(), e: '', n: '' }); save(sel); rBrk(); };
  $('#brk').addEventListener('change', e => {
    const r = e.target.closest('.br'); if(!r || !e.target.dataset.f) return;
    cur().breaks[+r.dataset.i][e.target.dataset.f] = e.target.value;
    save(sel); rDraw(); rList();
  });
  $('#brk').addEventListener('click', e => {
    const r = e.target.closest('.br'); if(!r) return;
    const i = +r.dataset.i, b = cur().breaks;
    if(e.target.classList.contains('x')) b.splice(i,1);
    else if(e.target.dataset.act === 'end') b[i].e = nowS();
    else return;
    save(sel); rBrk(); rDraw(); rList();
  });
  $('#list').addEventListener('click', e => { const r = e.target.closest('.row'); if(r){ setSel(r.dataset.d); scrollTo({top:0,behavior:'smooth'}); } });
  $('#mt').addEventListener('change', e => { if(e.target.id === 'meta'){ meta = +e.target.value || 8; localStorage.meta = meta; rDraw(); rSettings(); rList(); } });
  $('#dt').onchange = e => e.target.value && setSel(e.target.value);
  const step = n => { const d = parse(sel); d.setDate(d.getDate()+n); setSel(ymd(d)); };
  $('#pv').onclick = () => step(-1); $('#nx').onclick = () => step(1);
  $('#hj').onclick = () => setSel(todayS());
  $('#mp').onclick = () => setPeriod(-1); $('#mn').onclick = () => setPeriod(1);
  setInterval(() => { if(sel === todayS()){ rDraw(); rList(); } }, 30000);
}
function init(){
  if(started) return; started = true;
  if(!useFB) days = JSON.parse(localStorage.ponto || '{}');
  build(); setSel(todayS());
}

/* ---------- login ---------- */
if(useFB){
  firebase.initializeApp(FB); auth = firebase.auth(); db = firebase.firestore();
  if(typeof firebase.storage === 'function'){
    try{ storage = firebase.storage(firebase.app(), `gs://${FB.storageBucket}`); }
    catch(error){ storageError = error; console.error('Falha ao inicializar Firebase Storage:', error); }
  }
  auth.onAuthStateChanged(u => {
    if(u){ uid = u.uid; $('#auth').hidden = true; init(); } else $('#auth').hidden = false;
  });
  const err = x => $('#ae').textContent = x.message;
  $('#lf').onsubmit = e => { e.preventDefault(); auth.signInWithEmailAndPassword($('#em').value, $('#pw').value).catch(err); };
  $('#cr').onclick = () => auth.createUserWithEmailAndPassword($('#em').value, $('#pw').value).catch(err);
  $('#out').onclick = () => auth.signOut().then(() => location.reload());
} else {
  $('#out').hidden = true; init(); status('modo local');
}

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => console.error('Falha ao registrar service worker:', error));
  });
}
