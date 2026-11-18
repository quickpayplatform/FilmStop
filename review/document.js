import {fitSignature} from './signature-layout.mjs?v=2';
import {profileLink,$,api,endpoint,status,text} from './shared.js';
import {getDocument,GlobalWorkerOptions} from './vendor/pdf.mjs';
GlobalWorkerOptions.workerSrc='/review/vendor/pdf.worker.mjs';
const id=new URLSearchParams(location.search).get('gallery');
let gallery,config,completed,fields=[],values={},signature=[],active=null,saving=false,pdf;
let signatureSizes={},previewSignatureSizes={},signatureTarget=null,signatureBefore=[],previewSignatures={};
let requestId=crypto.randomUUID().replaceAll('-','');
const isSetup=()=>gallery?.owner&&!gallery.published;
let addingField=false,draftRevision=0,savedRevision=0,saveTimer,saveQueue=Promise.resolve();
function setAddingField(value){addingField=value;$('add-field').textContent=value?'Cancel adding field':'Add field';$('add-field').setAttribute('aria-pressed',String(value));$('placement-status').textContent=value?'Click an empty area of the PDF to place one field. Press Escape to cancel.':'';document.querySelectorAll('.pdf-page').forEach(page=>page.classList.toggle('preparing',value));}
function saveDraft(){
  if(!isSetup())return Promise.resolve();clearTimeout(saveTimer);
  const revision=draftRevision,payload={fields:structuredClone(fields),values:structuredClone(values),signing:$('purpose').value==='sign'};
  $('draft-status').textContent='Saving draft…';
  saveQueue=saveQueue.catch(()=>{}).then(()=>api('document-layout',id,payload)).then(()=>{savedRevision=revision;$('draft-status').textContent=revision===draftRevision?'All changes saved.':'Saving draft…';});
  return saveQueue;
}
function changed(){if(!isSetup())return;draftRevision++;$('draft-status').textContent='Unsaved changes…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveDraft().catch(e=>{$('draft-status').textContent='Not saved. Use Save draft to retry.';status(e.message);}),700);}
$('add-field').onclick=()=>setAddingField(!addingField);
$('layout-controls').addEventListener('toggle',()=>{if(!$('layout-controls').open)setAddingField(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape')setAddingField(false);});
const report=e=>status(e.message);
function configureSignature(){const canvas=$('signature-pad'),ctx=canvas.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111';}
function redraw(){const c=$('signature-pad'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);configureSignature();for(const stroke of signature){ctx.beginPath();stroke.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p[0]*c.width,p[1]*c.height));ctx.stroke();}renderSignaturePreview();}
function updateFieldList(){ $('field-list').replaceChildren();for(const f of fields){const li=text('li',`Page ${f.page+1} · ${f.label} · ${f.type}${f.required?' · Required':''}`);const remove=text('button','Remove','secondary');remove.type='button';remove.onclick=()=>{fields=fields.filter(x=>x.id!==f.id);delete values[f.id];changed();updateFieldList();renderFields();};li.append(remove);$('field-list').append(li);} }
function paintSignature(canvas,strokes,size=1){
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#111';
  for(const stroke of fitSignature(strokes,canvas.width/6,canvas.height/6,size)){ctx.beginPath();stroke.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p[0]*3+canvas.width/4,p[1]*3+canvas.height/4));ctx.stroke();}
}
function renderSignaturePreview(){
  const f=signatureTarget,page=f&&config?.pages[f.page],canvas=$('signature-preview');if(!page)return;
  const width=f.w*page.width,height=f.h*page.height;canvas.width=Math.round(width*6);canvas.height=Math.round(height*6);canvas.style.aspectRatio=`${width}/${height}`;paintSignature(canvas,signature,Number($('signature-size').value)/100);
  $('signature-size-value').textContent=$('signature-size').value+'%';
}
$('signature-size').oninput=renderSignaturePreview;
function openSignature(field){
  if(saving)return;signatureTarget=field;signatureBefore=structuredClone(signature);
  signature=structuredClone(field?.type==='owner-signature'?config.ownerSignatures?.[field.id]?.signature||[]:isSetup()?previewSignatures[field?.id]||[]:signature);
  $('owner-signer-label').hidden=field?.type!=='owner-signature';
  $('owner-signer-name').value=field?.type==='owner-signature'?config.ownerSignatures?.[field.id]?.name||'':'';
  $('signature-title').textContent=field?.type==='owner-signature'?'Your Film Stop signature':isSetup()?'Preview client signature':'Draw your signature';
  $('signature-help').textContent=field?.type==='owner-signature'?'Draw your signature and adjust its size below. Use signature saves your changes to this document.':isSetup()?'Preview how clients will draw here. This preview does not sign the agency’s line.':'Use your finger, mouse, or stylus. Then choose Use signature to place it on the document.';
  $('signature-size').value=Math.round(100*(field?.type==='owner-signature'?config.ownerSignatures?.[field.id]?.size??1:isSetup()?previewSignatureSizes[field?.id]??1:signatureSizes[field?.id]??1));
  $('signature-error').textContent='';$('signature-dialog').showModal();redraw();
}
function renderFields(){
  document.querySelectorAll('.pdf-field').forEach(e=>e.remove());
  for(const f of fields){const page=$('pdf-pages').children[f.page];if(!page)continue;let el;
    if(['signature','owner-signature'].includes(f.type) && !completed){
      el=text('button',f.type==='owner-signature'?'Sign here · Film Stop':isSetup()?'Preview client signature':'Click to sign','signature-trigger');el.type='button';el.setAttribute('aria-label',f.label+' — draw signature');el.onclick=e=>{e.stopPropagation();openSignature(f);};
      const strokes=f.type==='owner-signature'?config.ownerSignatures?.[f.id]?.signature:isSetup()?previewSignatures[f.id]:signature;
      if(strokes?.length){el.textContent='';const canvas=document.createElement('canvas');canvas.width=Math.round(f.w*config.pages[f.page].width*6);canvas.height=Math.round(f.h*config.pages[f.page].height*6);el.classList.add('has-signature');el.append(canvas);paintSignature(canvas,strokes,f.type==='owner-signature'?config.ownerSignatures?.[f.id]?.size??1:isSetup()?previewSignatureSizes[f.id]??1:signatureSizes[f.id]??1);el.setAttribute('aria-label',f.label+' — edit signature');}
    }else if(completed){el=text('div',completed?f.type==='signature'?'':String(values[f.id]||''):f.label,'field-marker');}
    else {el=document.createElement('input');el.type=f.type==='radio'?'radio':f.type==='checkbox'?'checkbox':f.type==='date'?'date':'text';el.required=f.required;el.maxLength=300;el.setAttribute('aria-label',`${f.label}${f.required?' (required)':''}`);if(!isSetup())el.setAttribute('form','complete-document');el.placeholder=f.label;el.title=f.label;if(f.type==='radio')el.name=`choice-${f.group}`;
      if(['checkbox','radio'].includes(f.type)){el.checked=values[f.id]===true;values[f.id]=el.checked;}else{el.value=values[f.id]||'';values[f.id]=el.value;}el.oninput=()=>{if(f.type==='radio'){for(const other of fields.filter(x=>x.type==='radio' && x.group===f.group))values[other.id]=other.id===f.id;}else values[f.id]=f.type==='checkbox'?el.checked:el.value;changed();};}
    el.addEventListener('click',event=>{event.stopPropagation();if(addingField)setAddingField(false);});
    el.classList.add('pdf-field');if(['signature','owner-signature'].includes(f.type))el.classList.add('signature-marker');Object.assign(el.style,{left:`${f.x*100}%`,top:`${f.y*100}%`,width:`${f.w*100}%`,height:`${f.h*100}%`,fontSize:`${Math.min(14,f.h*config.pages[f.page].height*.6)}px`});page.append(el);
  }
}
async function renderPDF(done=false){
  $('pdf-pages').replaceChildren();if(pdf)await pdf.destroy();
  pdf=await getDocument({url:endpoint('document-file',id,{completed:done?'1':'0'}),isEvalSupported:false}).promise;
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
    const page=await pdf.getPage(pageNo),viewport=page.getViewport({scale:1.5});
    const shell=text('div','','pdf-page');shell.style.aspectRatio=`${viewport.width}/${viewport.height}`;shell.setAttribute('aria-label',`Page ${pageNo} of ${pdf.numPages}`);
    const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;shell.append(canvas);$('pdf-pages').append(shell);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    if(isSetup()){shell.onclick=event=>{
      if(!addingField || event.target.closest('.pdf-field') || $('purpose').value==='read')return;
      if(fields.length>=50)return status('Use up to 50 fields.');
      const label=$('field-label').value.trim();if(!label)return status('Enter a field label.');
      const rect=shell.getBoundingClientRect(),w=Number($('field-width').value)/100,h=Number($('field-height').value)/100;
      if(!Number.isFinite(w)||!Number.isFinite(h)||w<.03||w>.9||h<.02||h>.3)return status('Use a width of 3–90% and height of 2–30%.');
      const group=$('choice-group').value.trim();if($('field-type').value==='radio' && !/^[a-zA-Z0-9_-]{1,40}$/.test(group))return status('Enter a choice group such as payment.');
      const f={group,id:crypto.randomUUID().replaceAll('-',''),page:pageNo-1,type:$('field-type').value,label,required:$('field-required').checked,w,h,x:Math.min(1-w,Math.max(0,(event.clientX-rect.left)/rect.width)),y:Math.min(1-h,Math.max(0,(event.clientY-rect.top)/rect.height))};
      fields.push(f);setAddingField(false);changed();updateFieldList();renderFields();status('Field added. Click it to fill it out.');
    };}
  }
  if(!done)renderFields();
}
async function load(){
  gallery=await api('gallery',id);profileLink(gallery);const state=await api('document-config',id);config=state.config;completed=state.completed;fields=config?.fields||[];values={...(config?.prefill||{}),...values};
  $('access').hidden=true;$('document-review').hidden=false;$('document-title').textContent=gallery.title;$('client-name').textContent=gallery.client;$('owner-back').hidden=!gallery.owner;
  $('setup').hidden=!isSetup();$('owner-share').hidden=!gallery.owner||!gallery.published;
  $('document-link').value=`${location.origin}/review/document.html?gallery=${id}`;
  $('download-filled').hidden=!config;$('download-filled').textContent=completed?'Download signed PDF':config?.signing===false?'Download PDF':'Download filled PDF';
  $('complete-document').hidden=isSetup()||!config?.signing||Boolean(completed);
  $('completion').hidden=!completed;if(completed)$('completion-details').textContent=`Submitted by ${completed.name} · ${new Date(completed.submitted).toLocaleString()}`;
  $('document-instructions').textContent=isSetup()?'Click the highlighted fields to fill out this draft. Entries save automatically. Click your signature box to sign.':completed?'Here is the completed copy saved for you and Film Stop.':config?.signing?'Review every page, fill in the highlighted fields, then sign and submit below.':'Review your document below or download a copy.';
  $('pdf-file').disabled=Boolean(config);$('purpose').disabled=!config;$('publish-document').disabled=!config;$('save-layout').disabled=!config;
  if(isSetup()){$('purpose').value=config?.signing===false?'read':'sign';$('field-tools').hidden=$('purpose').value==='read';}
  if(config){$('pdf-file').closest('label').hidden=true;await renderPDF(Boolean(completed));updateFieldList();}
}
$('download-filled').onclick=async()=>{
  const button=$('download-filled');button.disabled=true;
  try{
    if(isSetup())await saveDraft();
    const response=await fetch(endpoint('document-export',id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values,signature:isSetup()?[]:signature,signatureSizes})});
    if(!response.ok){const result=await response.json();throw new Error(result.error||'Unable to download the filled PDF.');}
    const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`filmstop-${completed?'signed':'filled'}-${id}.pdf`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);status('Downloaded the PDF with your current entries and saved signatures.');
  }catch(e){report(e);}finally{button.disabled=false;}
};
$('unlock').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{await api('unlock',id,{passcode:new FormData(e.target).get('passcode')});await load();status('');}catch(e){report(e);}finally{e.submitter.disabled=false;}};
$('pdf-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;e.target.disabled=true;try{if(file.size>3*1024*1024)throw new Error('Use a PDF up to 3 MB.');const response=await fetch(endpoint('document-upload',id,{filename:file.name}),{method:'POST',headers:{'Content-Type':'application/pdf'},body:file});const result=await response.json();if(!response.ok)throw new Error(result.error);await load();status('PDF uploaded. Add fields on the preview.');}catch(e){report(e);$('pdf-file').disabled=Boolean(config);}};
$('purpose').onchange=()=>{setAddingField(false);changed();$('field-tools').hidden=$('purpose').value==='read';if($('purpose').value==='read'){fields=[];updateFieldList();renderFields();}};
$('field-type').onchange=()=>{const type=$('field-type').value;$('field-label').value={text:'Full name',date:'Date',checkbox:'I agree',radio:'Option',signature:'Client signature','owner-signature':'Film Stop signature'}[type];$('choice-group-label').hidden=type!=='radio';$('field-width').value=['checkbox','radio'].includes(type)?3:40;$('field-height').value=['signature','owner-signature'].includes(type)?9:['checkbox','radio'].includes(type)?2:4;};
$('save-layout').onclick=async()=>{$('save-layout').disabled=true;try{await saveDraft();status('Draft saved.');}catch(e){report(e);}finally{$('save-layout').disabled=false;}};
$('publish-document').onclick=async()=>{if(!confirm('Publish this PDF and freeze its fields?'))return;$('publish-document').disabled=true;try{await saveDraft();await api('document-publish',id,{signing:$('purpose').value==='sign',fields});await load();status('Published. Share the client link and passcode.');}catch(e){report(e);$('publish-document').disabled=false;}};
$('copy-document-link').onclick=async()=>{try{await navigator.clipboard.writeText($('document-link').value);status('Client link copied.');}catch{$('document-link').select();status('Select and copy the link above.');}};
const pad=$('signature-pad');configureSignature();
function point(e){const r=pad.getBoundingClientRect();return [Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))];}
pad.onpointerdown=e=>{if(saving)return;pad.setPointerCapture(e.pointerId);active=[point(e)];signature.push(active);e.preventDefault();};
pad.onpointermove=e=>{if(!active)return;if(signature.reduce((n,s)=>n+s.length,0)>=4000){active=null;status('Signature pad is full. Clear it to draw again.');return;}const p=point(e),last=active.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])>.002){active.push(p);redraw();}};
const finish=()=>{if(active?.length<2)signature=signature.filter(s=>s!==active);active=null;redraw();};pad.onpointerup=finish;pad.onpointercancel=finish;
$('clear-signature').onclick=()=>{if(saving)return;signature=[];active=null;redraw();};
$('open-signature').onclick=()=>openSignature(fields.find(f=>f.type==='signature'));
function cancelSignature(){signature=signatureBefore;active=null;$('signature-dialog').close();}
$('cancel-signature').onclick=cancelSignature;
$('signature-dialog').addEventListener('cancel',e=>{e.preventDefault();if(!saving)cancelSignature();});
$('apply-signature').onclick=async()=>{
  if(signature.flat().length<5){$('signature-error').textContent='Please draw your signature first.';return;}
  if(signatureTarget?.type==='owner-signature'){
    const name=$('owner-signer-name').value.trim();if(!name){$('signature-error').textContent='Enter your full name.';return;}
    saving=true;$('apply-signature').disabled=true;$('cancel-signature').disabled=true;
    try{await saveDraft();await api('document-owner-signature',id,{fieldId:signatureTarget.id,signature,name,size:Number($('signature-size').value)/100});signature=signatureBefore;$('signature-dialog').close();await load();status(gallery.published?'Your signature proportions and size have been updated.':'Your signature is saved to the draft. Publishing will place it on the shared PDF.');}
    catch(e){$('signature-error').textContent=e.message;}finally{saving=false;$('apply-signature').disabled=false;$('cancel-signature').disabled=false;}
  }else{
    if(isSetup()){previewSignatureSizes[signatureTarget.id]=Number($('signature-size').value)/100;previewSignatures[signatureTarget.id]=structuredClone(signature);signature=signatureBefore;}
    else{signatureSizes[signatureTarget.id]=Number($('signature-size').value)/100;$('signature-summary').textContent='Signature added. Click the signature box to change it.';$('open-signature').textContent='Edit signature';}
    $('signature-dialog').close();renderFields();
  }
};
$('complete-document').onsubmit=async e=>{e.preventDefault();if(saving)return;if(signature.flat().length<5){openSignature(fields.find(f=>f.type==='signature'));return;}saving=true;e.submitter.disabled=true;status('Saving your completed document…');const data=new FormData(e.target);try{await api('document-submit',id,{requestId,name:data.get('name'),email:data.get('email'),consent:data.get('consent')==='on',signature,signatureSizes,values});await load();status('Your completed document has been saved.');$('completion').scrollIntoView({behavior:'smooth'});}catch(e){report(e);}finally{saving=false;$('submit-document').disabled=false;}};
window.addEventListener('beforeunload',e=>{if(saving||(!completed&&(isSetup()?draftRevision!==savedRevision:signature.length||Object.values(values).some(Boolean)))){e.preventDefault();e.returnValue='';}});
load().catch(e=>{if(e.status!==401)report(e);});
