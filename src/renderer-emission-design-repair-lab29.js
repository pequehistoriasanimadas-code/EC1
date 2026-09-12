'use strict';
(function installEmissionDesignRepairLab29(){
  if(window.__ecEmissionDesignRepairLab29)return;
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
  const clamp=(v,a,b,f=a)=>Math.max(a,Math.min(b,Number.isFinite(Number(v))?Number(v):f));
  const weightFor=v=>({regular:400,medium:500,semibold:600,bold:700,extrabold:800,black:900,italic:400,bolditalic:700}[String(v||'regular')]||400);
  const italicFor=v=>/italic/i.test(String(v||''));
  let scheduled=false,resizeObserver=null,installTimer=null;

  function rgba(hex,a){
    const h=String(hex||'#000000').replace('#',''),n=parseInt(h,16),alpha=clamp(a,0,1,0);
    return Number.isNaN(n)?`rgba(0,0,0,${alpha})`:`rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;
  }
  function format(){return q('#outputFormat')?.value==='9:16'?'9:16':'16:9';}
  function val(id,fallback=''){const el=q(id);return el&&el.value!==''?el.value:fallback;}
  function checked(id,fallback=true){const el=q(id);return el?el.checked!==false:fallback;}

  function ensurePreviewLayers(){
    const stage=q('#ecV2PreviewStage'),media=stage?.querySelector('.ec-v2-preview-media');
    if(!stage||!media)return false;
    let img=q('#ecV2PreviewImage');
    if(!img){img=document.createElement('img');img.id='ecV2PreviewImage';img.className='ec-v2-preview-image';img.alt='';media.appendChild(img);}
    let shade=q('#ecV2NoteShade');
    if(!shade){shade=document.createElement('div');shade.id='ecV2NoteShade';shade.className='ec-v2-note-shade';const guide=q('#ecV2SafeGuide');stage.insertBefore(shade,guide||q('#ecV2NotePreview')||null);}
    return true;
  }

  function iconifyLabel(label,icon,title){
    if(!label)return;
    const input=label.querySelector('input');if(!input)return;
    label.classList.add('ec-v2-bg-icon-control');label.title=title;
    input.setAttribute('aria-label',title);
    let mark=label.querySelector('.ec-v2-bg-control-icon');
    if(!mark){mark=document.createElement('span');mark.className='ec-v2-bg-control-icon';mark.setAttribute('aria-hidden','true');label.insertBefore(mark,input);}
    mark.textContent=icon;
    [...label.childNodes].forEach(node=>{if(node.nodeType===Node.TEXT_NODE&&String(node.nodeValue||'').trim())node.nodeValue='';});
  }

  function compactBackgroundControls(){
    qa('#ecEmissionV2NoteCard .ec-v2-bg-item').forEach(item=>{
      const name=item.querySelector(':scope>b');
      if(name&&/Franja inferior/i.test(name.textContent||''))name.textContent='Degradado inferior';
      const color=[...item.querySelectorAll(':scope>label')].find(x=>x.querySelector('input[type="color"]'));
      const radius=[...item.querySelectorAll(':scope>label')].find(x=>/Radius$/i.test(x.querySelector('input')?.id||''));
      iconifyLabel(color,'■',`Color de ${name?.textContent||'fondo'}`);
      iconifyLabel(radius,'▢',`Esquinas de ${name?.textContent||'casilla'}`);
      const opacity=item.querySelector(':scope>.ec-v2-slider-row');
      if(opacity){
        opacity.classList.add('ec-v2-opacity-control');
        const label=opacity.querySelector(':scope>label');
        if(label){label.textContent='◐';label.title=`Opacidad de ${name?.textContent||'fondo'}`;label.setAttribute('aria-label',label.title);}
        const number=opacity.querySelector('.ec-v2-number-suffix');if(number)number.classList.add('ec-v2-opacity-value');
      }
    });
  }

  function sourceImage(){
    try{if(typeof effectiveImage==='function'){const src=effectiveImage();if(src)return String(src);}}catch{}
    for(const el of [q('#designPreviewImg'),q('#previewImg')]){const src=String(el?.currentSrc||el?.src||'');if(src&&!src.endsWith('/'))return src;}
    return '';
  }

  function fitStage(){
    const host=q('#ecEmissionV2PreviewCard .ec-v2-preview-host'),stage=q('#ecV2PreviewStage');if(!host||!stage)return;
    const vertical=format()==='9:16',w=vertical?1080:1920,h=vertical?1920:1080,pad=12,innerW=Math.max(1,host.clientWidth-pad*2);
    const maxVisualH=vertical?Math.min(640,Math.max(360,window.innerHeight*.64)):Math.min(520,Math.max(260,window.innerHeight*.52));
    const scale=Math.max(.01,Math.min(innerW/w,maxVisualH/h));
    const visualW=w*scale,visualH=h*scale,left=pad+Math.max(0,(innerW-visualW)/2);
    stage.style.width=`${w}px`;stage.style.height=`${h}px`;stage.style.left=`${left}px`;stage.style.top=`${pad}px`;stage.style.transform=`scale(${scale})`;stage.style.transformOrigin='0 0';
    const target=Math.ceil(visualH+pad*2);if(host.style.height!==`${target}px`)host.style.height=`${target}px`;
  }

  function styleText(el,prefix,fallbackSize){
    if(!el)return;
    const family=val(`#ecV2-${prefix}-family`,'Arial'),variant=val(`#ecV2-${prefix}-variant`,'regular'),size=clamp(val(`#ecV2-${prefix}-size`,fallbackSize),8,140,fallbackSize),color=val(`#ecV2-${prefix}-color`,'#FFFFFF'),upper=q(`#ecV2-${prefix}-upper`)?.classList.contains('active');
    el.style.fontFamily=`"${family}",sans-serif`;el.style.fontSize=`${size}px`;el.style.fontWeight=String(weightFor(variant));el.style.fontStyle=italicFor(variant)?'italic':'normal';el.style.color=color;el.style.textTransform=upper?'uppercase':'none';
  }

  function repairPreview(){
    if(!ensurePreviewLayers())return false;
    compactBackgroundControls();fitStage();
    const stage=q('#ecV2PreviewStage'),np=q('#ecV2NotePreview'),shade=q('#ecV2NoteShade'),img=q('#ecV2PreviewImage'),media=stage.querySelector('.ec-v2-preview-media'),vertical=format()==='9:16';
    const src=sourceImage();if(src){if(img.src!==src)img.src=src;img.classList.remove('hidden');media.classList.add('has-image');}else{img.removeAttribute('src');img.classList.add('hidden');media.classList.remove('has-image');}
    if(!np||!shade)return true;
    const noteVisible=!np.classList.contains('hidden');shade.style.display=noteVisible?'block':'none';
    const lowerColor=val('#ecV2LowerBg','#000000'),lowerOpacity=clamp(Number(val('#ecV2LowerOpacity-number',88))/100,0,1,.88);
    shade.style.background=`linear-gradient(transparent ${vertical?38:42}%,${rgba(lowerColor,lowerOpacity)} 100%)`;
    np.style.background='transparent';np.style.borderRadius='0';np.style.padding='0';np.style.left=vertical?'70px':'64px';np.style.right=vertical&&checked('#tiktokSafe',true)?'205px':vertical?'70px':'64px';np.style.bottom=vertical&&checked('#tiktokSafe',true)?'420px':vertical?'95px':'54px';np.style.maxHeight=vertical&&checked('#tiktokSafe',true)?'1180px':'72%';
    const meta=np.querySelector('.ec-v2-note-meta');if(meta){meta.style.gap='22px';meta.style.marginBottom='15px';}
    const cat=q('#ecV2PreviewCat'),date=q('#ecV2PreviewDate'),ex=q('#ecV2PreviewExclusive'),title=q('#ecV2PreviewTitle'),summary=q('#ecV2PreviewSummary');
    if(cat){cat.style.display=checked('#ecV2-category-visible',true)?'inline-flex':'none';cat.style.background=rgba(val('#ecV2CategoryBg','#F7C600'),clamp(Number(val('#ecV2CategoryOpacity-number',100))/100,0,1,1));cat.style.borderRadius=`${clamp(val('#ecV2CategoryRadius',0),0,40,0)}px`;cat.style.padding=vertical?'10px 14px':'10px 15px';cat.style.lineHeight='1';}
    if(date){date.style.display=checked('#ecV2-date-visible',true)?'inline-block':'none';date.style.lineHeight='1';date.style.whiteSpace='nowrap';}
    if(ex){ex.style.display=checked('#ecV2-exclusive-visible',true)?'inline-flex':'none';ex.style.background=rgba(val('#ecV2ExclusiveBg','#F7C600'),clamp(Number(val('#ecV2ExclusiveOpacity-number',100))/100,0,1,1));ex.style.borderRadius=`${clamp(val('#ecV2ExclusiveRadius',5),0,40,5)}px`;ex.style.padding='9px 13px';ex.style.lineHeight='1';}
    styleText(cat,'category',28);styleText(date,'date',27);styleText(ex,'exclusive',24);styleText(title,'title',70);styleText(summary,'summary',34);
    if(title){title.style.lineHeight='1.02';title.style.marginBottom='0';title.style.maxWidth=vertical?'100%':'1580px';}
    if(summary){summary.style.lineHeight='1.24';summary.style.marginTop='14px';summary.style.maxWidth=vertical?'100%':'1500px';}
    return true;
  }

  function scheduleRepair(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;repairPreview();});}
  function install(){
    if(!q('#ecV2PreviewStage')){installTimer=setTimeout(install,120);return;}
    if(window.__ecEmissionDesignRepairLab29)return;window.__ecEmissionDesignRepairLab29=true;
    repairPreview();setTimeout(scheduleRepair,250);setTimeout(scheduleRepair,900);
    document.addEventListener('input',e=>{if(e.target?.closest?.('#tab-emission'))scheduleRepair();});
    document.addEventListener('change',e=>{if(e.target?.closest?.('#tab-emission'))scheduleRepair();});
    document.addEventListener('click',e=>{if(e.target?.closest?.('#tab-emission'))setTimeout(scheduleRepair,0);});
    window.addEventListener('resize',scheduleRepair);
    try{window.ECAPI?.on?.('profile:changed',()=>setTimeout(scheduleRepair,120));}catch{}
    const host=q('#ecEmissionV2PreviewCard .ec-v2-preview-host');if(host&&typeof ResizeObserver==='function'){resizeObserver=new ResizeObserver(scheduleRepair);resizeObserver.observe(host);}
  }
  install();
})();
