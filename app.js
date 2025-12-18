/* 
  Simple virtual cemetery:
  - Tombs placed along a curved path
  - Click a tomb to open side panel (or modal on small screens)
  - Search jumps/zooms to tomb
  - Like counts & editable details saved to localStorage
*/

const STORAGE_KEY = 'virtual-cemetery-v1';

const sampleDeceased = [
  {first:"Marie", last:"Dupont", description:"Aimait le jardinage et les roses.", dateOfDeath:"2018-04-12", likes:3},
  {first:"Ahmed", last:"Khalil", description:"Ancien instituteur apprécié.", dateOfDeath:"2005-09-01", likes:1},
  {first:"Lucien", last:"Martin", description:"Passionné de mécanique.", dateOfDeath:"1999-11-20", likes:2},
  {first:"Sofia", last:"Moreau", description:"Jeune artiste peintre.", dateOfDeath:"2016-02-14", likes:5},
  {first:"Claire", last:"Bernard", description:"Professeure de musique.", dateOfDeath:"2012-07-08", likes:0},
  {first:"Thomas", last:"Leroy", description:"Militant local.", dateOfDeath:"2008-01-30", likes:4},
  {first:"Isabelle", last:"Roux", description:"Bibliothécaire, grande lectrice.", dateOfDeath:"2020-10-03", likes:2},
  {first:"Jean", last:"Petit", description:"A vécu une vie paisible.", dateOfDeath:"1995-06-17", likes:6},
  {first:"Pierre", last:"Fabre", description:"Passionné de voyages.", dateOfDeath:"2010-12-25", likes:1},
  {first:"Lucie", last:"Garnier", description:"Médecin dévouée.", dateOfDeath:"2014-03-19", likes:3},
  {first:"Paul", last:"Renaud", description:"Artisan local respecté.", dateOfDeath:"2001-08-04", likes:0},
  {first:"Anna", last:"Girard", description:"Amoureuse de la mer.", dateOfDeath:"2019-05-22", likes:2},
  {first:"Marc", last:"Brousse", description:"Aidé toute la communauté.", dateOfDeath:"1998-09-09", likes:1},
  {first:"Julie", last:"Perrin", description:"Poète et rêveuse.", dateOfDeath:"2017-11-11", likes:4},
  {first:"Hugo", last:"Leclerc", description:"Mécanicien habile.", dateOfDeath:"2003-02-27", likes:0},
  {first:"Emma", last:"Marchal", description:"Aimait la musique de chambre.", dateOfDeath:"2015-06-30", likes:2},
  {first:"Louis", last:"Barbe", description:"Cultivateur de légumes anciens.", dateOfDeath:"1992-04-05", likes:1},
  {first:"Alice", last:"Fontaine", description:"Engagée pour les enfants.", dateOfDeath:"2007-10-16", likes:3},
  {first:"Nathalie", last:"Dumas", description:"Photographe amateure.", dateOfDeath:"2013-01-02", likes:2},
  {first:"Olivier", last:"Caron", description:"Amateur d'astronomie.", dateOfDeath:"2000-07-21", likes:0}
];

function getDefaultData(count = 100){
  // Build default data directly from sampleDeceased (one tomb per person in the array)
  return sampleDeceased.map(s => {
    const name = `${s.first} ${s.last}`;
    const dates = s.dateOfDeath || '';
    const story = s.description || '';
    const likes = typeof s.likes === 'number' ? s.likes : Math.floor(Math.random()*5);
    return { id: genId(), name, dates, story, likes };
  });
}

const defaultData = getDefaultData();

function genId(){ return 't'+Math.random().toString(36).slice(2,9) }

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultData;
    return JSON.parse(raw);
  }catch(e){ return defaultData }
}
function saveData(d){ localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) }

const state = {
  items: loadData(),
  selected: null
};

const map = document.getElementById('map');
const search = document.getElementById('search');
const suggestions = document.getElementById('suggestions');
const newBtn = document.getElementById('newBtn');
const panel = document.getElementById('panel');
const closePanel = document.getElementById('closePanel');
const detail = document.getElementById('detail');
const likeBtn = document.getElementById('likeBtn');
const likesCount = document.getElementById('likesCount');
const editBtn = document.getElementById('editBtn');
const deleteBtn = document.getElementById('deleteBtn');
const editForm = document.getElementById('editForm');
const cancelEdit = document.getElementById('cancelEdit');
const countEl = document.getElementById('count');

// detect admin flag in URL (?admin)
const isAdmin = location.search.includes('admin');

// show or hide edit/delete UI based on admin flag
if(editBtn) editBtn.style.display = isAdmin ? '' : 'none';
if(deleteBtn) deleteBtn.style.display = isAdmin ? '' : 'none';

window.addEventListener('resize', render);

// Build multiple gentle S-shaped paths stacked vertically to spread many tombs
function buildPaths(w=1000,h=600, rows=1){
  const paths = [];
  const marginY = 8; // much smaller margin so rows sit closer top/bottom
  const usableH = h - marginY*2;
  for(let r=0;r<rows;r++){
    const rowProgress = rows === 1 ? 0.5 : r/(rows-1);
    // reduce wobble amplitude so rows are flatter and closer
    const wobble = Math.sin(rowProgress * Math.PI * 2) * 3;
    const baseY = marginY + rowProgress * usableH;
    const rowTop = baseY + wobble;
    // smaller horizontal offset
    const hOffset = (r - (rows-1)/2) * 4;
    // greatly reduced vertical staggering so rows are much nearer each other
    const verticalShift = (r - (rows-1)/2) * 2;
    const amp = (1 + (r - (rows-1)/2) * 0.03) * 1;
    const points = [
      [80 + hOffset, rowTop + verticalShift + 20 * amp + (r%2? -2:2)],
      [200 + hOffset*0.8, rowTop + verticalShift - 6 * amp + (r%3? 2:-2)],
      [400 + hOffset*0.4, rowTop + verticalShift + 6 * amp + (r%2? 1:-1)],
      [600 + hOffset*0.2, rowTop + verticalShift - 4 * amp + (r%4? -2:2)],
      [820 - hOffset*0.2, rowTop + verticalShift + 5 * amp + (r%3? 1:-1)],
      [940 - hOffset, rowTop + verticalShift - 8 * amp + (r%2? 2:-2)]
    ];
    paths.push(points);
  }
  return paths;
}

function pathToD(points){
  if(points.length<2) return '';
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for(let i=1;i<points.length;i++){
    const p = points[i];
    const prev = points[i-1];
    const cx = (prev[0]+p[0])/2;
    d += ` Q ${prev[0]} ${prev[1]} ${cx} ${(prev[1]+p[1])/2}`;
  }
  d += ` T ${points[points.length-1][0]} ${points[points.length-1][1]}`;
  return d;
}

function placeTombsOnPath(items, points, w=1000){
  // place items evenly along path length proportional to index
  const positions = [];
  const total = items.length;
  if(total===0) return positions;
  // map t from 0.06..0.94 to avoid edges and cluster less on ends
  for(let i=0;i<total;i++){
    const t = 0.06 + (i/(Math.max(1,total-1))) * 0.88;
    const pos = sampleBezierPath(points, t);
    positions.push(Object.assign({}, items[i], {x: pos.x, y: pos.y}));
  }
  return positions;
}

// Sample cubic-like smooth curve by linear interpolation of bezier-ish points
function sampleBezierPath(points, t){
  // Simple Catmull-Rom like interpolation
  const n = points.length;
  const totalT = t*(n-1);
  const i = Math.floor(totalT);
  const localT = totalT - i;
  const p0 = points[Math.max(0, i-1)];
  const p1 = points[i];
  const p2 = points[Math.min(n-1, i+1)];
  const p3 = points[Math.min(n-1, i+2)];
  const x = catmullRom(localT, p0[0], p1[0], p2[0], p3[0]);
  const y = catmullRom(localT, p0[1], p1[1], p2[1], p3[1]);
  return {x,y};
}
function catmullRom(t,v0,v1,v2,v3){
  const t2 = t*t, t3 = t2*t;
  return 0.5*( (2*v1) + (-v0+v2)*t + (2*v0-5*v1+4*v2-v3)*t2 + (-v0+3*v1-3*v2+v3)*t3 );
}

function render(){
  // Clear
  while(map.firstChild) map.removeChild(map.firstChild);

  const vb = map.getAttribute('viewBox').split(' ').map(Number);
  const w = vb[2], h = vb[3];

  // ensure SVG has its own styles so external CSS doesn't need to apply
  const existingStyle = map.querySelector('style[data-inline-svg]');
  if(!existingStyle){
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg','style');
    styleEl.setAttribute('type','text/css');
    styleEl.setAttribute('data-inline-svg','true');
    styleEl.textContent = `
      .tomb{ cursor:pointer; transition: transform .12s; }
      .stone{ fill: ${getComputedStyle(document.documentElement).getPropertyValue('--stone') || '#d9d9d9'}; stroke:#bfbfbf; stroke-width:2 }
      .plate{ fill:#524c48; color:#fff; font-size:14px; font-weight:600 }
      .pathLine{ fill:none; stroke:#cfc9be; stroke-width:8; stroke-linecap:round; stroke-linejoin:round }
      .search-highlight{ stroke:#ffb74d; stroke-width:4; fill: ${getComputedStyle(document.documentElement).getPropertyValue('--stone') || '#d9d9d9'} }
      .like-burst{ fill:#ffb74d; opacity:0.9 }
      .tomb-text{ pointer-events:none; font-size:10px; fill:#fff; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; text-anchor:middle; dominant-baseline:central }
      .likes-text{ font-size:11px; fill:#6b5a50; text-anchor:middle; dominant-baseline:middle; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; }
    `;
    map.appendChild(styleEl);
  }

  // update tomb count display
  if(countEl) countEl.textContent = `${state.items.length} ${state.items.length>1 ? 'tombes' : 'tombe'}`;

  // determine number of path rows based on item count (aim ~10-18 tombs per path)
  const perPath = 15;
  const rows = Math.min(6, Math.max(1, Math.ceil(state.items.length / perPath)));
  const paths = buildPaths(w,h,rows);

  // Draw each path and place a portion of tombs on it
  let startIdx = 0;
  paths.forEach((points, rowIdx) => {
    const remaining = state.items.length - startIdx;
    const take = Math.ceil(remaining / (paths.length - rowIdx)); // distribute remaining evenly
    const slice = state.items.slice(startIdx, startIdx + take);
    startIdx += take;

    const pathD = pathToD(points);
    const pathEl = el('path',{d: pathD, class:'pathLine'});
    map.appendChild(pathEl);

    const placed = placeTombsOnPath(slice, points, w);
    placed.forEach((it, localIdx) => {
      const idx = state.items.findIndex(x=>x.id===it.id);

      // Instead of translating the whole group, position each SVG primitive with absolute coords
      const g = el('g',{class:'tomb', 'data-id': it.id, 'data-idx': idx});
      // stone and plate coordinates relative to centered tomb width (40)
      const baseX = Math.round(it.x - 20);
      const baseY = Math.round(it.y - 40);

      const stone = el('rect',{x: baseX, y: baseY + 18, width:40, height:36, rx:6, class:'stone'});
      const plate = el('rect',{x: baseX + 6, y: baseY + 2, width:28, height:28, rx:4, class:'plate'});
      const name = el('text',{x: baseX + 20, y: baseY + 20, class:'tomb-text'});
      name.textContent = it.name.split(' ')[0];

      const like = el('text',{x: baseX + 20, y: baseY + 56, class:'likes-text'});
      like.textContent = `❤ ${it.likes||0}`;

      // store base positions for hover adjustments
      g.setAttribute('data-base-x', String(baseX));
      g.setAttribute('data-base-y', String(baseY));
      g.appendChild(stone);
      g.appendChild(plate);
      g.appendChild(name);
      g.appendChild(like);

      // Hover: move the primitive y positions up/down instead of changing group transform
      g.addEventListener('mouseenter', ()=>{
        const bx = Number(g.getAttribute('data-base-x') || 0);
        const by = Number(g.getAttribute('data-base-y') || 0);
        const up = -6;
        stone.setAttribute('y', String(by + 18 + up));
        plate.setAttribute('y', String(by + 2 + up));
        name.setAttribute('y', String(by + 20 + up));
        like.setAttribute('y', String(by + 56 + up));
      });
      g.addEventListener('mouseleave', ()=>{
        const bx = Number(g.getAttribute('data-base-x') || 0);
        const by = Number(g.getAttribute('data-base-y') || 0);
        stone.setAttribute('y', String(by + 18));
        plate.setAttribute('y', String(by + 2));
        name.setAttribute('y', String(by + 20));
        like.setAttribute('y', String(by + 56));
      });

      g.addEventListener('click',(e)=>{ selectItem(it.id, true) });
      map.appendChild(g);
    });
  });
}

function el(name, attrs){
  const e = document.createElementNS('http://www.w3.org/2000/svg', name);
  if(attrs) for(const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// open panel (or modal on small)
function selectItem(id, focus=false){
  const it = state.items.find(x=>x.id===id);
  if(!it) return;
  // remove highlight from previous selection
  if(state.selected && state.selected.id && state.selected.id !== id){
    highlightItem(state.selected.id, false);
  }

  state.selected = it;
  showDetail(it);
  // Highlight the tomb (persist while selected)
  const node = map.querySelector(`[data-id="${id}"]`);
  if(node){
    highlightItem(id, true);
    // on small screens, scroll viewport to center of tomb by adjusting viewBox
    if(window.innerWidth <= 640){
      // make a modal instead of side panel
      openModalForSmall(node);
    }else{
      panel.style.display = 'flex';
      panel.setAttribute('aria-hidden','false');
    }
  }
}

function showDetail(it){
  detail.innerHTML = `
    <h3>${escapeHtml(it.name)}</h3>
    <p><strong>${escapeHtml(it.dates||'')}</strong></p>
    <p>${escapeHtml(it.story||'Pas d\'histoire renseignée.')}</p>
  `;
  likesCount.textContent = (it.likes||0);
  editForm.hidden = true;
  detail.style.display = 'block';
}

likeBtn.addEventListener('click', ()=>{
  if(!state.selected) return;
  state.selected.likes = (state.selected.likes||0)+1;
  likesCount.textContent = state.selected.likes;
  saveAndRefresh();
});

editBtn.addEventListener('click', ()=>{
  if(!state.selected) return;
  populateForm(state.selected);
  editForm.hidden = false;
  detail.style.display = 'none';
});

deleteBtn.addEventListener('click', ()=>{
  if(!state.selected) return;
  if(!confirm('Supprimer cette tombe ?')) return;
  // remove highlight of the to-be-deleted item
  highlightItem(state.selected.id, false);
  state.items = state.items.filter(x=>x.id!==state.selected.id);
  state.selected = null;
  saveAndRefresh();
  panel.style.display = 'none';
});

editForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const fd = new FormData(editForm);
  const name = fd.get('name').trim();
  if(!name) return alert('Le nom est requis.');
  const dates = fd.get('dates').trim();
  const story = fd.get('story').trim();
  const id = state.selected.id;
  const idx = state.items.findIndex(x=>x.id===id);
  state.items[idx] = Object.assign({}, state.items[idx], {name, dates, story});
  state.selected = state.items[idx];
  saveAndRefresh();
  showDetail(state.selected);
});

cancelEdit.addEventListener('click', ()=>{
  editForm.hidden = true;
  detail.style.display = 'block';
});

closePanel.addEventListener('click', ()=>{
  panel.style.display = 'none';
  panel.setAttribute('aria-hidden','true');
  // remove persistent highlight when closing panel
  if(state.selected && state.selected.id) highlightItem(state.selected.id, false);
  // on small close modal
  closeModalSmall();
});

// Show a suggestion list when user types; allow selecting any match
search.addEventListener('input', (e)=>{
  const q = e.target.value.trim().toLowerCase();
  // clear suggestions if empty
  while(suggestions.firstChild) suggestions.removeChild(suggestions.firstChild);
  if(!q){ render(); suggestions.style.display = 'none'; return; }
  // clear any lingering search highlights so only current matches get highlighted
  clearSearchHighlights();
  const matches = state.items.filter(it => it.name.toLowerCase().includes(q));
  if(matches.length === 0){ suggestions.style.display = 'none'; return; }
  suggestions.style.display = 'block';
  matches.slice(0, 10).forEach((it, idx) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'suggestion';
    el.setAttribute('role','option');
    el.textContent = `${it.name} ${it.dates?(' — '+it.dates):''}`;

    // Highlight tomb on hover and restore on leave
    el.addEventListener('mouseenter', () => {
      // make this highlight exclusive to this suggestion
      clearSearchHighlights();
      const node = map.querySelector(`[data-id="${it.id}"]`);
      if(node){
        const stone = node.querySelector('.stone');
        stone?.classList.add('search-highlight');
        // bring tomb group to front so highlight is visible
        map.appendChild(node);
      }
    });
    el.addEventListener('mouseleave', () => {
      // remove any temporary search highlight when leaving suggestion
      clearSearchHighlights();
    });

    el.addEventListener('click', () => {
      search.value = it.name;
      while(suggestions.firstChild) suggestions.removeChild(suggestions.firstChild);
      suggestions.style.display = 'none';
      clearSearchHighlights();
      selectItem(it.id, true);
    });
    suggestions.appendChild(el);
  });
});

// close suggestions on outside click or Escape
document.addEventListener('click', (ev)=>{
  if(!suggestions.contains(ev.target) && ev.target !== search){
    suggestions.style.display = 'none';
    clearSearchHighlights();
  }
});
search.addEventListener('keydown', (ev)=>{
  if(ev.key === 'Escape') { suggestions.style.display = 'none'; search.blur(); }
});

newBtn.addEventListener('click', ()=>{
  const newItem = {id: genId(), name: "Nom inconnu", dates:"", story:"", likes:0};
  state.items.push(newItem);
  saveAndRefresh();
  selectItem(newItem.id);
  editBtn.click();
});

function populateForm(it){
  editForm.name.value = it.name||'';
  editForm.dates.value = it.dates||'';
  editForm.story.value = it.story||'';
}

// Save and redraw while preserving selection by id
function saveAndRefresh(){
  saveData(state.items);
  const selId = state.selected?.id;
  render();
  if(selId){
    // If item still exists after save, re-select (which reapplies highlight)
    const exists = state.items.find(x=>x.id===selId);
    if(exists) selectItem(selId);
  }
}

function escapeHtml(s=''){ return (''+s).replace(/[&<>\"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;' }[c])) }

// add helper to toggle persistent highlight
function highlightItem(id, on){
  const node = map.querySelector(`[data-id="${id}"]`);
  if(!node) return;
  const stone = node.querySelector('.stone');
  if(on){
    stone?.classList.add('search-highlight');
    // bring group forward
    map.appendChild(node);
  }else{
    stone?.classList.remove('search-highlight');
  }
}

// clear all transient search highlights from the map (keeps persistent selection highlights handled elsewhere)
function clearSearchHighlights(){
  const stones = map.querySelectorAll('.stone.search-highlight');
  stones.forEach(s => s.classList.remove('search-highlight'));
}

// --- Modal behavior for small screens ---
let smallModal = null;
function openModalForSmall(node){
  // create overlay modal if not exists
  if(document.getElementById('mobileModal')) closeModalSmall();
  const rect = map.getBoundingClientRect();
  const svgRect = node.getBoundingClientRect();
  // show a simple full-screen modal with same content as panel
  smallModal = document.createElement('div');
  smallModal.id = 'mobileModal';
  smallModal.style.position='fixed';
  smallModal.style.left=0;smallModal.style.top=0;smallModal.style.right=0;smallModal.style.bottom=0;
  smallModal.style.background='rgba(0,0,0,0.3)';
  smallModal.style.display='flex';smallModal.style.alignItems='flex-end';

  // include mobile edit button only for admin
  const mobileEditHtml = isAdmin ? `<button id="mobileEdit">Éditer</button>` : '';

  smallModal.innerHTML = `
    <div style="background:white;border-radius:12px 12px 0 0;padding:12px;width:100%;max-height:66vh;overflow:auto;">
      <button id="mobileClose" style="float:right;border:none;background:transparent;font-size:18px">✕</button>
      <div id="mobileDetail">${detail.innerHTML}</div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="mobileLike">👍 ${(state.selected?.likes||0)}</button>
        ${mobileEditHtml}
      </div>
    </div>
  `;
  document.body.appendChild(smallModal);
  document.getElementById('mobileClose').addEventListener('click', closeModalSmall);
  document.getElementById('mobileLike').addEventListener('click', ()=>{
    likeBtn.click();
    document.getElementById('mobileLike').textContent = `👍 ${(state.selected?.likes||0)}`;
  });

  if(isAdmin){
    const me = document.getElementById('mobileEdit');
    if(me){
      me.addEventListener('click', ()=>{
        closeModalSmall();
        panel.style.display='flex';
        panel.setAttribute('aria-hidden','false');
        editBtn.click();
      });
    }
  }
}

function closeModalSmall(){
  const m = document.getElementById('mobileModal');
  if(m) m.remove();
  // remove persistent highlight when closing mobile modal
  if(state.selected && state.selected.id) highlightItem(state.selected.id, false);
}

// initial render
render();