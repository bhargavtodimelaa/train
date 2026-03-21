(function(){'use strict';
/* STATE */
let searchTimer=null,countdownInterval=null,arTick=null,arSecs=45,curNum=null,curName=null,lastRefTs=null,searchRes=[];
const BASES=["https://train-api-eight.vercel.app/api","https://sujith.bhargavtodimela4.workers.dev"];
/* FETCH */
async function fetchData(path){
  const hasTimeout=typeof AbortSignal.timeout==='function';
  const mkSig=()=>hasTimeout?AbortSignal.timeout(8000):undefined;
  const first=BASES[Math.random()<.5?0:1],second=BASES.find(b=>b!==first);
  let lastErr;
  for(const base of[first,second]){
    try{
      const r=await fetch(base+path,{signal:mkSig()});
      if(!r.ok)throw new Error('HTTP '+r.status);
      return await parseResp(r);
    }catch(e){
      // only retry network/timeout errors, not JSON parse errors
      if(e instanceof SyntaxError)throw e;
      lastErr=e;
    }
  }
  throw new Error('Both endpoints failed: '+lastErr.message);
}
async function parseResp(r){
  const buf=await r.arrayBuffer();const u8=new Uint8Array(buf);
  let s;
  if(u8.length>5&&u8[0]===0xdb){const l=(u8[1]*16777216)+(u8[2]<<16)+(u8[3]<<8)+u8[4];s=new TextDecoder().decode(u8.slice(5,5+l));}
  else s=new TextDecoder().decode(u8);
  return JSON.parse(s);
}
/* UTILS */
const pad=n=>String(n).padStart(2,'0');
const fmt=ts=>ts?new Date(ts*1000).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}):'—';
const he=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const loader=msg=>`<div class="loader"><div class="spinner"><svg viewBox="22 22 44 44"><circle cx="44" cy="44" r="20.2"/></svg></div>${he(msg)}</div>`;
function toast(msg,type){
  const c={done:'var(--green)',error:'var(--red)',info:'var(--accent)'};
  const el=document.getElementById('toast');
  el.innerHTML=`<span style="color:${c[type]||c.done}">●</span> ${he(msg)}`;
  el.classList.add('show');clearTimeout(toast._t);
  toast._t=setTimeout(()=>el.classList.remove('show'),2600);
}
/* CLOCK */
function tickClock(){
  const el=document.getElementById('istText');if(!el)return;
  try{const d=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
  el.textContent=pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());}catch(e){}
}
tickClock();setInterval(tickClock,1000);
/* SCROLL */
let scrollTop=document.getElementById('scrollTopFab');
window.addEventListener('scroll',()=>{
  document.getElementById('appBar').classList.toggle('elevated',scrollY>4);
  scrollTop.classList.toggle('show',scrollY>400);
},{passive:true});
scrollTop.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
/* AUTO-REFRESH */
function startAR(){stopAR();arSecs=45;updateAR();arTick=setInterval(()=>{arSecs--;updateAR();if(arSecs<=0){arSecs=45;doRefresh(true);}},1000);}
function stopAR(){if(arTick){clearInterval(arTick);arTick=null;}}
function updateAR(){
  const f=document.getElementById('arFill'),l=document.getElementById('arCd');
  if(f)f.style.width=((45-arSecs)/45*100)+'%';
  if(l)l.textContent='Next in '+arSecs+'s';
}
async function doRefresh(silent){
  if(!curNum)return;
  const b=document.getElementById('refreshBtn');
  if(!silent){if(b){b.classList.add('spinning');b.disabled=true;}arSecs=45;updateAR();}
  try{
    // Use prefetch cache if fresh (hover prefetch made it instant)
    const cached=getCachedLive(curNum);
    let d;
    if(cached&&cached.data){
      d=cached.data;prefetchCache.delete(curNum);
      // immediately background-refresh again
      setTimeout(()=>prefetchTrain(curNum,curName),100);
    } else {
      d=await fetchData('/live-status?trainNo='+encodeURIComponent(curNum));
    }
    lastRefTs=new Date();renderLive(d.data,curNum,curName);updateLastRef();
    if(!silent)toast('Refreshed!','done');else toast('Auto-refreshed','info');
  }catch(err){toast('Refresh failed: '+err.message,'error');}
  finally{if(!silent){if(b){b.classList.remove('spinning');b.disabled=false;}}}
}
function updateLastRef(){
  const el=document.getElementById('lastRefTime');
  if(el&&lastRefTs){try{const d=new Date(lastRefTs.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));el.textContent=pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())+' IST';}catch(e){}}
}
/* SEARCH */
const si=document.getElementById('searchInput');
si.addEventListener('input',function(){
  const q=this.value.trim();clearTimeout(searchTimer);
  if(!q){showWelcome();clearSuggest();return;}
  if(q.length<2)return;
  searchTimer=setTimeout(()=>doSearch(q),350);
});
si.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    clearSuggest();
    // only navigate home if we're in search state, not while viewing a live train
    if(!curNum){si.value='';showWelcome();}
    else si.blur();
  }
});
function clearSuggest(){document.getElementById('suggestBox').innerHTML='';}
async function doSearch(q){
  const sr=document.getElementById('searchResults'),lv=document.getElementById('liveView');
  sr.innerHTML=renderSkeleton(3);lv.innerHTML='';
  clearInterval(countdownInterval);stopAR();curNum=null;curName=null;
  document.getElementById('refreshBtn').style.display='none';
  try{
    const d=await fetchData('/search?q='+encodeURIComponent(q));
    const trains=(d&&d.data)?d.data:[];
    searchRes=trains;renderSearch(trains);
  }catch(err){
    sr.innerHTML=`<div class="loader" style="flex-direction:column;align-items:flex-start;gap:6px"><div>Search failed: ${he(err.message)}</div><div style="font-size:11px;opacity:.5">Check your connection</div></div>`;
  }
}
function renderSkeleton(n){
  let h='';
  for(let i=0;i<n;i++)h+=`<div class="skeleton-card"><div class="sk-line" style="width:40%;margin-bottom:10px"></div><div class="sk-line" style="width:65%"></div><div class="sk-line" style="width:30%;margin-top:6px"></div></div>`;
  return h;
}
function renderSearch(trains){
  const sr=document.getElementById('searchResults');
  if(!trains||!trains.length){sr.innerHTML='<div class="loader">No trains found.</div>';return;}
  let h=`<div class="results-hdr">${trains.length} result${trains.length>1?'s':''} found</div>`;
  const savedFavs=getFavs();
  for(let i=0;i<trains.length;i++){
    const t=trains[i];const trainIsFav=savedFavs.some(f=>f.num===String(t.number));
    h+=`<div class="result-card">
      <div class="rnum-badge">${he(t.number)}</div>
      <div class="rinfo">
        <div class="rname">${he(t.name)}</div>
        <div class="rroute"><span class="material-symbols-rounded" style="font-size:13px">location_on</span>${he(t.fromStnCode)} → ${he(t.toStnCode)}</div>
      </div>
      <button class="fav-btn${trainIsFav?' active':''}" data-fav-idx="${i}" title="${trainIsFav?'Remove from favourites':'Add to favourites'}"><span class="material-symbols-rounded" style="font-size:20px">star</span></button>
      <button class="track-btn" data-idx="${i}"><span class="material-symbols-rounded" style="font-size:17px">my_location</span> Track</button>
    </div>`;
  }
  sr.innerHTML=h;
  sr.querySelectorAll('[data-idx]').forEach(btn=>{
    const t=searchRes[+btn.dataset.idx];
    if(t){
      attachPrefetch(btn,String(t.number),t.name);
      btn.addEventListener('click',e=>{
        e.stopPropagation();
        doLive(String(t.number),t.name);saveRecent(String(t.number),t.name);
      });
    }
  });
  sr.querySelectorAll('[data-fav-idx]').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();const t=searchRes[+btn.dataset.favIdx];
      if(!t)return;const num=String(t.number);
      if(isFav(num)){removeFav(num);btn.classList.remove('active');showFavConfirm('Removed from favourites');}
      else{saveFav(num,t.name);btn.classList.add('active');showFavConfirm('★ Added to favourites');}
    });
  });
}
/* RENDER LIVE */
function renderLive(data,trainNo,trainName){
  const lv=document.getElementById('liveView');
  if(!data||!data.route||!data.route.length){lv.innerHTML='<div class="loader">No route data available for this train today.</div>';return;}
  // clear any running countdown from previous render
  if(countdownInterval){clearInterval(countdownInterval);countdownInterval=null;}
  const route=data.route;
  const curCode=data.currentPosition&&data.currentPosition.stationCode;
  let curIdx=-1;for(let i=0;i<route.length;i++){if(route[i].stationCode===curCode){curIdx=i;break;}}
  const delayMins=Math.round((data.delayInSecs||0)/60);
  const isLate=delayMins>1;const isVeryLate=delayMins>30;
  const progress=curIdx>=0?Math.round(curIdx/Math.max(route.length-1,1)*100):0;
  const distOrig=data.currentPosition&&data.currentPosition.distanceFromOriginKm!=null?Number(data.currentPosition.distanceFromOriginKm).toFixed(1):'—';
  const distLast=data.currentPosition&&data.currentPosition.distanceFromLastStationKm!=null?Number(data.currentPosition.distanceFromLastStationKm).toFixed(1):'—';
  const origin=route[0],dest=route[route.length-1];
  const curStn=curIdx>=0?route[curIdx]:null;
  const nextStop=curIdx>=0&&curIdx<route.length-1?route[curIdx+1]:null;
  const lat=data.currentPosition&&data.currentPosition.latLng&&data.currentPosition.latLng.latitude;
  const lng=data.currentPosition&&data.currentPosition.latLng&&data.currentPosition.latLng.longitude;
  const mapUrl=lat&&lng?'https://maps.google.com/maps?q='+lat+','+lng+'&z=13&output=embed':null;
  // fix: remaining is 0 when curIdx=-1 (unknown position), not negative
  const remaining=curIdx>=0?route.length-1-curIdx:route.length;
  let etaStr='—';let etaTs=0;
  if(nextStop&&nextStop.scheduledArrivalTime){
    etaTs=(nextStop.scheduledArrivalTime+(data.delayInSecs||0))*1000;
    etaStr=new Date(etaTs).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true});
  }
  const speedKmh=data.currentPosition&&data.currentPosition.speedKmph!=null?Math.round(data.currentPosition.speedKmph):null;
  const favFlag=isFav(trainNo);
  let h=`<div class="live-panel">`;
  h+=`<div class="lp-head">
    <div class="lp-chips">
      <span class="chip chip-num">${he(trainNo)}</span>
      <span class="chip chip-src">${he(data.dataSource||'LIVE')}</span>
      <span class="chip ${isLate?(isVeryLate?'chip-late':'chip-warn'):'chip-ok'}"><span class="blink"></span>${isLate?'+'+delayMins+' min late':'On Time'}</span>
    </div>
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
      <div>
        <div class="lp-title">${he(trainName)}</div>
        <div class="lp-route"><span class="material-symbols-rounded" style="font-size:14px">train</span>${he(origin&&origin.station_name||'—')} → ${he(dest&&dest.station_name||'—')}</div>
      </div>
      <button class="fav-btn${favFlag?' active':''}" id="lpFavBtn" title="Favourite" style="margin-top:4px"><span class="material-symbols-rounded" style="font-size:22px">star</span></button>
    </div>
    <div class="lp-meta-row">
      <div class="meta-it"><div class="mlabel">Updated</div><div class="mval">${fmt(data.lastUpdatedTimestamp)}</div></div>
      <div class="meta-it"><div class="mlabel">Covered</div><div class="mval">${distOrig} km</div></div>
      <div class="meta-it"><div class="mlabel">Stops left</div><div class="mval">${remaining}</div></div>
      <div class="meta-it"><div class="mlabel">Total stops</div><div class="mval">${route.length}</div></div>
    </div>
  </div>`;
  /* PROGRESS */
  h+=`<div class="lp-progress">
    <div class="prog-head"><span class="prog-endpoints">${he(origin&&origin.stationCode||'')} → ${he(dest&&dest.stationCode||'')}</span><span class="prog-pct">${progress}%</span></div>
    <div class="linear-track"><div class="linear-fill" id="progFill" style="width:0%"></div></div>
    <div class="prog-labels"><span class="prog-lbl">${he(origin&&origin.station_name||'')}</span><span class="prog-lbl" style="text-align:right">${he(dest&&dest.station_name||'')}</span></div>
  </div>`;
  /* STATS */
  const delaySvg=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><polyline points="12 7 12 12 15 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const routeSvg=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="6" cy="19" r="2" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="5" r="2" stroke="currentColor" stroke-width="1.8"/><path d="M6 17v-4a6 6 0 0 1 6-6h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const locSvg=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/></svg>`;
  const timerSvg=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/></svg>`;
  const speedSvg=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 12L8.5 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M3 12a9 9 0 1 1 18 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5.6 16.8L8 14.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18.4 16.8L16 14.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  h+=`<div class="stats-row">
    <div class="stat-it"><div style="color:${isLate?'var(--red)':'var(--green)'};display:flex;justify-content:center;margin-bottom:4px">${delaySvg}</div><div class="sval ${isLate?'r':'g'}">${isLate?'+'+delayMins:'0'}</div><div class="slbl">Min Delay</div></div>
    <div class="stat-it"><div style="color:var(--accent);display:flex;justify-content:center;margin-bottom:4px">${routeSvg}</div><div class="sval b">${distOrig}</div><div class="slbl">KM Done</div></div>
    <div class="stat-it"><div style="color:var(--text3);display:flex;justify-content:center;margin-bottom:4px">${locSvg}</div><div class="sval">${distLast}</div><div class="slbl">KM Last Stn</div></div>
    <div class="stat-it"><div style="color:var(--accent);display:flex;justify-content:center;margin-bottom:4px">${timerSvg}</div><div class="sval b" style="font-size:13px">${etaStr}</div><div class="slbl">ETA Next</div></div>
    ${speedKmh!==null?`<div class="stat-it"><div style="color:var(--yellow);display:flex;justify-content:center;margin-bottom:4px">${speedSvg}</div><div class="sval y">${speedKmh}</div><div class="slbl">km/h</div></div>`:''}
  </div>`;
  /* POSITION */
  const posTrainSvg=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="12" rx="3" fill="white" opacity=".3"/><rect x="4" y="3" width="16" height="12" rx="3" stroke="white" stroke-width="1.8"/><circle cx="8.5" cy="18.5" r="1.8" fill="white"/><circle cx="15.5" cy="18.5" r="1.8" fill="white"/><line x1="4" y1="9" x2="20" y2="9" stroke="white" stroke-width="1.8"/><line x1="12" y1="3" x2="12" y2="9" stroke="white" stroke-width="1.8"/></svg>`;
  /* POSITION */
  if(curStn){
    h+=`<div class="lp-pos">
      <div class="pos-icon">${posTrainSvg}</div>
      <div class="pos-info">
        <div class="pos-at">Currently At</div>
        <div class="pos-name">${he(curStn.station_name)}</div>
        <div class="pos-sub">${he(curStn.stationCode)} · Platform ${he(curStn.platformNumber||'—')}</div>
      </div>
      <div class="pos-next">${nextStop?`<div class="next-lbl">NEXT STOP</div><div class="next-name">${he(nextStop.station_name)}</div><div class="next-chip">ETA ${etaStr}</div>`:`<div class="next-chip">🏁 Final Destination</div>`}</div>
    </div>`;
  }
  /* COUNTDOWN */
  if(etaTs>0){
    h+=`<div class="cd-row">
      <div><div class="cd-lbl">ARRIVES IN</div><div class="cd-val" id="cdVal">--:--</div></div>
      <div style="flex:1"><div class="cd-stn">${he(nextStop&&nextStop.station_name||'')}</div><div class="cd-code">${he(nextStop&&nextStop.stationCode||'')} · PF ${he(nextStop&&nextStop.platformNumber||'—')}</div></div>
      <div class="cd-right"><div class="cd-sched-lbl">SCHEDULED</div><div class="cd-sched-val">${fmt(nextStop&&nextStop.scheduledArrivalTime)}</div></div>
    </div>`;
  }
  /* MAP — Dual: Leaflet OSM + Google Maps */
  if(lat&&lng){
    const gmapUrl=`https://maps.google.com/maps?q=${lat},${lng}&z=14&output=embed`;
    h+=`<div class="train-map-section">
      <button class="train-map-toggle" id="trainMapToggle">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13V7m0 13 6 1m-6-14 6-2m0 15 5.447-2.724A1 1 0 0 0 21 16.382V5.618a1 1 0 0 0-1.447-.894L15 7m0 13V7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Live Train Location
        <span style="margin-left:6px;font-size:10px;opacity:.6;font-family:var(--mono)">${Number(lat).toFixed(4)}°, ${Number(lng).toFixed(4)}°</span>
        <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="train-map-outer" id="trainMapOuter">
        <div class="map-tab-bar">
          <button class="map-tab active" data-map="leaflet">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10A15.3 15.3 0 0 1 8 12a15.3 15.3 0 0 1 4-10z" stroke="currentColor" stroke-width="1.8"/></svg>
            OpenStreetMap
          </button>
          <button class="map-tab" data-map="google">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/></svg>
            Google Maps
          </button>
        </div>
        <div class="map-pane active" id="mapPaneLeaflet"><div id="trainLeafletMap"></div></div>
        <div class="map-pane" id="mapPaneGoogle" data-src="${he(gmapUrl)}"></div>
      </div>
    </div>`;
  }
  /* SHARE */
  h+=`<div class="share-row">
    <span class="share-lbl">Share</span>
    <button class="share-btn" id="copyShareBtn"><span class="material-symbols-rounded" style="font-size:15px">content_copy</span> Copy</button>
    <button class="share-btn" id="waShareBtn"><span class="material-symbols-rounded" style="font-size:15px">chat</span> WhatsApp</button>
    <button class="share-btn" id="dlShareBtn"><span class="material-symbols-rounded" style="font-size:15px">download</span> Save</button>
  </div>`;
  /* AUTO-REFRESH BAR */
  h+=`<div class="auto-bar">
    <div class="auto-bar-l"><div class="live-ind"><div class="live-dot"></div>LIVE</div>
    <div class="ar-prog"><div class="ar-fill" id="arFill" style="width:0%"></div></div></div>
    <span class="ar-lbl" id="arCd">Next in 45s</span>
  </div>`;
  /* TABS */
  h+=`<div class="md3-tabs">
    <button class="tab-btn active" data-tab="tab-tl">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><line x1="8" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="18" x2="21" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="6" x2="3.01" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="12" x2="3.01" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="18" x2="3.01" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Timeline
    </button>
    <button class="tab-btn" data-tab="tab-table">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" stroke-width="1.8"/><line x1="3" y1="15" x2="21" y2="15" stroke="currentColor" stroke-width="1.8"/><line x1="9" y1="9" x2="9" y2="21" stroke="currentColor" stroke-width="1.8"/></svg>
      All Stops
    </button>
    <button class="tab-btn" data-tab="tab-info">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><line x1="12" y1="8" x2="12" y2="8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="12" x2="12" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      Details
    </button>
  </div>`;
  /* TIMELINE */
  h+=`<div id="tab-tl" class="tab-content active"><div class="lp-timeline"><div class="sec-title">Journey Timeline</div><div class="tl-wrap"><div class="tl-line"></div>`;
  for(let i=0;i<route.length;i++){
    const s=route[i],isCur=i===curIdx,isPast=i<curIdx;
    const cls=isCur?'current':isPast?'past':'future';
    const aD=s.scheduledArrivalDelaySecs||0,dD=s.scheduledDepartureDelaySecs||0;
    const aCls=s.actualArrivalTime?(aD>120?'r':'g'):'d',dCls=s.actualDepartureTime?(dD>120?'r':'g'):'d';
    // status badge
    let statusBadge='';
    if(isCur)statusBadge=`<span class="stop-status s-here">● Here</span>`;
    else if(isPast)statusBadge=`<span class="stop-status s-done">✓ Done</span>`;
    else if(i===curIdx+1)statusBadge=`<span class="stop-status s-next">→ Next</span>`;
    else statusBadge=`<span class="stop-status s-upcoming">Upcoming</span>`;
    h+=`<div class="stop ${cls}"><div class="stop-dot"></div>
      <div class="stop-row">
        <div class="stop-info">
          <div class="sname">${he(s.station_name)}</div>
          <div class="scode">${he(s.stationCode)} · #${s.stopIndex||(i+1)}</div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px">
            ${statusBadge}
            ${s.platformNumber?`<div class="pf-chip">PF ${he(s.platformNumber)}</div>`:''}
          </div>
        </div>
        <div class="stop-times">
          <div class="t-grp"><div class="t-label">Arrival</div><div class="t-val ${aCls}">${fmt(s.actualArrivalTime||s.scheduledArrivalTime)}</div>${aD>60?`<div class="d-chip">+${Math.round(aD/60)}m late</div>`:''}</div>
          <div class="t-grp"><div class="t-label">Depart</div><div class="t-val ${dCls}">${fmt(s.actualDepartureTime||s.scheduledDepartureTime)}</div>${dD>60?`<div class="d-chip">+${Math.round(dD/60)}m late</div>`:''}</div>
        </div>
      </div>
    </div>${i<route.length-1?'<hr class="stop-div">':''}`;
  }
  h+=`</div></div></div></div>`;
  /* TABLE */
  h+=`<div id="tab-table" class="tab-content"><div style="padding:16px 20px;background:var(--surface)"><div class="sec-title">All Stops</div>
    <div class="stops-wrap"><table>
      <thead><tr><th>#</th><th>Station</th><th>Code</th><th>PF</th><th>Sch Arr</th><th>Act Arr</th><th>Sch Dep</th><th>Act Dep</th><th>Delay</th></tr></thead>
      <tbody>`;
  for(let i=0;i<route.length;i++){
    const s=route[i],isCur=i===curIdx,isPast=i<curIdx;
    const rc=isCur?'row-cur':isPast?'row-past':'row-fut';
    const md=Math.max(s.scheduledArrivalDelaySecs||0,s.scheduledDepartureDelaySecs||0);
    h+=`<tr class="${rc}"><td>${i+1}${isCur?'<span class="cur-arrow"> ◀</span>':''}</td>
      <td class="td-name">${he(s.station_name)}</td><td class="td-code">${he(s.stationCode)}</td>
      <td class="td-pf">${he(s.platformNumber||'—')}</td>
      <td class="td-t">${fmt(s.scheduledArrivalTime)}</td><td class="td-t">${fmt(s.actualArrivalTime)}</td>
      <td class="td-t">${fmt(s.scheduledDepartureTime)}</td><td class="td-t">${fmt(s.actualDepartureTime)}</td>
      <td class="td-d ${md>120?'late':'ok'}">${md>60?'+'+Math.round(md/60)+'m':'—'}</td>
    </tr>`;
  }
  h+=`</tbody></table></div></div></div>`;
  /* INFO TAB */
  h+=`<div id="tab-info" class="tab-content"><div style="padding:16px 20px;background:var(--surface)">
    <div class="sec-title">Train Details</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="meta-it" style="padding-right:0;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r2);padding:12px"><div class="mlabel">Train Number</div><div class="mval">${he(trainNo)}</div></div>
      <div class="meta-it" style="padding-right:0;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r2);padding:12px"><div class="mlabel">Data Source</div><div class="mval" style="font-size:12px">${he(data.dataSource||'—')}</div></div>
      <div class="meta-it" style="padding-right:0;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r2);padding:12px"><div class="mlabel">Stops</div><div class="mval">${route.length}</div></div>
      <div class="meta-it" style="padding-right:0;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r2);padding:12px"><div class="mlabel">Progress</div><div class="mval">${progress}%</div></div>
      <div class="meta-it" style="padding-right:0;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r2);padding:12px"><div class="mlabel">Origin</div><div class="mval" style="font-size:12px">${he(origin&&origin.station_name||'—')}</div></div>
      <div class="meta-it" style="padding-right:0;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r2);padding:12px"><div class="mlabel">Destination</div><div class="mval" style="font-size:12px">${he(dest&&dest.station_name||'—')}</div></div>
    </div>
  </div></div>`;
  h+=`</div><div class="last-ref">Last refreshed: <span id="lastRefTime">—</span></div>`;
  lv.innerHTML=h;
  /* PROGRESS ANIMATION */
  requestAnimationFrame(()=>setTimeout(()=>{const pf=document.getElementById('progFill');if(pf)pf.style.width=progress+'%';},80));
  /* COUNTDOWN */
  if(etaTs>0){
    if(countdownInterval)clearInterval(countdownInterval);
    countdownInterval=setInterval(()=>{
      const el=document.getElementById('cdVal');if(!el){clearInterval(countdownInterval);return;}
      const diff=etaTs-Date.now();
      if(diff<=0){el.textContent='Arriving';el.style.color='var(--green)';clearInterval(countdownInterval);return;}
      const m=Math.floor(diff/60000),sc=Math.floor((diff%60000)/1000);
      el.textContent=pad(m)+':'+pad(sc);el.style.color=m<5?'var(--red)':'';
    },1000);
  }
  /* FAV BUTTON IN LIVE PANEL */
  const lpFav=document.getElementById('lpFavBtn');
  if(lpFav)lpFav.addEventListener('click',()=>{
    if(isFav(trainNo)){removeFav(trainNo);lpFav.classList.remove('active');showFavConfirm('Removed from favourites');}
    else{saveFav(trainNo,trainName);lpFav.classList.add('active');showFavConfirm('★ Added to favourites');}
  });
  /* DUAL MAP — Leaflet + Google Maps */
  const trainMapToggle=document.getElementById('trainMapToggle');
  const trainMapOuter=document.getElementById('trainMapOuter');
  let leafletMap=null;
  function buildLeafletMap(){
    const container=document.getElementById('trainLeafletMap');
    if(!container||leafletMap)return;
    if(typeof L==='undefined'){
      const waitL=setInterval(()=>{if(typeof L!=='undefined'){clearInterval(waitL);buildLeafletMap();}},100);
      return;
    }
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
    leafletMap=L.map(container,{zoomControl:true,attributionControl:true,scrollWheelZoom:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(leafletMap);
    leafletMap.setView([lat,lng],14);
    L.circle([lat,lng],{radius:300,className:'leaflet-accuracy-circle'}).addTo(leafletMap);
    const trainIconHtml=`<div class="train-marker-wrap"><div class="train-marker-pulse2"></div><div class="train-marker-pulse"></div><div class="train-marker-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="12" rx="3" fill="white" opacity=".3"/><rect x="4" y="3" width="16" height="12" rx="3" stroke="white" stroke-width="1.8"/><circle cx="8.5" cy="18.5" r="1.8" fill="white"/><circle cx="15.5" cy="18.5" r="1.8" fill="white"/><line x1="4" y1="9" x2="20" y2="9" stroke="white" stroke-width="1.8"/><line x1="12" y1="3" x2="12" y2="9" stroke="white" stroke-width="1.8"/></svg></div></div>`;
    const trainIcon=L.divIcon({html:trainIconHtml,className:'',iconSize:[40,40],iconAnchor:[20,20],popupAnchor:[0,-24]});
    const delayTxt=isLate?('+'+delayMins+' min late'):'On Time';
    const popupHtml=`<div><div class="map-popup-title">🚆 ${he(trainName)}</div><div class="map-popup-row"><span class="map-popup-lbl">Station</span><span class="map-popup-val">${he(curStn?curStn.station_name:trainNo)}</span></div><div class="map-popup-row"><span class="map-popup-lbl">Delay</span><span class="map-popup-val" style="color:${isLate?'var(--red)':'var(--green)'}">${delayTxt}</span></div><div class="map-popup-row"><span class="map-popup-lbl">Speed</span><span class="map-popup-val">${speedKmh!=null?speedKmh+' km/h':'—'}</span></div><div class="map-popup-row"><span class="map-popup-lbl">Progress</span><span class="map-popup-val">${progress}%</span></div></div>`;
    L.marker([lat,lng],{icon:trainIcon,zIndexOffset:1000}).addTo(leafletMap).bindPopup(popupHtml,{closeOnClick:false,autoClose:false}).openPopup();
    setTimeout(()=>{if(leafletMap)leafletMap.invalidateSize();},350);
  }
  // Map tab switching
  if(trainMapOuter){
    trainMapOuter.querySelectorAll('.map-tab').forEach(tab=>{
      tab.addEventListener('click',function(){
        trainMapOuter.querySelectorAll('.map-tab').forEach(t=>t.classList.remove('active'));
        trainMapOuter.querySelectorAll('.map-pane').forEach(p=>p.classList.remove('active'));
        this.classList.add('active');
        const paneId='mapPane'+this.dataset.map.charAt(0).toUpperCase()+this.dataset.map.slice(1);
        const pane=document.getElementById(paneId);
        if(pane){
          pane.classList.add('active');
          if(this.dataset.map==='leaflet'){
            buildLeafletMap();
            if(leafletMap)setTimeout(()=>leafletMap.invalidateSize(),100);
          } else if(this.dataset.map==='google'){
            // lazy-load Google Maps iframe only when tab selected
            if(!pane.querySelector('iframe')){
              const src=pane.dataset.src;
              pane.innerHTML=`<iframe class="gmap-frame" src="${src}" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>`;
            }
          }
        }
      });
    });
  }
  if(trainMapToggle){
    trainMapToggle.addEventListener('click',function(){
      const isOpen=trainMapOuter&&trainMapOuter.classList.contains('open');
      if(trainMapOuter)trainMapOuter.classList.toggle('open',!isOpen);
      this.classList.toggle('open',!isOpen);
      if(!isOpen)buildLeafletMap();
    });
    // Auto-open when coords available
    if(lat&&lng){
      setTimeout(()=>{
        if(trainMapOuter&&!trainMapOuter.classList.contains('open')){
          trainMapOuter.classList.add('open');
          trainMapToggle.classList.add('open');
          buildLeafletMap();
        }
      },700);
    }
  }
  /* SHARE TEXT */
  const shareText=`🚆 ${trainNo} — ${trainName}\n📍 At: ${curStn?curStn.station_name:curCode||'—'}\n⏱ Delay: ${isLate?'+'+delayMins+' min':'On time'}\n🏁 Destination: ${dest?dest.station_name:'—'}\n📊 Progress: ${progress}%\n\nTracked via TrackIt`;
  const cpBtn=document.getElementById('copyShareBtn');
  if(cpBtn)cpBtn.addEventListener('click',function(){
    navigator.clipboard.writeText(shareText).then(()=>{toast('Copied!','done');this.classList.add('copied');setTimeout(()=>this.classList.remove('copied'),2000);}).catch(()=>toast('Copy failed','error'));
  });
  const waBtn=document.getElementById('waShareBtn');
  if(waBtn)waBtn.addEventListener('click',()=>window.open('https://wa.me/?text='+encodeURIComponent(shareText),'_blank'));
  const dlBtn=document.getElementById('dlShareBtn');
  if(dlBtn)dlBtn.addEventListener('click',()=>{
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([shareText],{type:'text/plain'}));
    a.download='train-'+trainNo+'-status.txt';a.click();toast('Saved!','done');
  });
  /* TABS */
  lv.querySelectorAll('.tab-btn[data-tab]').forEach(btn=>{
    btn.addEventListener('click',function(){
      lv.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      lv.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
      this.classList.add('active');const t=document.getElementById(this.dataset.tab);if(t)t.classList.add('active');
    });
  });
}
/* ══ PREFETCH ENGINE ══
   On mouseenter/touchstart over any Track button or recent/fav chip,
   silently fetch live status into a Map cache. If user clicks within
   the cache TTL (30s), renderLive fires instantly from cache.        */
const prefetchCache=new Map(); // key=trainNo, value={data,ts}
const PREFETCH_TTL=30000; // 30 seconds
const prefetchInFlight=new Set();
async function prefetchTrain(num,name){
  if(!num)return;
  const now=Date.now();
  const cached=prefetchCache.get(num);
  if(cached&&(now-cached.ts)<PREFETCH_TTL)return; // still fresh
  if(prefetchInFlight.has(num))return; // already fetching
  prefetchInFlight.add(num);
  try{
    const d=await fetchData('/live-status?trainNo='+encodeURIComponent(num));
    prefetchCache.set(num,{data:d,ts:Date.now(),name:name||num});
    // Mark any visible track buttons for this train as prefetched
    document.querySelectorAll(`[data-prefetch-num="${CSS.escape(num)}"]`).forEach(el=>{
      el.classList.remove('prefetching');el.classList.add('prefetched');
    });
  }catch(e){/* silent — prefetch failure is non-critical */}
  finally{prefetchInFlight.delete(num);}
}
// Get from cache if available and fresh, else return null
function getCachedLive(num){
  const c=prefetchCache.get(num);
  if(c&&(Date.now()-c.ts)<PREFETCH_TTL)return c;
  return null;
}
// Attach prefetch listeners to an element
function attachPrefetch(el,num,name){
  if(!el||!num||el._pfAttached)return;
  el._pfAttached=true;
  el.setAttribute('data-prefetch-num',num);
  const trigger=()=>{
    el.classList.add('prefetching');
    prefetchTrain(num,name);
  };
  el.addEventListener('mouseenter',trigger,{passive:true});
  el.addEventListener('touchstart',trigger,{passive:true,once:true});
  el.addEventListener('focus',trigger,{passive:true});
}
// Override doLive to use cache when available
async function doLive(num,name){
  const cached=getCachedLive(num);
  if(cached&&cached.data&&cached.data.data){
    // Instant render from cache
    const sr=document.getElementById('searchResults'),lv=document.getElementById('liveView');
    sr.innerHTML='';lv.innerHTML='';
    clearInterval(countdownInterval);stopAR();
    curNum=num;curName=name||num;
    document.getElementById('refreshBtn').style.display='flex';
    clearSuggest();si.value=name||num;
    lastRefTs=new Date(cached.ts);
    renderLive(cached.data.data,num,name||num);
    updateLastRef();startAR();
    toast('Loaded instantly ⚡','done');
    // Refresh cache in background
    prefetchCache.delete(num);
    prefetchTrain(num,name);
    return;
  }
  // Fall through to normal load
  const sr=document.getElementById('searchResults'),lv=document.getElementById('liveView');
  sr.innerHTML='';lv.innerHTML=loader('Fetching live status for '+num+'…');
  clearInterval(countdownInterval);stopAR();
  curNum=num;curName=name||num;
  document.getElementById('refreshBtn').style.display='flex';
  clearSuggest();si.value=name||num;
  try{
    const d=await fetchData('/live-status?trainNo='+encodeURIComponent(num));
    lastRefTs=new Date();renderLive(d.data,num,name||num);updateLastRef();startAR();
  }catch(err){
    lv.innerHTML=`<div class="loader" style="flex-direction:column;align-items:flex-start;gap:6px"><div>Failed to load: ${he(err.message)}</div><div style="font-size:11px;opacity:.5">Train may not be running today</div></div>`;
  }
}
/* RECENT */
function getRecent(){try{return JSON.parse(localStorage.getItem('tt-recent')||'[]');}catch{return[];}}
function saveRecent(num,name){let r=getRecent().filter(x=>x.num!==num);r.unshift({num,name});if(r.length>6)r=r.slice(0,6);try{localStorage.setItem('tt-recent',JSON.stringify(r));}catch(e){}}
function clearRecent(){try{localStorage.removeItem('tt-recent');}catch(e){}showWelcome();toast('Cleared','done');}
/* FAVOURITES */
function getFavs(){try{return JSON.parse(localStorage.getItem('tt-favs')||'[]');}catch{return[];}}
function isFav(num){return getFavs().some(f=>f.num===String(num));}
function saveFav(num,name){let f=getFavs().filter(x=>x.num!==String(num));f.unshift({num:String(num),name});try{localStorage.setItem('tt-favs',JSON.stringify(f));}catch(e){}}
function removeFav(num){let f=getFavs().filter(x=>x.num!==String(num));try{localStorage.setItem('tt-favs',JSON.stringify(f));}catch(e){}}
function showFavConfirm(msg){
  const el=document.getElementById('favConfirm');el.textContent=msg;el.classList.add('show');
  clearTimeout(showFavConfirm._t);showFavConfirm._t=setTimeout(()=>el.classList.remove('show'),2200);
}
/* WELCOME */
function showWelcome(){
  const recent=getRecent(),favs=getFavs();
  let h=`<div class="welcome"><div class="welcome-hero">
    <div class="welcome-icon">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="3" width="16" height="13" rx="3" fill="var(--accent)" opacity=".15"/>
        <rect x="4" y="3" width="16" height="13" rx="3" stroke="var(--accent)" stroke-width="1.5"/>
        <circle cx="8" cy="19" r="2" fill="var(--accent)"/>
        <circle cx="16" cy="19" r="2" fill="var(--accent)"/>
        <line x1="4" y1="9" x2="20" y2="9" stroke="var(--accent)" stroke-width="1.5"/>
        <line x1="12" y1="3" x2="12" y2="9" stroke="var(--accent)" stroke-width="1.5"/>
        <line x1="8" y1="17" x2="16" y2="17" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </div>
    <div class="welcome-title">Track any Indian train, <span>live.</span></div>
    <div class="welcome-sub">Type a train number or name in the search bar above to get started.</div>
  </div>`;
  if(favs.length){
    h+=`<div class="section-row"><div class="section-lbl">⭐ Favourites</div><button class="clear-btn" id="manageFavsBtn">Manage</button></div><div class="chips-row">`;
    for(let i=0;i<favs.length;i++)h+=`<div class="r-chip" data-fav-i="${i}"><span class="r-num">${he(favs[i].num)}</span><span>${he(favs[i].name)}</span></div>`;
    h+=`</div>`;
  }
  if(recent.length){
    h+=`<div class="section-row"><div class="section-lbl">Recent Searches</div><button class="clear-btn" id="clearRecentBtn">Clear</button></div><div class="chips-row">`;
    for(let i=0;i<recent.length;i++)h+=`<div class="r-chip" data-recent-i="${i}"><span class="r-num">${he(recent[i].num)}</span><span>${he(recent[i].name)}</span></div>`;
    h+=`</div>`;
  }
  h+=`<div class="howto-card"><div class="howto-title">How to use TrackIt</div><div class="howto-items">
    <div class="howto-item"><div class="howto-icon-bg" style="background:rgba(91,63,255,.08);font-size:18px;color:var(--accent)">🔍</div><div><h4>Search</h4><p>Type a train number (e.g. 12728) or name in the search bar</p></div></div>
    <div class="howto-item"><div class="howto-icon-bg" style="background:rgba(220,38,38,.08);font-size:18px">📍</div><div><h4>Track</h4><p>Click Track to see real-time position, platform &amp; delay info</p></div></div>
    <div class="howto-item"><div class="howto-icon-bg" style="background:rgba(217,119,6,.08);font-size:18px">⭐</div><div><h4>Favourites</h4><p>Star trains to save them for quick access</p></div></div>
    <div class="howto-item"><div class="howto-icon-bg" style="background:rgba(5,150,105,.08);font-size:18px">🔄</div><div><h4>Auto-refresh</h4><p>Live data updates every 45 seconds automatically</p></div></div>
  </div></div></div>`;
  const sr=document.getElementById('searchResults'),lv=document.getElementById('liveView');
  sr.innerHTML=h;lv.innerHTML='';
  const crb=document.getElementById('clearRecentBtn');if(crb)crb.addEventListener('click',clearRecent);
  const mfb=document.getElementById('manageFavsBtn');if(mfb)mfb.addEventListener('click',openFavModal);
  document.querySelectorAll('[data-recent-i]').forEach(c=>{
    const r=recent[+c.dataset.recentI];
    if(r){attachPrefetch(c,r.num,r.name);c.addEventListener('click',()=>doLive(r.num,r.name));}
  });
  document.querySelectorAll('[data-fav-i]').forEach(c=>{
    const f=favs[+c.dataset.favI];
    if(f){attachPrefetch(c,f.num,f.name);c.addEventListener('click',()=>{doLive(f.num,f.name);saveRecent(f.num,f.name);});}
  });
}
/* FAV MODAL */
function openFavModal(){
  const favs=getFavs();
  let h='';
  if(!favs.length){h='<p style="color:var(--text2)">No favourites yet. Star trains to add them here.</p>';}
  else{
    h='<div class="chips-row" style="margin-bottom:0">';
    for(let i=0;i<favs.length;i++){
      h+=`<div style="display:flex;align-items:center;gap:8px;background:var(--bg2);border:1px solid var(--border2);border-radius:var(--r4);padding:8px 14px;font-size:13px">
        <span class="r-num" style="cursor:pointer" data-fav-track="${he(favs[i].num)}" data-fav-name="${he(favs[i].name)}">${he(favs[i].num)}</span>
        <span style="cursor:pointer;flex:1" data-fav-track="${he(favs[i].num)}" data-fav-name="${he(favs[i].name)}">${he(favs[i].name)}</span>
        <button data-fav-remove="${he(favs[i].num)}" style="background:none;border:none;cursor:pointer;color:var(--red);margin-left:4px;font-size:18px;line-height:1;padding:2px 4px;border-radius:4px" title="Remove">×</button>
      </div>`;
    }
    h+='</div>';
  }
  const box=document.getElementById('favModalContent');
  box.innerHTML=h;
  // wire remove buttons via event delegation (inside IIFE scope)
  box.querySelectorAll('[data-fav-remove]').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();removeFav(btn.dataset.favRemove);showFavConfirm('Removed');openFavModal();
    });
  });
  // wire track clicks
  box.querySelectorAll('[data-fav-track]').forEach(el=>{
    attachPrefetch(el,el.dataset.favTrack,el.dataset.favName);
    el.addEventListener('click',()=>{
      document.getElementById('favModal').style.display='none';
      doLive(el.dataset.favTrack,el.dataset.favName);saveRecent(el.dataset.favTrack,el.dataset.favName);
    });
  });
  document.getElementById('favModal').style.display='flex';
}
document.getElementById('favMenuBtn').addEventListener('click',openFavModal);
document.getElementById('favModalClose').addEventListener('click',()=>document.getElementById('favModal').style.display='none');
document.getElementById('favModal').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.style.display='none';});
/* HOME */
function goHome(){
  stopAR();if(countdownInterval){clearInterval(countdownInterval);countdownInterval=null;}
  curNum=null;curName=null;document.getElementById('refreshBtn').style.display='none';
  si.value='';clearSuggest();showWelcome();window.scrollTo({top:0,behavior:'smooth'});
}
document.getElementById('brandBtn').addEventListener('click',goHome);
document.getElementById('refreshBtn').addEventListener('click',()=>doRefresh(false));
// Prefetch on Refresh button hover — so data is fresh before user clicks
document.getElementById('refreshBtn').addEventListener('mouseenter',()=>{
  if(curNum)prefetchTrain(curNum,curName);
},{passive:true});
/* DISCLAIMER */
document.getElementById('disclaimerLink').addEventListener('click',e=>{e.preventDefault();document.getElementById('disclaimerModal').style.display='flex';});
document.getElementById('modalCloseBtn').addEventListener('click',()=>document.getElementById('disclaimerModal').style.display='none');
document.getElementById('disclaimerModal').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.style.display='none';});
/* THEME */
const themeBtn=document.getElementById('themeToggleBtn'),themeIcon=document.getElementById('themeIcon');
let isDark=document.documentElement.getAttribute('data-theme')==='dark';
themeIcon.textContent=isDark?'light_mode':'dark_mode';
themeBtn.addEventListener('click',()=>{
  isDark=!isDark;
  isDark?document.documentElement.setAttribute('data-theme','dark'):document.documentElement.removeAttribute('data-theme');
  try{localStorage.setItem('tt',isDark?'dark':'light');}catch(e){}
  themeIcon.textContent=isDark?'light_mode':'dark_mode';
});
/* ══ NETWORK HEALTH ══ */
const netSig=document.getElementById('netSig');
const netLabel=document.getElementById('netLabel');
const sigBars=document.getElementById('sigBars');
const netLocTxt=document.getElementById('netLocTxt');
const netPill=document.getElementById('netPill');
const netPopover=document.getElementById('netPopover');
// popover toggle
netPill.addEventListener('click',e=>{e.stopPropagation();netPopover.classList.toggle('open');});
document.addEventListener('click',()=>netPopover.classList.remove('open'));
// set pill signal level 0-5
function setSignalLevel(lvl,label,cls){
  netSig.className='net-pill-sig '+cls;
  netLabel.textContent=label;
  const bars=sigBars.querySelectorAll('span');
  bars.forEach((b,i)=>b.classList.toggle('lit',i<lvl));
  document.getElementById('popSignal').textContent=label;
}
// measure latency by timing a tiny fetch
async function measurePing(){
  try{
    const t0=performance.now();
    await fetch('https://www.google.com/favicon.ico?_='+Date.now(),{mode:'no-cors',cache:'no-store'});
    return Math.round(performance.now()-t0);
  }catch{return null;}
}
// determine signal from Network Information API + ping
async function assessSignal(){
  if(!navigator.onLine){setSignalLevel(0,'Offline','s0');document.getElementById('popType').textContent='Offline';return;}
  const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  const ef=conn?conn.effectiveType:null;
  const dl=conn?conn.downlink:null; // Mbps
  const rtt=conn?conn.rtt:null;
  const ping=await measurePing();
  document.getElementById('popPing').textContent=ping!=null?ping+'ms':'—';
  // connection type label
  let typeStr=ef?ef.toUpperCase():'Unknown';
  if(conn&&conn.type&&conn.type!=='unknown')typeStr=conn.type.charAt(0).toUpperCase()+conn.type.slice(1)+' ('+typeStr+')';
  document.getElementById('popType').textContent=typeStr;
  document.getElementById('popSpeed').textContent=dl!=null?dl+' Mbps downlink'+(rtt!=null?', RTT '+rtt+'ms':''):'—';
  // scoring
  let score=5;
  if(ef==='slow-2g')score=1;
  else if(ef==='2g')score=2;
  else if(ef==='3g')score=3;
  else if(ef==='4g'){
    // further refine by ping/downlink
    if(ping&&ping>300)score=3;
    else if(ping&&ping>150)score=4;
    else score=5;
  }
  // downlink override
  if(dl!=null){
    if(dl<0.2)score=Math.min(score,1);
    else if(dl<1)score=Math.min(score,2);
    else if(dl<5)score=Math.min(score,3);
    else if(dl<15)score=Math.min(score,4);
  }
  const labels=['Offline','Very Weak','Weak','Moderate','Strong','Very Strong'];
  const classes=['s0','s1','s2','s3','s4','s5'];
  setSignalLevel(score,labels[score],classes[score]);
}
// fetch IP + location from ipapi.co
async function fetchIpInfo(){
  try{
    const r=await fetch('https://ipapi.co/json/',{cache:'no-store'});
    const d=await r.json();
    if(d.error)throw new Error(d.reason);
    const ip=d.ip||'—';
    const isp=d.org||d.asn||'—';
    const city=d.city||'';
    const region=d.region||'';
    const country=d.country_name||'';
    const lat=d.latitude?Number(d.latitude).toFixed(4):'—';
    const lon=d.longitude?Number(d.longitude).toFixed(4):'—';
    const locStr=[city,region,country].filter(Boolean).join(', ')||'—';
    // update pill location
    netLocTxt.textContent=[city||region,country].filter(Boolean).join(', ')||ip;
    // update popover
    document.getElementById('popIp').textContent=ip;
    document.getElementById('popIsp').textContent=isp.length>30?isp.slice(0,30)+'…':isp;
    document.getElementById('popLoc').textContent=locStr;
    document.getElementById('popCoords').textContent=lat+'°, '+lon+'°';
  }catch(e){
    netLocTxt.textContent='No location';
    document.getElementById('popIp').textContent='Unavailable';
    document.getElementById('popLoc').textContent='—';
  }
}
// update net pill on old netBadge events too (keep backward compat)
function updateNet(e){
  const nb=document.getElementById('netBadge');if(!nb)return;
  const offSvg=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h.71A5.506 5.506 0 0 1 12 6c2.76 0 5.08 1.95 5.42 4.5l.29 2H19c1.65 0 3 1.35 3 3s-1.35 3-3 3z" fill="currentColor"/><line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const onSvg=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" fill="currentColor"/></svg>`;
  if(!navigator.onLine){nb.className='net-badge show offline';nb.innerHTML=offSvg+' Offline';}
  else if(e&&e.type==='online'){nb.className='net-badge show online';nb.innerHTML=onSvg+' Back online';setTimeout(()=>nb.classList.remove('show'),3000);}
  else nb.classList.remove('show');
  assessSignal();
}
window.addEventListener('online',updateNet);
window.addEventListener('offline',()=>{setSignalLevel(0,'Offline','s0');netLocTxt.textContent='—';updateNet();});
if(navigator.connection)navigator.connection.addEventListener('change',assessSignal);
// init
assessSignal();fetchIpInfo();
// re-assess every 30s
setInterval(()=>{assessSignal();},30000);
/* ══ FONT LOAD GUARD ══
   Adds body.fonts-loaded once Material Symbols is ready.
   Until then, .ms-icon spans stay visibility:hidden (no FOUT flash).
   Also fires immediately if fonts are already cached. */
if(document.fonts&&document.fonts.ready){
  document.fonts.ready.then(()=>{document.body.classList.add('fonts-loaded');});
}else{
  // Fallback: add class after 1.5s max wait
  setTimeout(()=>{document.body.classList.add('fonts-loaded');},1500);
}
// Also try FontFaceObserver-style check for Material Symbols specifically
(function checkIconFont(){
  const probe=document.createElement('span');
  probe.className='material-symbols-rounded';
  probe.style.cssText='position:absolute;visibility:hidden;font-size:100px;top:-999px;left:-999px';
  probe.textContent='train';
  document.body.appendChild(probe);
  const checkWidth=probe.offsetWidth;
  // When font loads, the ligature glyph width will be different from fallback
  let attempts=0;
  const poll=setInterval(()=>{
    attempts++;
    if(probe.offsetWidth!==checkWidth||attempts>40){
      document.body.classList.add('fonts-loaded');
      clearInterval(poll);
      document.body.removeChild(probe);
    }
  },50);
})();
/* INIT */
showWelcome();
// Prefetch recent + favourite trains silently on load (after 2s to not compete with critical resources)
setTimeout(()=>{
  const all=[...getRecent(),...getFavs()];
  const seen=new Set();
  all.forEach((t,i)=>{
    if(!t||!t.num||seen.has(t.num))return;
    seen.add(t.num);
    // stagger each request by 800ms to avoid hammering the API
    setTimeout(()=>prefetchTrain(t.num,t.name),i*800);
  });
},2000);
})();
