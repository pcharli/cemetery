/* 
  Virtual cemetery (clean build)
  - Scrollable cemetery with multiple alleys (HR) + SVG tombs on alley edges
  - Zoom slider scales the whole world (alleys + tombs)
  - Recenter button centers on selected tomb (or top-left)
  - Highlights: hover tomb, selected tomb, search-hover suggestion
  - Mobile: info box opens as bottom sheet modal
*/

const STORAGE_KEY = 'virtual-cemetery-v1';
const ZOOM_KEY = 'cemetery-zoom-percent';

// --- Demo data ---
const sampleDeceased = [
  {first:"Marie", last:"Dupont", description:"Aimait le jardinage et les roses.", dateOfDeath:"2018-04-12", likes:3},
  {first:"Ahmed", last:"Khalil", description:"Ancien instituteur apprécié.", dateOfDeath:"2005-09-01", likes:1},
  {first:"Lucien", last:"Martin", description:"Passionné de mécanique.", dateOfDeath:"1999-11-20", likes:2},
  {first:"Sofia", last:"Moreau", description:"Jeune artiste peintre.", dateOfDeath:"2016-02-14", likes:5},
  {first:"Claire", last:"Bernard", description:"Professeure de musique.", dateOfDeath:"2012-07-08", likes:0},
  {first:"Antoine", last:"Roux", description:"Toujours prêt à aider.", dateOfDeath:"2009-12-30", likes:2},
  {first:"Élise", last:"Fournier", description:"Grande lectrice.", dateOfDeath:"2011-02-09", likes:2},
  {first:"Noah", last:"Gauthier", description:"Fan de football.", dateOfDeath:"2003-07-30", likes:0},
  {first:"Camille", last:"Chevalier", description:"Artiste peintre.", dateOfDeath:"2019-12-25", likes:1},
  {first:"Lucie", last:"Garnier", description:"Médecin dévouée.", dateOfDeath:"2014-03-19", likes:3},
  {first:"Paul", last:"Renaud", description:"Artisan local respecté.", dateOfDeath:"2001-08-04", likes:0},
];

function genId(){ return 't'+Math.random().toString(36).slice(2,9); }

function getDefaultData(){
  return sampleDeceased.map(s => ({
    id: genId(),
    name: `${s.first} ${s.last}`,
    dates: s.dateOfDeath || '',
    story: s.description || '',
    likes: typeof s.likes === 'number' ? s.likes : 0
  }));
}

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return getDefaultData();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : getDefaultData();
  }catch(_){ return getDefaultData(); }
}
function saveData(items){ localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

// --- DOM ---
const map = document.getElementById('map');
const world = document.getElementById('world');
const canvasWrap = document.getElementById('canvasWrap');
const alleys = document.getElementById('alleys');

const search = document.getElementById('search');
const suggestions = document.getElementById('suggestions');
const newBtn = document.getElementById('newBtn');
const countEl = document.getElementById('count');

const panel = document.getElementById('panel');
const closePanel = document.getElementById('closePanel');
const detail = document.getElementById('detail');
const likeBtn = document.getElementById('likeBtn');
const likesCount = document.getElementById('likesCount');
const editBtn = document.getElementById('editBtn');
const deleteBtn = document.getElementById('deleteBtn');
const editForm = document.getElementById('editForm');
const cancelEdit = document.getElementById('cancelEdit');

const zoom = document.getElementById('zoom');
const recenterBtn = document.getElementById('recenterBtn');

// admin flag
const isAdmin = location.search.includes('admin');
if(editBtn) editBtn.style.display = isAdmin ? '' : 'none';
if(deleteBtn) deleteBtn.style.display = isAdmin ? '' : 'none';

// --- State ---
const state = {
  items: loadData(),
  selected: null,
  layoutW: 1000,
  layoutH: 600
};

// --- Layout tuning ---
const perPath = 15;
const rowGap = 115;       // smaller => alleys closer
const topPad = 60;
const bottomPad = 80;
const edgeOffset = 16;    // tomb distance from alley line

// --- Zoom ---
function getDefaultZoomPercent(){
  return window.matchMedia('(max-width: 640px)').matches ? 135 : 100;
}
function getZoomPercent(){
  const saved = Number(localStorage.getItem(ZOOM_KEY));
  return Number.isFinite(saved) && saved > 0 ? saved : getDefaultZoomPercent();
}
function getZoomScale(){
  const v = Number(zoom?.value || 100);
  return Math.max(0.2, v / 100);
}
function applyZoom(){
  if(!world) return;
  const s = getZoomScale();
  world.style.transformOrigin = '0 0';
  world.style.transform = `scale(${s})`;
}

function updateZoomBounds(){
  if(!zoom || !canvasWrap) return;

  // Compute a minimum zoom so that the full alley WIDTH fits on screen (no horizontal swipe needed)
  // i.e. state.layoutW * scale <= canvasWrap.clientWidth
  const fitScale = (canvasWrap.clientWidth / state.layoutW) * 0.92; // small margin so the alley is fully visible
  const fitPercent = Math.max(25, Math.ceil(fitScale * 100));

  // On mobile we enforce the fitPercent as the slider minimum
  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  if(isMobile){
    zoom.min = String(fitPercent);
  }else{
    // keep desktop comfort min
    zoom.min = '80';
  }

  // If current zoom is below min, bump it up
  const current = Number(zoom.value || 100);
  const minV = Number(zoom.min || 50);
  if(current < minV){
    zoom.value = String(minV);
    localStorage.setItem(ZOOM_KEY, String(minV));
    applyZoom();
  }
}
if(zoom){
  zoom.value = String(getZoomPercent());
  zoom.addEventListener('input', ()=>{
    localStorage.setItem(ZOOM_KEY, String(Number(zoom.value || 100)));
    applyZoom();
  });
}
window.addEventListener('load', applyZoom);

// --- Highlights (hover / selected / search hover) ---
let hoveredId = null;
let searchHoverId = null;

function clearHighlights(){
  map.querySelectorAll('.stone.search-highlight').forEach(el => el.classList.remove('search-highlight'));
}
function refreshHighlights(){
  clearHighlights();
  const ids = [state.selected?.id, hoveredId, searchHoverId].filter(Boolean);
  ids.forEach(id=>{
    const g = map.querySelector(`[data-id="${id}"]`);
    const stone = g?.querySelector('.stone');
    if(stone) stone.classList.add('search-highlight');
    if(g) map.appendChild(g);
  });
}
function setHovered(id){
  hoveredId = id;
  refreshHighlights();
}
function setSearchHover(id){
  searchHoverId = id;
  refreshHighlights();
}
function clearSelection(){
  state.selected = null;
  hoveredId = null;
  searchHoverId = null;
  refreshHighlights();
}

// --- Geometry helpers ---
function catmullRom(t,v0,v1,v2,v3){
  const t2=t*t, t3=t2*t;
  return 0.5*((2*v1)+(-v0+v2)*t+(2*v0-5*v1+4*v2-v3)*t2+(-v0+3*v1-3*v2+v3)*t3);
}
function samplePath(points, t){
  const n = points.length;
  const totalT = t*(n-1);
  const i = Math.floor(totalT);
  const lt = totalT - i;
  const p0 = points[Math.max(0,i-1)];
  const p1 = points[i];
  const p2 = points[Math.min(n-1,i+1)];
  const p3 = points[Math.min(n-1,i+2)];
  return {x: catmullRom(lt,p0[0],p1[0],p2[0],p3[0]), y: catmullRom(lt,p0[1],p1[1],p2[1],p3[1])};
}

function buildRowPoints(y, rowIdx){
  // gentle S curve around y
  const wobble = (rowIdx % 2 === 0) ? 8 : -8;
  return [
    [80,  y + 10 + wobble],
    [220, y - 14 - wobble*0.3],
    [420, y + 12 + wobble*0.2],
    [620, y - 10 - wobble*0.15],
    [820, y + 10 + wobble*0.1],
    [940, y - 8  - wobble*0.05],
  ];
}

function computeRows(){
  return Math.min(12, Math.max(1, Math.ceil(state.items.length / perPath)));
}

function computeLayout(rows){
  state.layoutH = Math.max(600, topPad + (rows-1)*rowGap + bottomPad);
  // Set SVG viewBox to match world height
  map.setAttribute('viewBox', `0 0 ${state.layoutW} ${state.layoutH}`);
  // Fix actual pixel size of world at scale=1 (so scroll works)
  map.style.width = `${state.layoutW}px`;
  map.style.height = `${state.layoutH}px`;
  if(world){
    world.style.width = `${state.layoutW}px`;
    world.style.height = `${state.layoutH}px`;
  }
}

function renderAlleys(rows){
  if(!alleys) return;
  alleys.innerHTML = '';
  for(let r=0;r<rows;r++){
    const y = topPad + r*rowGap;
    const hr = document.createElement('hr');
    hr.style.top = `${(y/state.layoutH)*100}%`;
    alleys.appendChild(hr);
  }
}

function el(name, attrs){
  const e = document.createElementNS('http://www.w3.org/2000/svg', name);
  if(attrs) for(const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function render(){
  // clear svg
  while(map.firstChild) map.removeChild(map.firstChild);

  if(countEl) countEl.textContent = `${state.items.length} ${state.items.length>1?'tombes':'tombe'}`;

  const rows = computeRows();
  computeLayout(rows);
  renderAlleys(rows);

  // distribute items per row
  let start = 0;

  for(let r=0;r<rows;r++){
    const remaining = state.items.length - start;
    const rowsLeft = rows - r;
    const take = Math.ceil(remaining / rowsLeft);
    const slice = state.items.slice(start, start+take);
    start += take;

    const baseY = topPad + r*rowGap;
    const points = buildRowPoints(baseY, r);

    // place tombs along row
    const total = slice.length;
    for(let i=0;i<total;i++){
      const t = 0.06 + (i/Math.max(1,total-1))*0.88;
      const pos = samplePath(points, t);

      const side = (i % 2 === 0) ? -1 : 1;
      const yEdge = pos.y + side*edgeOffset;

      const g = el('g', {class:'tomb', 'data-id': slice[i].id});
      const baseX = Math.round(pos.x - 20);
      const baseYt = Math.round(yEdge - 40);

      const stone = el('rect',{x: baseX, y: baseYt + 18, width:40, height:36, rx:6, class:'stone'});
      const plate = el('rect',{x: baseX + 6, y: baseYt + 2, width:28, height:28, rx:4, class:'plate'});
      const name = el('text',{x: baseX + 20, y: baseYt + 20, class:'tomb-text'});
      name.textContent = slice[i].name.split(' ')[0];

      const like = el('text',{x: baseX + 20, y: baseYt + 56, class:'likes-text'});
      like.textContent = `❤ ${slice[i].likes||0}`;

      g.appendChild(stone); g.appendChild(plate); g.appendChild(name); g.appendChild(like);

      // hover lift
      g.setAttribute('data-base-y', String(baseYt));
      g.addEventListener('mouseenter', ()=>{
        setHovered(slice[i].id);
        const by = Number(g.getAttribute('data-base-y')||0);
        stone.setAttribute('y', String(by + 18 - 6));
        plate.setAttribute('y', String(by + 2 - 6));
        name.setAttribute('y', String(by + 20 - 6));
        like.setAttribute('y', String(by + 56 - 6));
      });
      g.addEventListener('mouseleave', ()=>{
        if(hoveredId === slice[i].id) setHovered(null);
        const by = Number(g.getAttribute('data-base-y')||0);
        stone.setAttribute('y', String(by + 18));
        plate.setAttribute('y', String(by + 2));
        name.setAttribute('y', String(by + 20));
        like.setAttribute('y', String(by + 56));
      });

      g.addEventListener('click', ()=>{
        selectItem(slice[i].id);
      });

      map.appendChild(g);
    }
  }

  refreshHighlights();
}

// --- Panel / Modal ---
let smallModal = null;

function showDetail(it){
  detail.innerHTML = `
    <h3>${escapeHtml(it.name)}</h3>
    <p><strong>${escapeHtml(it.dates||'')}</strong></p>
    <p>${escapeHtml(it.story||"Pas d'histoire renseignée.")}</p>
  `;
  likesCount.textContent = String(it.likes||0);
  editForm.hidden = true;
  detail.style.display = 'block';
}

function openModalForSmall(){
  closeModalSmall();
  smallModal = document.createElement('div');
  smallModal.id = 'mobileModal';
  smallModal.style.position='fixed';
  smallModal.style.left=0;smallModal.style.top=0;smallModal.style.right=0;smallModal.style.bottom=0;
  smallModal.style.background='rgba(0,0,0,0.35)';
  smallModal.style.display='flex';
  smallModal.style.alignItems='flex-end';
  smallModal.style.zIndex='100';

  const adminEdit = isAdmin ? `<button id="mobileEdit">Éditer</button>` : '';

  smallModal.innerHTML = `
    <div style="background:white;border-radius:14px 14px 0 0;padding:12px;width:100%;max-height:70vh;overflow:auto;">
      <button id="mobileClose" style="float:right;border:none;background:transparent;font-size:18px">✕</button>
      <div id="mobileDetail">${detail.innerHTML}</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button id="mobileLike" style="flex:1;padding:10px;border-radius:12px;border:1px solid #e2dfda;background:#fff">❤ ${(state.selected?.likes||0)}</button>
        ${adminEdit}
      </div>
    </div>
  `;
  document.body.appendChild(smallModal);

  document.getElementById('mobileClose')?.addEventListener('click', ()=>{
    closeModalSmall();
    clearSelection();
  });

  document.getElementById('mobileLike')?.addEventListener('click', ()=>{
    likeBtn.click();
    const b = document.getElementById('mobileLike');
    if(b) b.textContent = `❤ ${(state.selected?.likes||0)}`;
  });

  if(isAdmin){
    document.getElementById('mobileEdit')?.addEventListener('click', ()=>{
      closeModalSmall();
      panel.style.display='flex';
      panel.setAttribute('aria-hidden','false');
      editBtn.click();
    });
  }
}

function closeModalSmall(){
  const m = document.getElementById('mobileModal');
  if(m) m.remove();
  smallModal = null;
}

function selectItem(id){
  const it = state.items.find(x=>x.id===id);
  if(!it) return;

  state.selected = it;
  showDetail(it);
  refreshHighlights();

  if(window.innerWidth <= 640){
    openModalForSmall();
  }else{
    panel.style.display = 'flex';
    panel.setAttribute('aria-hidden','false');
  }
}

closePanel?.addEventListener('click', ()=>{
  panel.style.display='none';
  panel.setAttribute('aria-hidden','true');
  closeModalSmall();
  clearSelection();
});

// --- Likes / edit / delete ---
likeBtn?.addEventListener('click', ()=>{
  if(!state.selected) return;
  state.selected.likes = (state.selected.likes||0)+1;
  likesCount.textContent = String(state.selected.likes);

  // update label directly
  const node = map.querySelector(`[data-id="${state.selected.id}"]`);
  const t = node?.querySelector('.likes-text');
  if(t) t.textContent = `❤ ${state.selected.likes}`;

  saveAndRefresh();
});

function populateForm(it){
  editForm.name.value = it.name||'';
  editForm.dates.value = it.dates||'';
  editForm.story.value = it.story||'';
}

editBtn?.addEventListener('click', ()=>{
  if(!state.selected) return;
  populateForm(state.selected);
  editForm.hidden = false;
  detail.style.display = 'none';
});

cancelEdit?.addEventListener('click', ()=>{
  editForm.hidden = true;
  detail.style.display = 'block';
});

editForm?.addEventListener('submit', (e)=>{
  e.preventDefault();
  const fd = new FormData(editForm);
  const name = String(fd.get('name')||'').trim();
  if(!name) return alert('Le nom est requis.');
  const dates = String(fd.get('dates')||'').trim();
  const story = String(fd.get('story')||'').trim();

  const idx = state.items.findIndex(x=>x.id===state.selected.id);
  if(idx>=0){
    state.items[idx] = {...state.items[idx], name, dates, story};
    state.selected = state.items[idx];
    saveAndRefresh();
    showDetail(state.selected);
  }
});

deleteBtn?.addEventListener('click', ()=>{
  if(!state.selected) return;
  if(!confirm('Supprimer cette tombe ?')) return;
  state.items = state.items.filter(x=>x.id!==state.selected.id);
  state.selected = null;
  saveAndRefresh();
  panel.style.display='none';
  panel.setAttribute('aria-hidden','true');
});

// --- Search ---
function clearSuggestions(){
  while(suggestions.firstChild) suggestions.removeChild(suggestions.firstChild);
  suggestions.style.display = 'none';
}
search?.addEventListener('input', (e)=>{
  const q = String(e.target.value||'').trim().toLowerCase();

  // Any search cancels selection and closes info
  panel.style.display='none';
  panel.setAttribute('aria-hidden','true');
  closeModalSmall();
  clearSelection();

  clearSuggestions();
  if(!q) return;

  const matches = state.items.filter(it => it.name.toLowerCase().includes(q));
  if(matches.length === 0) return;

  suggestions.style.display = 'block';
  matches.slice(0,10).forEach(it=>{
    const b = document.createElement('button');
    b.type='button';
    b.className='suggestion';
    b.setAttribute('role','option');
    b.textContent = `${it.name}${it.dates?(' — '+it.dates):''}`;

    b.addEventListener('mouseenter', ()=> setSearchHover(it.id));
    b.addEventListener('mouseleave', ()=> setSearchHover(null));
    b.addEventListener('click', ()=>{
      search.value = it.name;
      clearSuggestions();
      setSearchHover(null);
      selectItem(it.id);
    });

    suggestions.appendChild(b);
  });
});

document.addEventListener('click', (ev)=>{
  if(!suggestions.contains(ev.target) && ev.target !== search){
    clearSuggestions();
    setSearchHover(null);
  }
});
search?.addEventListener('keydown', (ev)=>{
  if(ev.key === 'Escape'){ clearSuggestions(); setSearchHover(null); search.blur(); }
});

// --- Add new tomb ---
newBtn?.addEventListener('click', ()=>{
  const newItem = {id: genId(), name:"Nom inconnu", dates:"", story:"", likes:0};
  state.items.push(newItem);
  saveAndRefresh();
  selectItem(newItem.id);
  if(isAdmin) editBtn?.click();
});

function saveAndRefresh(){
  saveData(state.items);
  render();
}

// --- Recenter ---
function scrollCanvasToWorldPoint(wx, wy){
  if(!canvasWrap || !world) return;
  const scale = getZoomScale();
  const vb = map.getAttribute('viewBox').split(' ').map(Number);
  const vbW = vb[2], vbH = vb[3];

  const worldRect = world.getBoundingClientRect();
  const unscaledW = worldRect.width / scale;
  const unscaledH = worldRect.height / scale;

  const px = (wx / vbW) * unscaledW;
  const py = (wy / vbH) * unscaledH;

  canvasWrap.scrollTo({
    left: Math.max(0, px*scale - canvasWrap.clientWidth/2),
    top:  Math.max(0, py*scale - canvasWrap.clientHeight/2),
    behavior:'smooth'
  });
}

recenterBtn?.addEventListener('click', ()=>{
  const selId = state.selected?.id;
  if(selId){
    const node = map.querySelector(`[data-id="${selId}"]`);
    if(node){
      try{
        const box = node.getBBox();
        scrollCanvasToWorldPoint(box.x + box.width/2, box.y + box.height/2);
        return;
      }catch(_){}
    }
  }
  canvasWrap?.scrollTo({left:0, top:0, behavior:'smooth'});
});

// --- Utils ---
function escapeHtml(s=''){
  return (''+s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

window.addEventListener('resize', ()=>{ render(); applyZoom(); updateZoomBounds(); });
window.addEventListener('orientationchange', ()=>{ setTimeout(()=>{ render(); applyZoom(); updateZoomBounds(); }, 50); });

// Initial render
render();
applyZoom();
updateZoomBounds();
