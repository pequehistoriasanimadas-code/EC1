'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {ProfileManager0329}=require('../src/services/profileManager0329');

const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const renderer=read('src/renderer-youtube-promo.js');
const service=read('src/services/releaseV2YoutubePromo.js');

// La capacidad de Promo YouTube debe sobrevivir a reconstrucciones del DOM/cambios de perfil.
assert(renderer.includes('ensureYoutubePromoCapability'),'Promo YouTube debe tener un reconciliador explícito de capacidad global');
assert(renderer.includes('youtubeCapabilityObserver')&&renderer.includes('MutationObserver'),'Promo YouTube debe vigilar reconstrucciones de la pestaña Contenidos');
assert(renderer.includes('scheduleYoutubeCapabilityRecovery'),'El cambio de perfil debe reintentar la recuperación de controles y acciones');
assert(/profile:changed[\s\S]{0,220}scheduleYoutubeCapabilityRecovery/.test(renderer),'Cambiar de perfil debe recuperar Promo YouTube aunque la UI se reconstruya después del evento');
assert(renderer.includes("q('#ecYoutubePromoControls')")&&renderer.includes("q('#cannedList')"),'La recuperación debe comprobar controles globales y lista de contenidos');
assert(renderer.includes(".ec-yt-link-state"),'La capacidad global debe comprobar que cada lista renderizada exponga Vincular/Vinculado');

// La API Key sigue siendo de la máquina, no del perfil.
assert(service.includes("youtube-promo-machine.json"),'La API Key de YouTube debe seguir guardándose globalmente por equipo');
assert(service.includes('sanitizePromoForProfile'),'Los datos de promo persistidos en settings deben seguir siendo seguros por perfil');

// Los vínculos siguen aislados por perfil: EC no debe contaminar Gestión.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gec-yt-profile-capability-'));
try{
  const defaults={canned:{youtubePromo:{enabled:false,leadSeconds:10,links:{},videos:{}}},visual:{theme:{},queueColors:{}},ai:{},tts:{},documents:{processed:{}},automation:{},rssFeeds:[]};
  const m=new ProfileManager0329(root);
  const ec=m.create({name:'EC',color:'#F7C600',defaults});
  const gestion=m.create({name:'Gestión',color:'#7A1730',defaults});
  m.activate(ec.id);
  let s=m.effectiveSettings(defaults);
  s.canned.youtubePromo={enabled:true,leadSeconds:7,links:{contenido_ec:{videoId:'abc123XYZ'}},videos:{abc123XYZ:{title:'EC'}}};
  m.saveEffective(defaults,s);
  m.activate(gestion.id);
  s=m.effectiveSettings(defaults);
  assert.deepStrictEqual(s.canned.youtubePromo.links,{},'Gestión no debe heredar vínculos de EC');
  s.canned.youtubePromo={enabled:true,leadSeconds:5,links:{contenido_gestion:{videoId:'def456XYZ'}},videos:{def456XYZ:{title:'Gestión'}}};
  m.saveEffective(defaults,s);
  m.activate(ec.id);
  s=m.effectiveSettings(defaults);
  assert(s.canned.youtubePromo.links.contenido_ec,'EC debe recuperar sus propios vínculos');
  assert(!s.canned.youtubePromo.links.contenido_gestion,'EC no debe recibir vínculos de Gestión');
}finally{fs.rmSync(root,{recursive:true,force:true});}

console.log('check-v2lab-youtube-profile-capability-lab29: OK · capacidad global visible + vínculos aislados por perfil');
