import {fitSignature,signatureSize} from '../../review/signature-layout.mjs';
import { PDFDocument, PDFSignature, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fontBytes from './document-font.mjs';
import { createHash } from 'node:crypto';
const digest = bytes => createHash('sha256').update(bytes instanceof ArrayBuffer?Buffer.from(bytes):bytes).digest('hex');
const types = ['text', 'date', 'checkbox', 'radio', 'signature', 'owner-signature'];
export function validateFields(fields, pages, check) {
  check(Array.isArray(fields) && fields.length <= 50, 'Add up to 50 fields.');
  const ids = new Set();
  return fields.map(f => {
    check(f && /^[a-f0-9]{32}$/.test(f.id || '') && !ids.has(f.id), 'Invalid or duplicate field.'); ids.add(f.id);
    check(types.includes(f.type), 'Invalid field type.');
    check(typeof f.label === 'string' && f.label.trim().length > 0 && f.label.length <= 80, 'Give each field a label.');
    check(Number.isInteger(f.page) && f.page >= 0 && f.page < pages.length, 'Invalid page.');
    check([f.x,f.y,f.w,f.h].every(Number.isFinite) && f.x >= 0 && f.y >= 0 && f.w >= .025 && f.h >= .015 && f.x + f.w <= 1.001 && f.y + f.h <= 1.001, 'Keep fields inside the page.');
    if(f.type==='radio') check(typeof f.group==='string' && /^[a-zA-Z0-9_-]{1,40}$/.test(f.group),'Give choice fields a group using letters, numbers, or hyphens.');
    return { ...(f.type==='radio'?{group:f.group}:{}), id:f.id, type:f.type, label:f.label.trim(), required:Boolean(f.required), page:f.page, x:f.x, y:f.y, w:f.w, h:f.h };
  });
}
export function validateDraftValues(values, fields, check) {
  check(values && typeof values==='object' && !Array.isArray(values),'Invalid draft entries.');
  const clean={};
  for(const field of fields){
    if(['signature','owner-signature'].includes(field.type) || !(field.id in values))continue;
    const value=values[field.id];
    if(['checkbox','radio'].includes(field.type)){check(typeof value==='boolean',`${field.label}: choose a valid option.`);clean[field.id]=value;}
    else {check(typeof value==='string' && value.length<=300 && !/[\r\n\x00-\x1f]/.test(value),`${field.label}: use a single line of up to 300 characters.`);if(field.type==='date' && value)check(/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value)),`${field.label}: enter a valid date.`);clean[field.id]=value;}
  }
  for(const group of new Set(fields.filter(f=>f.type==='radio').map(f=>f.group)))check(fields.filter(f=>f.type==='radio'&&f.group===group&&clean[f.id]===true).length<=1,`Choose only one option for ${group}.`);
  return clean;
}
function checked(check, condition, message) { check(condition, message); }
export function validateSignature(strokes, check) {
  checked(check, Array.isArray(strokes) && strokes.length > 0 && strokes.length <= 100, 'Draw your signature.');
  let points = 0;
  for (const stroke of strokes) {
    checked(check, Array.isArray(stroke) && stroke.length >= 2, 'Draw your signature with a continuous stroke.'); points += stroke.length;
    for (const p of stroke) checked(check, Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 1), 'Invalid signature.');
  }
  checked(check, points >= 5 && points <= 4000, 'Draw a signature of up to 4,000 points.');
  const all=strokes.flat();
  checked(check, Math.max(...all.map(p=>p[0]))-Math.min(...all.map(p=>p[0])) > .03, 'Draw your signature across the signature pad.');
  return strokes;
}
function drawSignature(page, strokes, box, size=1) {
  const fitted=fitSignature(strokes,box.w,box.h,signatureSize(size));
  for(const stroke of fitted)for(let i=1;i<stroke.length;i++)page.drawLine({start:{x:box.x+stroke[i-1][0],y:box.y+box.h-stroke[i-1][1]},end:{x:box.x+stroke[i][0],y:box.y+box.h-stroke[i][1]},thickness:1,color:rgb(.05,.05,.05)});
}
async function producerSource(store,id,draft,fields){
  const source=await store.get(`document-source/${id}`,{type:'arrayBuffer'});const pdf=await PDFDocument.load(source);
  for(const f of fields.filter(f=>f.type==='owner-signature')){const mark=draft.ownerSignatures[f.id],page=pdf.getPage(f.page),{width,height}=page.getSize();drawSignature(page,mark.signature,{x:f.x*width,y:(1-f.y-f.h)*height,w:f.w*width,h:f.h*height},mark.size??1);}
  const bytes=await pdf.save(),sourceHash=digest(bytes);await store.set(`document-published-source/${id}/${sourceHash}`,new Blob([bytes],{type:'application/pdf'}),{onlyIfNew:true,metadata:{type:'application/pdf'}});return sourceHash;
}
export async function completedPDF(source, config, data, title, id, time, check, {receipt:includeReceipt=true}={}) {
  const doc=await PDFDocument.load(source); doc.registerFontkit(fontkit);
  const font=await doc.embedFont(fontBytes,{subset:true});
  const glyphs=new Set(font.getCharacterSet());
  check([...data.name,...data.email,...title].every(c=>glyphs.has(c.codePointAt(0))), 'A name or title contains characters this PDF font cannot display.');
  const signatures=config.fields.filter(f=>f.type==='signature');
  if(signatures.length) validateSignature(data.signature,check);
  check(data.values && typeof data.values === 'object' && !Array.isArray(data.values), 'Complete the document fields.');
  check(Object.keys(data.values).every(key=>config.fields.some(f=>f.id===key && f.type!=='signature')), 'Unknown document field.');
  const cleaned={};
  for(const group of new Set(config.fields.filter(f=>f.type==='radio').map(f=>f.group))){const choices=config.fields.filter(f=>f.type==='radio' && f.group===group);const selected=choices.filter(f=>data.values[f.id]===true);check(selected.length<=1 && (!choices.some(f=>f.required)||selected.length===1),`Choose one option for ${group}.`);}
  for(const field of config.fields) {
    if(field.type==='owner-signature')continue;
    const page=doc.getPage(field.page), {width,height}=page.getSize();
    const box={x:field.x*width,y:(1-field.y-field.h)*height,w:field.w*width,h:field.h*height};
    if(field.type==='signature') { drawSignature(page,data.signature,box,data.signatureSizes?.[field.id]??1); continue; }
    const value=data.values[field.id];
    if(['checkbox','radio'].includes(field.type)) { check(typeof value==='boolean','Check each required box.'); check(field.type==='radio'||!field.required||value,`${field.label} is required.`); cleaned[field.id]=value; if(value) page.drawText('X',{x:box.x+2,y:box.y+2,size:Math.min(box.h-3,14),font}); continue; }
    check(typeof value==='string' && value.length<=300 && !/[\r\n\x00-\x1f]/.test(value),`${field.label}: enter a single line, up to 300 characters.`);
    check(!field.required || value.trim().length>0,`${field.label} is required.`);
    if(field.type==='date' && value) check(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)),`${field.label}: enter a valid date.`);
    const text=value.trim(); cleaned[field.id]=text;
    check([...text].every(c=>glyphs.has(c.codePointAt(0))),`${field.label}: this PDF font does not support one of these characters.`);
    const size=Math.min(12,box.h*.6, text ? (box.w-4)/Math.max(font.widthOfTextAtSize(text,1),.1) :12);
    check(size>=6 || !text,`${field.label}: shorten the text so it fits legibly.`);
    if(text) page.drawText(text,{x:box.x+2,y:box.y+(box.h-size)/2+1,size,font,color:rgb(.05,.05,.05)});
  }
  // A separate receipt leaves the contract's original page layout intact.
  if(includeReceipt){
  const receipt=doc.addPage([612,792]);
  const lines=['Film Stop | Document completion record',title,`Review ID: ${id}`,`Completed by: ${data.name.trim()}`,`Email (provided by signer): ${data.email.trim()}`,`Submitted (UTC): ${time}`,'','Source PDF SHA-256:',digest(source),'','Consent: I have reviewed this document and agree to use','my electronic signature and submit this completed copy.','','This record documents a passcode-protected submission.','The signer name and email were supplied by the signer.'];
  let y=740; for (const line of lines) { // Wrap long titles and email addresses without clipping.
    let remaining=line; while(remaining.length) { let length=remaining.length; while(font.widthOfTextAtSize(remaining.slice(0,length),10)>510) length--; receipt.drawText(remaining.slice(0,length),{x:50,y,size:10,font}); remaining=remaining.slice(length); y-=17; } if(!line)y-=17;
  }
  }
  doc.setTitle(`${title} — ${includeReceipt?'completed':'filled'}`); doc.setModificationDate(new Date(time));
  const bytes=await doc.save(); return {bytes,values:cleaned};
}
export async function documentAction({action,request,url,id,gallery,owner,store,body,check,json,headers}) {
  if(!action?.startsWith('document-')) return null;
  check(gallery.kind==='document','Document not found.',404);
  const draftKey=`document-draft/${id}`, sourceKey=`document-source/${id}`, completedKey=`document-completed/${id}`;
  if(action==='document-upload' && request.method==='POST') {
    check(owner && !gallery.published,'Only owner drafts accept uploads.',403);
    const contentType=request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    check(!contentType || ['application/pdf','application/octet-stream'].includes(contentType),'Send this file as a PDF upload, not as a web form.');
    const bytes=Buffer.from(await request.arrayBuffer());
    check(bytes.length>0 && bytes.length<=3*1024*1024,'Upload a PDF up to 3 MB.',413);
    check(bytes.subarray(0,5).toString()==='%PDF-','Choose a PDF file.');
    let doc; try{doc=await PDFDocument.load(bytes);}catch{check(false,'Use an unencrypted PDF that opens normally.');}
    check(doc.getPageCount()>0 && doc.getPageCount()<=30,'Use a PDF with up to 30 pages.');
    check(!doc.getPages().some(p=>p.getRotation().angle!==0),'Export this PDF with upright pages before uploading.');
    check(!doc.getForm().getFields().some(f=>f instanceof PDFSignature),'This PDF has a signature field. Upload an unsigned, printed-to-PDF copy.');
    // Preserve visible defaults in pre-existing fields; clients fill owner-placed fields.
    const hasFields=doc.getForm().getFields().length>0;
    if(hasFields)doc.getForm().flatten();
    const normalized=hasFields?await doc.save():bytes;
    const pages=doc.getPages().map(p=>p.getSize());
    const config={filename:(url.searchParams.get('filename')||'document.pdf').slice(0,200),pages,fields:[],sourceHash:digest(normalized)};
    // One immutable source per draft prevents a published layout racing a replacement upload.
    const saved=await store.set(sourceKey,new Blob([normalized],{type:'application/pdf'}),{onlyIfNew:true,metadata:{type:'application/pdf'}});
    check(saved.modified,'This draft already has a PDF. Create a new document to replace it.',409);
    await store.setJSON(draftKey,config);return json(config);
  }
  if(action==='document-config' && request.method==='GET') {
    let config=gallery.document || (owner && await store.get(draftKey,{type:'json'}));
    if(owner && gallery.published){const draft=await store.get(draftKey,{type:'json'});if(draft)config={...config,fields:[...config.fields,...draft.fields.filter(f=>f.type==='owner-signature')],ownerSignatures:draft.ownerSignatures};}
    const completed=await store.get(completedKey,{type:'json'});
    return json({config:config||null,completed:completed?{submitted:completed.submitted,name:completed.name,email:completed.email,hash:completed.hash}:null});
  }
  if(action==='document-owner-signature' && request.method==='POST') {
    check(owner,'Owner access required.',403);
    check(!await store.get(completedKey,{type:'json'}),'This document has been completed; create a new version to change signatures.',409);
    const draft=await store.get(draftKey,{type:'json'});check(draft,'Upload a PDF first.');
    const data=await body(request);const field=draft.fields.find(f=>f.id===data.fieldId && f.type==='owner-signature');
    check(field,'Choose a Film Stop signature field.');
    check(typeof data.name==='string' && data.name.trim().length>0 && data.name.length<=100,'Enter your full name.');
    const signature=validateSignature(data.signature,check),size=signatureSize(data.size??1);
    const updated={...draft,ownerSignatures:{...draft.ownerSignatures,[field.id]:{signature,size,name:data.name.trim(),submitted:new Date().toISOString()}}};
    if(gallery.published){const previous=await store.get(`published/${id}`,{type:'json'});await store.setJSON(`document-version/${id}/${previous.document.sourceHash}`,previous,{onlyIfNew:true});const sourceHash=await producerSource(store,id,updated,draft.fields);await store.setJSON(`published/${id}`,{...previous,document:{...previous.document,producerSigned:true,sourceHash}});}
    await store.setJSON(draftKey,updated);
    return json({saved:true});
  }
  if(action==='document-layout' && request.method==='POST') {
    check(owner && !gallery.published,'Only owner drafts can change fields.',403);
    const draft=await store.get(draftKey,{type:'json'});check(draft,'Upload a PDF first.');
    const data=await body(request);const fields=validateFields(data.fields,draft.pages,check);
    const prefill=validateDraftValues(data.values===undefined?draft.prefill||{}:data.values,fields,check);
    await store.setJSON(draftKey,{...draft,fields,prefill,signing:Boolean(data.signing)});return json({saved:true});
  }
  if(action==='document-publish' && request.method==='POST') {
    check(owner,'Owner access required.',403);
    if(gallery.published)return json({published:true});
    const draft=await store.get(draftKey,{type:'json'});check(draft,'Upload a PDF first.');
    const data=await body(request);const fields=validateFields(data.fields,draft.pages,check);
    check(!data.signing || fields.some(f=>f.type==='signature'),'Place at least one signature field.');
    check(data.signing || fields.length===0,'Read-only documents cannot contain completion fields.');
    const ownerFields=fields.filter(f=>f.type==='owner-signature');
    let sourceHash=draft.sourceHash;
    if(ownerFields.length){
      for(const f of ownerFields)check(draft.ownerSignatures?.[f.id],'Add your signature before publishing.');
      sourceHash=await producerSource(store,id,draft,fields);
    }
    const {ownerSignatures,...publicDraft}=draft;
    await store.setJSON(`published/${id}`,{document:{...publicDraft,sourceHash,signing:Boolean(data.signing),fields:fields.filter(f=>f.type!=='owner-signature'),producerSigned:ownerFields.length>0}},{onlyIfNew:true});return json({published:true});
  }
  if(action==='document-export' && request.method==='POST') {
    const saved=await store.get(completedKey,{type:'json'});
    let bytes;
    if(saved)bytes=Buffer.from(saved.pdf,'base64');
    else {
      const config=gallery.document || (owner && await store.get(draftKey,{type:'json'}));check(config,'Upload a PDF first.');
      const data=await body(request);
      const entries=validateDraftValues({...config.prefill,...(data.values||{})},config.fields,check);
      const editable=config.fields.filter(f=>!['signature','owner-signature'].includes(f.type)).map(f=>({...f,required:false}));
      const values=Object.fromEntries(editable.map(f=>[f.id,entries[f.id]??(['checkbox','radio'].includes(f.type)?false:'')]));
      const source=await store.get(gallery.document?.producerSigned?`document-published-source/${id}/${gallery.document.sourceHash}`:sourceKey,{type:'arrayBuffer'});check(source,'PDF not found.',404);
      bytes=editable.length?(await completedPDF(source,{fields:editable},{name:'',email:'',values},gallery.title,id,new Date().toISOString(),check,{receipt:false})).bytes:new Uint8Array(source);
      const signatures=[];
      if(owner && !gallery.published)for(const field of config.fields.filter(f=>f.type==='owner-signature')){const mark=config.ownerSignatures?.[field.id];if(mark)signatures.push({field,strokes:mark.signature,size:mark.size??1});}
      if(data.signature?.length){const strokes=validateSignature(data.signature,check);for(const field of config.fields.filter(f=>f.type==='signature'))signatures.push({field,strokes,size:signatureSize(data.signatureSizes?.[field.id]??1)});}
      if(signatures.length){const pdf=await PDFDocument.load(bytes);for(const{field,strokes,size}of signatures){const page=pdf.getPage(field.page),{width,height}=page.getSize();drawSignature(page,strokes,{x:field.x*width,y:(1-field.y-field.h)*height,w:field.w*width,h:field.h*height},size);}bytes=await pdf.save();}
    }
    return new Response(bytes,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="filmstop-${saved?'signed':'filled'}-${id}.pdf"`}});
  }
  if(action==='document-file' && request.method==='GET') {
    const completed=url.searchParams.get('completed')==='1';
    let bytes;
    if(completed){const saved=await store.get(completedKey,{type:'json'});check(saved,'Completed copy not available.',404);bytes=Buffer.from(saved.pdf,'base64');}
    else bytes=await store.get(gallery.document?.producerSigned?`document-published-source/${id}/${gallery.document.sourceHash}`:sourceKey,{type:'arrayBuffer'});
    check(bytes,'PDF not found.',404);
    return new Response(bytes,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`${url.searchParams.get('download')==='1'?'attachment':'inline'}; filename="filmstop-${completed?'completed':'original'}-${id}.pdf"`}});
  }
  if(action==='document-submit' && request.method==='POST') {
    check(gallery.published && gallery.document?.signing,'Document is not open for completion.',409);
    const data=await body(request);
    const existing=await store.get(completedKey,{type:'json'});
    if(existing){check(existing.requestId===data.requestId,'This document has already been completed.',409);return json({submitted:existing.submitted});}
    check(/^[a-f0-9]{32}$/.test(data.requestId||''),'Invalid submission ID.');
    check(data.consent===true,'Confirm your agreement before submitting.');
    check(typeof data.name==='string' && data.name.trim().length>0 && data.name.length<=100 && !/[\r\n\x00-\x1f]/.test(data.name),'Enter your full name.');
    check(typeof data.email==='string' && data.email.length<=200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email),'Enter your email.');
    const submitted=new Date().toISOString();
    const source=await store.get(gallery.document.producerSigned?`document-published-source/${id}/${gallery.document.sourceHash}`:sourceKey,{type:'arrayBuffer'});check(source,'PDF not found.',404);
    const {bytes,values}=await completedPDF(source,gallery.document,data,gallery.title,id,submitted,check);
    const saved={requestId:data.requestId,submitted,name:data.name.trim(),email:data.email.trim(),values,signatureSizes:data.signatureSizes||{},hash:digest(bytes),sourceHash:gallery.document.sourceHash,pdf:Buffer.from(bytes).toString('base64')};
    const result=await store.setJSON(completedKey,saved,{onlyIfNew:true});
    check(result.modified || (await store.get(completedKey,{type:'json'})).requestId===data.requestId,'This document has already been completed.',409);
    return json({submitted});
  }
  return json({error:'Document action not found.'},404);
}
