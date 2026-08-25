'use strict';
(function installNewsSync0324(){
  if(typeof renderNews!=='function'||!Array.isArray(stories)||typeof openStory!=='function'||typeof escapeHtml!=='function'||!window.ECAPI?.fetchArticle){setTimeout(installNewsSync0324,100);return;}
  if(window.__ec0324NewsSyncInstalled)return;window.__ec0324NewsSyncInstalled=true;

  const CONCURRENCY=3,MAX_HYDRATE_PER_PASS=80,RETRY_MS=10*60*1000;
  const articleCache=new Map(),queued=new Set(),statusMap=new Map();let queue=[],active=0,lastState=null;
  const priority={"AL AIRE":0,PROCESANDO:1,LISTA:2,EMITIDA:3,OMITIDA:4,ERROR:5};
  const textKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
  function canonical(value,keepEvent=true){const raw=String(value||'').trim();if(!raw)return'';try{const u=new URL(raw);u.hostname=u.hostname.toLowerCase().replace(/^www\./,'');for(const k of [...u.searchParams.keys()])if(/^utm_/i.test(k)||['fbclid','gclid','mc_cid','mc_eid','ref','source'].includes(k.toLowerCase()))u.searchParams.delete(k);u.searchParams.sort();if(u.pathname.length>1)u.pathname=u.pathname.replace(/\/+$/,'');if(!(keepEvent&&/^#ec-event=/i.test(u.hash)))u.hash='';return u.toString();}catch{return raw;}}
  const keyOf=s=>canonical(typeof s==='string'?s:s?.link,true),baseKeyOf=s=>canonical(typeof s==='string'?s:s?.link,false);
  function feedFor(story){return(settings?.rssFeeds||[]).find(f=>String(f.id)===String(story?.feedId))||{};}
  function statusFor(story){return statusMap.get(keyOf(story))||statusMap.get(baseKeyOf(story))||null;}
  function storyExclusive(story){const st=statusFor(story),feed=feedFor(story);return!!story?.isExclusive||!!st?.isExclusive||String(feed.accessMode||'auto')==='exclusive';}
  function visibleStories(){const q=textKey(document.querySelector('#search')?.value||''),ff=document.querySelector('#feedFilter')?.value||'';return stories.filter(s=>(!ff||s.feedId===ff)&&(!q||textKey(`${s.title||''} ${s.description||''}`).includes(q)));}
  function sortStories(list){return list.map((s,i)=>({s,i,st:statusFor(s)})).sort((a,b)=>{const pa=a.st?priority[String(a.st.status||'')]:99,pb=b.st?priority[String(b.st.status||'')]:99;if(pa!==pb)return pa-pb;const da=Date.parse(a.s.pubDate||'')||0,db=Date.parse(b.s.pubDate||'')||0;if(da!==db)return db-da;return a.i-b.i;}).map(x=>x.s);}
  function stateLabel(st){if(!st)return'';if(st.status==='EMITIDA')return'EMITIDA ✓';return String(st.status||'');}
  function stateClass(st){return String(st?.status||'').toLowerCase().replace(/\s+/g,'-').replace(/[^a-záéíóúñ0-9_-]/gi,'');}
  function badgeHtml(st,exclusive){const parts=[];if(exclusive)parts.push('<span class="news-access-badge">EXCLUSIVO</span>');if(st?.status)parts.push(`<span class="news-state-badge state-${escapeHtml(stateClass(st))}">${escapeHtml(stateLabel(st))}</span>`);return parts.join('');}
  function renderNews0324(){
    const list=document.querySelector('#newsList');if(!list)return;const selected=sortStories(visibleStories());list.innerHTML='';
    for(const s of selected){const st=statusFor(s),exclusive=storyExclusive(s),el=document.createElement('div');el.className=`newsItem${exclusive?' news-exclusive':''}${st?.status?` news-${stateClass(st)}`:''}`;el.dataset.storyKey=keyOf(s);el.dataset.storyBase=baseKeyOf(s);el.dataset.storyLink=String(s.link||'');const img=String(s.image||'').trim();el.innerHTML=`<div class="thumb${img?'':' image-resolving'}"${img?` style="background-image:url('${escapeHtml(img.replace(/'/g,'%27'))}')"`:''}></div><div class="meta"><div class="news-badges">${badgeHtml(st,exclusive)}</div><h3>${escapeHtml(s.title||'')}</h3><p>${escapeHtml(s.feedName||'')} · ${escapeHtml(s.category||'Actualidad')}</p><p>${escapeHtml(s.description||'')}</p>${st?.status==='OMITIDA'&&st.reason?`<p class="news-status-reason">OMITIDA · ${escapeHtml(st.reason)}</p>`:''}${st?.status==='ERROR'&&st.reason?`<p class="news-status-reason error">${escapeHtml(st.reason)}</p>`:''}</div><button class="edit">Ver noticia</button>`;el.querySelector('.edit').onclick=()=>openStory(s);list.appendChild(el);}
    if(!list.children.length)list.innerHTML='<div class="empty">No hay noticias que coincidan con la búsqueda.</div>';scheduleHydration(selected);
  }
  renderNews=renderNews0324;

  function matchingCards(story){const key=keyOf(story),base=baseKeyOf(story);return[...document.querySelectorAll('#newsList .newsItem')].filter(el=>el.dataset.storyKey===key||el.dataset.storyBase===base);}
  function paintImage(story,image){if(!image)return;for(const el of matchingCards(story)){const thumb=el.querySelector('.thumb');if(!thumb)continue;thumb.style.backgroundImage=`url(${JSON.stringify(image)})`;thumb.classList.remove('image-resolving','image-missing');thumb.classList.add('image-resolved');}}
  function patchBadges(story){const st=statusFor(story),exclusive=storyExclusive(story);for(const el of matchingCards(story)){el.classList.toggle('news-exclusive',exclusive);const badges=el.querySelector('.news-badges');if(badges)badges.innerHTML=badgeHtml(st,exclusive);let reason=el.querySelector('.news-status-reason');if(st?.status==='OMITIDA'&&st.reason){if(!reason){reason=document.createElement('p');reason.className='news-status-reason';el.querySelector('.meta')?.appendChild(reason);}reason.textContent=`OMITIDA · ${st.reason}`;}else if(st?.status==='ERROR'&&st.reason){if(!reason){reason=document.createElement('p');reason.className='news-status-reason error';el.querySelector('.meta')?.appendChild(reason);}reason.textContent=st.reason;}else reason?.remove();}}
  function remember(link,article){articleCache.set(link,{article,at:Date.now()});while(articleCache.size>500)articleCache.delete(articleCache.keys().next().value);}
  async function hydrate(story){const link=String(story?.link||'').trim(),cacheKey=baseKeyOf(story)||link;try{const cached=articleCache.get(cacheKey);let article=cached&&Date.now()-cached.at<RETRY_MS?cached.article:null;if(!article){article=await window.ECAPI.fetchArticle(link);remember(cacheKey,article||{});}if(article?.image){story.image=String(article.image);paintImage(story,story.image);}else for(const el of matchingCards(story)){const thumb=el.querySelector('.thumb');thumb?.classList.remove('image-resolving');thumb?.classList.add('image-missing');}
      if(article?.pubDate&&!story.pubDate)story.pubDate=article.pubDate;if(article?.isExclusive){story.isExclusive=true;story.accessStatus=article.access?.status||'SUBSCRIBER_ONLY';}patchBadges(story);
    }catch{for(const el of matchingCards(story)){const thumb=el.querySelector('.thumb');thumb?.classList.remove('image-resolving');thumb?.classList.add('image-missing');}}finally{queued.delete(cacheKey);active--;pump();}}
  function pump(){while(active<CONCURRENCY&&queue.length){const s=queue.shift();if(!s)continue;active++;hydrate(s);}}
  function scheduleHydration(list=visibleStories()){for(const story of list.slice(0,MAX_HYDRATE_PER_PASS)){const k=baseKeyOf(story)||String(story.link||'');if(!k||story.image||queued.has(k))continue;const cached=articleCache.get(k);if(cached&&Date.now()-cached.at<RETRY_MS){const a=cached.article||{};if(a.image){story.image=a.image;paintImage(story,a.image);}if(a.pubDate&&!story.pubDate)story.pubDate=a.pubDate;if(a.isExclusive)story.isExclusive=true;patchBadges(story);continue;}queued.add(k);queue.push(story);}pump();}
  function ingestState(s){lastState=s||lastState;for(const x of s?.newsStatuses||[]){if(!x?.storyKey&&!x?.baseKey)continue;if(x.storyKey)statusMap.set(x.storyKey,x);if(x.baseKey&&!statusMap.has(x.baseKey))statusMap.set(x.baseKey,x);const story=stories.find(st=>keyOf(st)===x.storyKey||baseKeyOf(st)===x.baseKey);if(story){if(x.isExclusive)story.isExclusive=true;patchBadges(story);}}while(statusMap.size>1000)statusMap.delete(statusMap.keys().next().value);}

  const search=document.querySelector('#search'),filter=document.querySelector('#feedFilter');if(search){search.placeholder='Buscar por titular o bajada…';search.oninput=()=>renderNews0324();}if(filter)filter.onchange=()=>renderNews0324();
  document.querySelector('.nav[data-tab="news"]')?.addEventListener('click',()=>setTimeout(renderNews0324,0));
  window.ECAPI.on('automation:state',s=>ingestState(s));
  window.ECAPI.automationStatus?.().then(s=>{ingestState(s);renderNews0324();}).catch(()=>renderNews0324());
})();
