'use strict';
(function installImageHydration0324(){
  if(typeof renderNews!=='function'||!Array.isArray(stories)||!window.ECAPI?.fetchArticle){setTimeout(installImageHydration0324,100);return;}
  if(window.__ec0324ImageHydrationInstalled)return;window.__ec0324ImageHydrationInstalled=true;

  const CONCURRENCY=3,MAX_VISIBLE_PER_PASS=80,RETRY_MS=10*60*1000;
  const cache=new Map(),queued=new Set();let queue=[],active=0;
  const keyOf=s=>String(s?.link||'').trim();
  function visibleStories(){const q=(document.querySelector('#search')?.value||'').toLowerCase(),ff=document.querySelector('#feedFilter')?.value||'';return stories.filter(s=>(!ff||s.feedId===ff)&&(!q||`${s.title||''} ${s.description||''}`.toLowerCase().includes(q)));}
  function paint(link,image){if(!link||!image)return;document.querySelectorAll('#newsList .newsItem').forEach(el=>{if(el.dataset.storyLink!==link)return;const thumb=el.querySelector('.thumb');if(thumb)thumb.style.backgroundImage=`url(${JSON.stringify(image)})`;el.classList.remove('image-resolving','image-missing');el.classList.add('image-resolved');});}
  function markCards(){const visible=visibleStories(),nodes=[...document.querySelectorAll('#newsList .newsItem')];nodes.forEach((el,i)=>{const s=visible[i];if(!s)return;const link=keyOf(s);el.dataset.storyLink=link;if(s.image)paint(link,s.image);else el.classList.add('image-resolving');});}
  function remember(link,image){cache.set(link,{image:String(image||''),at:Date.now()});while(cache.size>500)cache.delete(cache.keys().next().value);}
  async function resolveOne(story){const link=keyOf(story);try{const c=cache.get(link);if(c&&Date.now()-c.at<RETRY_MS){if(c.image){story.image=c.image;paint(link,c.image);}return;}const article=await window.ECAPI.fetchArticle(link),image=String(article?.image||'').trim();remember(link,image);if(image){for(const s of stories)if(keyOf(s)===link&&!s.image)s.image=image;paint(link,image);}else{document.querySelectorAll('#newsList .newsItem').forEach(el=>{if(el.dataset.storyLink===link){el.classList.remove('image-resolving');el.classList.add('image-missing');}});}}catch{remember(link,'');document.querySelectorAll('#newsList .newsItem').forEach(el=>{if(el.dataset.storyLink===link){el.classList.remove('image-resolving');el.classList.add('image-missing');}});}finally{queued.delete(link);active--;pump();}}
  function pump(){while(active<CONCURRENCY&&queue.length){const story=queue.shift();if(!story)continue;active++;resolveOne(story);}}
  function schedule(){markCards();for(const story of visibleStories().slice(0,MAX_VISIBLE_PER_PASS)){const link=keyOf(story);if(!link||story.image||queued.has(link))continue;const c=cache.get(link);if(c&&Date.now()-c.at<RETRY_MS){if(c.image){story.image=c.image;paint(link,c.image);}continue;}queued.add(link);queue.push(story);}pump();}

  const baseRenderNews=renderNews;
  renderNews=function(){baseRenderNews();schedule();};
  schedule();
})();
