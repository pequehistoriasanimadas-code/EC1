'use strict';
(function installUxCleanupLab29(){
  if(window.__ecUxCleanupLab29)return;
  const q=s=>document.querySelector(s);
  let tries=0;

  function move(el,to){if(el&&to&&el.parentElement!==to)to.appendChild(el);}
  function installCannedLayout(){
    const tab=q('#tab-canned'),cols=tab?.querySelector(':scope > .cols');
    const program=q('#pickCannedFolder')?.closest('.card');
    const available=q('#cannedList')?.closest('.card');
    const ads=q('#adsLibraryCard');
    if(!tab||!cols||!program||!available||!ads)return false;
    cols.classList.add('ec29-canned-workspace');
    let left=q('#ec29CannedLeft'),right=q('#ec29CannedRight');
    if(!left){left=document.createElement('div');left.id='ec29CannedLeft';left.className='ec29-canned-stack';}
    if(!right){right=document.createElement('div');right.id='ec29CannedRight';right.className='ec29-canned-stack';}
    const preserved=[...cols.children].filter(x=>x!==left&&x!==right&&x!==program&&x!==available&&x!==ads);
    if(left.parentElement!==cols||right.parentElement!==cols)cols.replaceChildren(left,right);
    move(program,left);for(const extra of preserved)move(extra,left);move(available,right);move(ads,right);
    window.__ec29CannedLayout={left:!!q('#ec29CannedLeft'),right:!!q('#ec29CannedRight'),adsOnRight:ads.parentElement===right,preserved:preserved.length};
    return true;
  }

  function install(){
    if(window.__ecUxCleanupLab29)return;
    const ok=installCannedLayout();
    if(!ok&&tries++<100){setTimeout(install,120);return;}
    window.__ecUxCleanupLab29=true;
  }
  install();
})();
