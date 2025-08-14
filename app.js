
// PWA (browser-only) build of 4-deck DJ.
// No backend required. Optional YouTube metadata panel if BACKEND_ORIGIN is set.

const CONFIG = {
  BACKEND_ORIGIN: '' // e.g., 'http://localhost:5173'. Leave empty to hide YT panel.
};

const ctx = new (window.AudioContext || window.webkitAudioContext)();
const masterGain = ctx.createGain();
masterGain.gain.value = 1;
const masterAnalyser = ctx.createAnalyser();
masterAnalyser.fftSize = 2048;
masterGain.connect(masterAnalyser);
masterGain.connect(ctx.destination);

// Cue bus (PFL)
const cueGain = ctx.createGain(); cueGain.gain.value = 0.0;
const cueAnalyser = ctx.createAnalyser(); cueAnalyser.fftSize = 2048;
cueGain.connect(cueAnalyser);
cueGain.connect(ctx.destination);

function $(sel){ return document.querySelector(sel); }
function el(tag, attrs={}, children=[]){
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if(k==='class') e.className=v; else if(k==='html') e.innerHTML=v;
    else e.setAttribute(k,v);
  });
  (Array.isArray(children)?children:[children]).filter(Boolean).forEach(c=>e.append(c));
  return e;
}
function timeFmt(sec){
  if(!isFinite(sec)) return '--:--';
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s/60), r = s%60;
  return `${m}:${r.toString().padStart(2,'0')}`;
}

class Deck {
  constructor(id, label){
    this.id = id; this.label = label;
    this.container = document.getElementById(id);
    this.buffer = null; this.source=null; this.playing=false;
    this.startTime=0; this.offset=0; this.playbackRate=1;
    this.cuePoint=0; this.hotCues=[null,null,null,null];
    this.loopIn=null; this.loopOut=null; this.loopOn=false; this.bpm=null;

    // Audio nodes
    this.channelGain = ctx.createGain(); this.channelGain.gain.value=1;
    this.eqLow = ctx.createBiquadFilter(); this.eqLow.type='lowshelf'; this.eqLow.frequency.value=320;
    this.eqMid = ctx.createBiquadFilter(); this.eqMid.type='peaking'; this.eqMid.frequency.value=1200; this.eqMid.Q.value=0.7;
    this.eqHigh = ctx.createBiquadFilter(); this.eqHigh.type='highshelf'; this.eqHigh.frequency.value=8000;
    this.filter = ctx.createBiquadFilter(); this.filter.type='lowpass'; this.filter.frequency.value=22050;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize=2048;
    this.eqLow.connect(this.eqMid); this.eqMid.connect(this.eqHigh); this.eqHigh.connect(this.filter);
    this.filter.connect(this.channelGain); this.channelGain.connect(this.analyser);

    this.toMaster = ctx.createGain(); this.toMaster.gain.value = 1;
    this.toCue = ctx.createGain(); this.toCue.gain.value = 0;
    this.analyser.connect(this.toMaster); this.analyser.connect(this.toCue);
    this.toMaster.connect(masterGain); this.toCue.connect(cueGain);

    this.buildUI(); this.drawScope();
  }

  buildUI(){
    this.container.innerHTML='';
    this.container.append(
      el('div',{class:'title'},[ el('span',{html:`Deck <strong>${this.label}</strong>`}), el('span',{class:'badge',html:'Local files only'}) ]),
      el('div',{class:'scope',id:`scope-${this.id}`}),
      el('div',{class:'grid cols-2'},[
        this.fileInput = el('input',{type:'file',accept:'audio/*',id:`file-${this.id}`}),
        el('label',{for:`file-${this.id}`,class:'file-label'},'Load File'),
        el('div',{class:'inline'},[
          el('button',{class:'btn small',id:`play-${this.id}`},'Play/Pause'),
          el('button',{class:'btn small',id:`stop-${this.id}`},'Stop'),
          el('button',{class:'btn small',id:`cue-${this.id}`},'Cue'),
          el('button',{class:'btn small',id:`setcue-${this.id}`},'Set Cue'),
        ]),
      ]),
      el('div',{class:'grid cols-4'},[
        el('button',{class:'btn small',id:`hc1-${this.id}`},'Hot 1'),
        el('button',{class:'btn small',id:`hc2-${this.id}`},'Hot 2'),
        el('button',{class:'btn small',id:`hc3-${this.id}`},'Hot 3'),
        el('button',{class:'btn small',id:`hc4-${this.id}`},'Hot 4'),
      ]),
      el('div',{class:'grid cols-3'},[
        el('div',[ el('label',{},'Tempo (Pitch)'), this.pitch = el('input',{type:'range',min:'0.5',max:'1.5',step:'0.001',value:'1'}) ]),
        el('div',[ el('label',{},'Nudge'), el('div',{class:'inline'},[ el('button',{class:'btn small',id:`nudge--${this.id}`},'−'), el('button',{class:'btn small',id:`nudge+-${this.id}`},'+'), ]) ]),
        el('div',[ el('label',{},'Pitch Bend'), el('div',{class:'inline'},[ el('button',{class:'btn small',id:`bend--${this.id}`},'← hold'), el('button',{class:'btn small',id:`bend+-${this.id}`},'hold →'), ]) ]),
      ]),
      el('div',{class:'grid cols-3'},[
        el('div',[ el('label',{},'EQ Low'), this.eqLowCtl = el('input',{type:'range',min:'-24',max:'+6',step:'0.1',value:'0'}) ]),
        el('div',[ el('label',{},'EQ Mid'), this.eqMidCtl = el('input',{type:'range',min:'-24',max:'+6',step:'0.1',value:'0'}) ]),
        el('div',[ el('label',{},'EQ High'), this.eqHighCtl = el('input',{type:'range',min:'-24',max:'+6',step:'0.1',value:'0'}) ]),
      ]),
      el('div',[ el('label',{},'Filter (LPF <—> HPF)'), this.filterCtl = el('input',{type:'range',min:'-1',max:'1',step:'0.001',value:'0'}) ]),
      el('div',{class:'grid cols-3'},[
        el('div',[ el('label',{},'Gain'), this.gainCtl = el('input',{type:'range',min:'0',max:'2',step:'0.01',value:'1'}) ]),
        el('div',[ el('label',{},'Channel Fader'), this.faderCtl = el('input',{type:'range',min:'0',max:'1.5',step:'0.01',value:'1'}) ]),
      ]),
      el('div',{class:'grid cols-2'},[
        el('div',[ el('label',{},'Assign to Crossfader Side'), this.sideSel = el('select',{},[ el('option',{value:'L'},'Left (A)'), el('option',{value:'R'},'Right (B)'), ]) ]),
        el('div',[ el('label',{},'Cue (PFL)'), this.cueSel = el('input',{type:'checkbox'}) ]),
      ]),
      el('div',{class:'jog',id:`jog-${this.id}`}, [el('div',{class:'dot'})]),
      el('div',{class:'inline'},[
        el('span',{class:'badge',id:`pos-${this.id}`},'0:00'),
        el('span',{class:'badge',id:`len-${this.id}`},'/ 0:00'),
        el('span',{class:'badge',id:`bpm-${this.id}`},'BPM: --'),
        el('button',{class:'btn small',id:`analyze-${this.id}`},'Analyze BPM')
      ]),
    );

    this.fileInput.addEventListener('change', e=>this.loadFile(e.target.files[0]));
    $('#play-'+this.id).addEventListener('click', ()=>this.toggle());
    $('#stop-'+this.id).addEventListener('click', ()=>this.stop());
    $('#cue-'+this.id).addEventListener('click', ()=>this.jump(this.cuePoint));
    $('#setcue-'+this.id).addEventListener('mousedown', ()=>this.setCue());
    $('#setcue-'+this.id).addEventListener('contextmenu', (e)=>{ e.preventDefault(); this.cuePoint=0; });

    ['1','2','3','4'].forEach(n=>{
      $('#hc'+n+'-'+this.id).addEventListener('click', ()=>{
        const idx = parseInt(n)-1;
        const p = this.hotCues[idx];
        if(p==null){ this.hotCues[idx] = this.getPos(); } else { this.jump(p); }
      });
      $('#hc'+n+'-'+this.id).addEventListener('contextmenu', (e)=>{ e.preventDefault(); this.hotCues[parseInt(n)-1]=null; });
    });

    this.pitch.addEventListener('input', ()=> this.setRate(parseFloat(this.pitch.value)));
    $('#nudge--'+this.id).addEventListener('click', ()=>this.seekRel(-0.05));
    $('#nudge+-'+this.id).addEventListener('click', ()=>this.seekRel(0.05));

    const bendMinus = $('#bend--'+this.id);
    const bendPlus = $('#bend+-'+this.id);
    let bendTimer=null;
    bendMinus.addEventListener('mousedown', ()=>{ this.bend(-0.06); bendTimer=setInterval(()=>this.bend(-0.06),50); });
    bendPlus.addEventListener('mousedown', ()=>{ this.bend(+0.06); bendTimer=setInterval(()=>this.bend(+0.06),50); });
    ['mouseup','mouseleave','touchend'].forEach(ev=>{
      bendMinus.addEventListener(ev, ()=>{ clearInterval(bendTimer); this.setRate(parseFloat(this.pitch.value)); });
      bendPlus.addEventListener(ev, ()=>{ clearInterval(bendTimer); this.setRate(parseFloat(this.pitch.value)); });
    });

    this.eqLowCtl.addEventListener('input', ()=> this.eqLow.gain.value = parseFloat(this.eqLowCtl.value));
    this.eqMidCtl.addEventListener('input', ()=> this.eqMid.gain.value = parseFloat(this.eqMidCtl.value));
    this.eqHighCtl.addEventListener('input', ()=> this.eqHigh.gain.value = parseFloat(this.eqHighCtl.value));
    this.filterCtl.addEventListener('input', ()=> this.setFilter(parseFloat(this.filterCtl.value)));
    this.gainCtl.addEventListener('input', ()=> this.channelGain.gain.value = parseFloat(this.gainCtl.value));
    this.faderCtl.addEventListener('input', ()=> this.updateRouting());
    this.sideSel.addEventListener('change', ()=> this.updateRouting());
    this.cueSel.addEventListener('change', ()=> this.updateRouting());

    $('#lin-'+this.id)?.remove();
    $('#lout-'+this.id)?.remove();
    $('#lto-'+this.id)?.remove();
    // Add loop buttons again properly:
    const grp = this.container.querySelector('.grid.cols-3');
    const loopWrap = document.createElement('div');
    loopWrap.innerHTML = `
      <div><label>Loop In/Out</label>
        <div class="inline">
          <button class="btn small" id="lin-${this.id}">In</button>
          <button class="btn small" id="lout-${this.id}">Out</button>
          <button class="btn small" id="lto-${this.id}">Loop: Off</button>
        </div>
      </div>`;
    grp.prepend(loopWrap.firstElementChild);
    document.getElementById(`lin-${this.id}`).addEventListener('click', ()=> this.loopIn = this.getPos());
    document.getElementById(`lout-${this.id}`).addEventListener('click', ()=> this.loopOut = this.getPos());
    document.getElementById(`lto-${this.id}`).addEventListener('click', ()=>{ this.loopOn = !this.loopOn; this.updateLoopBtn(); });
    this.loopInterval = setInterval(()=> this.checkLoop(), 25);

    const jog = $('#jog-'+this.id);
    let lastX = null;
    jog.addEventListener('mousedown', e=>{ lastX = e.clientX; e.preventDefault(); });
    window.addEventListener('mousemove', e=>{
      if(lastX!=null){ const dx = e.clientX - lastX; lastX = e.clientX; this.seekRel(dx * 0.002); }
    });
    window.addEventListener('mouseup', ()=>{ lastX=null; });
    jog.addEventListener('touchstart', e=>{ lastX = e.touches[0].clientX; }, {passive:true});
    jog.addEventListener('touchmove', e=>{
      const x = e.touches[0].clientX; const dx = x - lastX; lastX = x; this.seekRel(dx*0.002);
    }, {passive:true});
    jog.addEventListener('touchend', ()=>{ lastX=null; });

    $('#analyze-'+this.id).addEventListener('click', ()=> this.estimateBPM());
  }

  connectInput(startAt=0){
    if(!this.buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.playbackRate;
    src.connect(this.eqLow);
    this.source = src;
    this.startTime = ctx.currentTime;
    this.offset = startAt;
    src.start(0, startAt);
  }

  toggle(){ if(!this.buffer) return; if(!this.playing){ this.play(); } else { this.pause(); } }
  play(){ if(this.playing || !this.buffer) return; this.connectInput(this.offset); this.playing = true; }
  pause(){ if(!this.playing) return; try{ this.source.stop(); }catch{} this.offset = this.getPos(); this.playing = false; }
  stop(){ if(this.playing){ try{ this.source.stop(); }catch{} } this.offset=0; this.playing=false; }

  jump(sec){
    if(!this.buffer) return;
    const clamped = Math.max(0, Math.min(sec, this.buffer.duration-0.05));
    if(this.playing){ try{ this.source.stop(); }catch{} this.connectInput(clamped); }
    this.offset = clamped;
  }
  seekRel(ds){ this.jump(this.getPos()+ds); }
  bend(amount){ const newRate = parseFloat(this.pitch.value) + amount; if(this.source) this.source.playbackRate.value = Math.max(0.5, Math.min(1.5, newRate)); }
  setRate(r){ this.playbackRate = r; if(this.source) this.source.playbackRate.value = this.playbackRate; }

  setFilter(v){
    const abs = Math.abs(v);
    if(v > 0){ this.filter.type='lowpass'; const f=22050*Math.pow(0.05,v); this.filter.frequency.value=Math.max(500,f); this.filter.Q.value=0.7+4*v; }
    else if(v < 0){ this.filter.type='highpass'; const f=20*Math.pow(50,-v); this.filter.frequency.value=Math.min(1200,f); this.filter.Q.value=0.7+4*abs; }
    else { this.filter.frequency.value=22050; this.filter.Q.value=0.7; this.filter.type='lowpass'; }
  }

  updateRouting(){
    const f = parseFloat(this.faderCtl.value);
    this.toMaster.gain.value = f;
    this.toCue.gain.value = this.cueSel.checked ? 1.0 : 0.0;
  }

  getPos(){ if(!this.buffer) return 0; if(!this.playing) return this.offset; const elapsed=(ctx.currentTime-this.startTime)*this.playbackRate; return this.offset+elapsed; }
  updateLoopBtn(){ const b=document.getElementById(`lto-${this.id}`); if(!b) return; b.textContent=`Loop: ${this.loopOn?'On':'Off'}`; b.classList.toggle('success', this.loopOn); }
  checkLoop(){ if(!this.playing || !this.loopOn || this.loopIn==null || this.loopOut==null || !this.buffer) return; const p=this.getPos(); if(p>=this.loopOut){ this.jump(this.loopIn); } }

  async loadFile(file){ if(!file) return; const arr = await file.arrayBuffer(); const buf = await ctx.decodeAudioData(arr); this.buffer=buf; document.getElementById('len-'+this.id).textContent='/ '+timeFmt(buf.duration); this.estimateBPM(); }
  setCue(){ this.cuePoint=this.getPos(); }

  drawScope(){
    const canvas = document.getElementById('scope-'+this.id);
    const c2d = canvas.getContext('2d');
    const data = new Uint8Array(this.analyser.fftSize);
    const draw = ()=>{
      requestAnimationFrame(draw);
      this.analyser.getByteTimeDomainData(data);
      c2d.fillStyle='#0b0f18'; c2d.fillRect(0,0,canvas.width,canvas.height);
      c2d.strokeStyle='#00d1ff'; c2d.beginPath();
      const step = canvas.width / data.length;
      for(let i=0;i<data.length;i++){ const v=(data[i]-128)/128; const y=canvas.height/2 + v*canvas.height*0.4; const x=i*step; if(i===0) c2d.moveTo(x,y); else c2d.lineTo(x,y); }
      c2d.stroke();
      document.getElementById('pos-'+this.id).textContent = timeFmt(this.getPos());
    };
    const resize=()=>{ canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; };
    resize(); window.addEventListener('resize', resize); draw();
  }

  async estimateBPM(){
    if(!this.buffer) return;
    const chan = this.buffer.getChannelData(0);
    const sr = this.buffer.sampleRate;
    const step = Math.floor(sr/2000) || 1;
    const samples = new Float32Array(Math.floor(chan.length/step));
    for(let i=0,j=0;i<chan.length;i+=step, j++) samples[j]=chan[i];
    const n=samples.length; const ac=new Float32Array(Math.min(n,2000));
    for(let lag=0; lag<ac.length; lag++){ let sum=0; for(let i=0;i<n-lag;i++) sum+=samples[i]*samples[i+lag]; ac[lag]=sum; }
    let bestLag=null,bestVal=-Infinity; const minLag=Math.floor(2000*60/180); const maxLag=Math.floor(2000*60/70);
    for(let lag=minLag; lag<=Math.min(maxLag,ac.length-1); lag++){ if(ac[lag]>bestVal){ bestVal=ac[lag]; bestLag=lag; } }
    const bpm = bestLag ? Math.round(2000*60/bestLag) : null;
    this.bpm = bpm; document.getElementById('bpm-'+this.id).textContent = 'BPM: ' + (bpm||'--');
  }
}

const decks = { A: new Deck('deckA','A'), B: new Deck('deckB','B'), C: new Deck('deckC','C'), D: new Deck('deckD','D') };

function buildChannelUI(chanId, deckKey){
  const d = decks[deckKey]; const elc = document.getElementById(chanId);
  elc.innerHTML='';
  elc.append(
    el('h3',{},`Ch ${deckKey}`),
    el('div',{class:'vu'}, [el('div',{class:'bar',id:`vu-${deckKey}`})]),
    el('div',[el('label',{},'Gain'), d.gainCtl]),
    el('div',[el('label',{},'EQ High'), d.eqHighCtl]),
    el('div',[el('label',{},'EQ Mid'), d.eqMidCtl]),
    el('div',[el('label',{},'EQ Low'), d.eqLowCtl]),
    el('div',[el('label',{},'Filter'), d.filterCtl]),
    el('div',[el('label',{},'Fader'), d.faderCtl]),
    el('div',[el('label',{},'Cue (PFL)'), d.cueSel]),
    el('div',[el('label',{},'X-Fader Side'), d.sideSel]),
  );
  const analyser = d.analyser; const vu = document.getElementById('vu-'+deckKey);
  const data = new Uint8Array(analyser.fftSize);
  function drawVu(){
    requestAnimationFrame(drawVu);
    analyser.getByteTimeDomainData(data);
    let sum=0; for(let i=0;i<data.length;i++){ const v=(data[i]-128)/128; sum+=v*v; }
    const rms=Math.sqrt(sum/data.length); const pct=Math.min(100, Math.max(0, rms*180));
    vu.style.height = pct + '%';
  }
  drawVu();
}
buildChannelUI('chanA','A'); buildChannelUI('chanB','B'); buildChannelUI('chanC','C'); buildChannelUI('chanD','D');

const crossfader = document.getElementById('crossfader'); const assignLeft=document.getElementById('assignLeft'); const assignRight=document.getElementById('assignRight');
function updateCrossfader(){
  const x = parseFloat(crossfader.value);
  function sideGain(deckKey){
    const d = decks[deckKey]; const side = d.sideSel.value;
    const xf = side === 'L' ? (1 - x) : x;
    const ch = parseFloat(d.faderCtl.value);
    d.toMaster.gain.value = xf * ch;
  }
  ['A','B','C','D'].forEach(sideGain);
}
crossfader.addEventListener('input', updateCrossfader);
assignLeft.addEventListener('change', updateCrossfader);
assignRight.addEventListener('change', updateCrossfader);
updateCrossfader();

document.getElementById('master').addEventListener('input', e=> masterGain.gain.value = parseFloat(e.target.value));
document.getElementById('cueLevel').addEventListener('input', updateCueMix);
document.getElementById('cueMix').addEventListener('input', updateCueMix);
function updateCueMix(){
  const level = parseFloat(document.getElementById('cueLevel').value);
  const mix = parseFloat(document.getElementById('cueMix').value);
  cueGain.gain.value = (1 - mix) * level;
  masterGain.gain.value = mix * parseFloat(document.getElementById('master').value);
}
updateCueMix();

const mVuBar = document.getElementById('masterVu'); const mData = new Uint8Array(masterAnalyser.fftSize);
function drawMasterVu(){
  requestAnimationFrame(drawMasterVu);
  masterAnalyser.getByteTimeDomainData(mData);
  let sum=0; for(let i=0;i<mData.length;i++){ const v=(mData[i]-128)/128; sum+=v*v; }
  const rms=Math.sqrt(sum/mData.length); const pct=Math.min(100, Math.max(0, rms*180)); mVuBar.style.height = pct + '%';
}
drawMasterVu();

// Optional YouTube metadata panel
(function setupYT(){
  if(!CONFIG.BACKEND_ORIGIN){ document.getElementById('ytPanel').classList.add('hidden'); return; }
  document.getElementById('ytPanel').classList.remove('hidden');
  document.getElementById('ytSearch').addEventListener('click', async ()=>{
    const q = document.getElementById('ytQuery').value.trim();
    if(!q) return;
    const url = `${CONFIG.BACKEND_ORIGIN}/api/yt/search?q=${encodeURIComponent(q)}`;
    try{
      const res = await fetch(url); const data = await res.json();
      const box = document.getElementById('ytResults'); box.innerHTML='';
      (data.items||[]).forEach(it=>{
        const a = document.createElement('a'); a.href = it.url; a.target='_blank'; a.textContent = it.title;
        const row = document.createElement('div'); row.className='panel';
        const inner = document.createElement('div'); inner.className='inline'; inner.style.gap='8px';
        const img = document.createElement('img'); img.src=it.thumb; img.width=96; img.height=54;
        const meta = document.createElement('div'); meta.append(a, document.createElement('div'));
        meta.children[1].textContent = it.channel;
        inner.append(img, meta); row.append(inner); box.append(row);
      });
    }catch(err){
      document.getElementById('ytResults').innerHTML = `<div class="warn">Backend error: ${err.message}</div>`;
    }
  });
})();
