import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSelection, imageType } from '../netlify/functions/photo-review.mjs';
const gallery = { limit: 2, photos: [{ id:'a' }, { id:'b' }, { id:'c' }] };
test('accept valid selections up to the configured maximum', () => {
  assert.deepEqual(validateSelection(['a', 'b'], gallery), ['a','b']);
  assert.deepEqual(validateSelection(['a'], gallery), ['a']);
});
test('reject forged, duplicate, empty and over-limit selections', () => {
  for (const picks of [[], null, ['a','a'], ['a','b','c'], ['foreign']]) assert.throws(() => validateSelection(picks, gallery));
});
test('recognize images from bytes and reject disguised uploads', () => {
  assert.equal(imageType(Buffer.from([255,216,255,0])), 'image/jpeg');
  assert.equal(imageType(Buffer.from([137,80,78,71,13,10,26,10])), 'image/png');
  assert.equal(imageType(Buffer.from('RIFF0000WEBP')), 'image/webp');
  assert.equal(imageType(Buffer.from('<script>alert(1)</script>')), null);
});

import { createHandler } from '../netlify/functions/photo-review.mjs';
const records = new Map();
const store = {
  async get(key) { return records.get(key)?.data || null; },
  async setJSON(key, data, options = {}) {
    if (options.onlyIfNew && records.has(key)) return { modified: false };
    records.set(key, { data: structuredClone(data) }); return { modified: true };
  },
  async set(key, data, options) { if (options.onlyIfNew && records.has(key)) return {modified:false}; records.set(key, { data: await data.arrayBuffer(), metadata: options.metadata }); return { modified: true }; },
  async getMetadata(key) { return records.get(key) ? { metadata: records.get(key).metadata } : null; },
  async getWithMetadata(key) { return records.get(key) || null; },
  async delete(key) { records.delete(key); },
  async list({ prefix }) { return { blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; }
};
const secret = 'test-owner-password-long-enough';
const handler = createHandler(() => store, () => secret);
async function request(action, { id, data, cookie, photo, filename, bytes, profile, origin = 'https://filmstopcreate.com' } = {}) {
  const url = new URL('https://filmstopcreate.com/.netlify/functions/photo-review');
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries({ gallery:id, photo, filename, profile })) if(value) url.searchParams.set(key,value);
  return handler(new Request(url, { method: data || bytes ? 'POST' : 'GET', headers: { origin, ...(cookie ? { cookie } : {}) }, body: bytes || (data ? JSON.stringify(data) : undefined) }));
}
const cookie = response => response.headers.get('set-cookie').split(';')[0];
test('private gallery lifecycle enforces access, publication, limit and final submission', async () => {
  assert.equal((await request('list')).status,401);
  assert.equal((await request('owner-login',{data:{password:'wrong'}})).status,401);
  assert.equal((await request('owner-login',{data:{password:secret},origin:'https://evil.test'})).status,403);
  const owner = cookie(await request('owner-login',{data:{password:secret}}));
  const created = await request('create',{cookie:owner,data:{title:'Test gallery',passcode:'client-pass-123',limit:1}});
  assert.equal(created.status,200);
  const {id}=await created.json();
  assert.equal((await request('gallery',{id})).status,401);
  assert.equal((await request('unlock',{id,data:{passcode:'client-pass-123'}})).status,404);
  const photo='a'.repeat(32);
  assert.equal((await request('upload',{id,cookie:owner,photo,filename:'DSC001.JPG',bytes:Buffer.from([255,216,255,0])})).status,200);
  assert.equal((await request('publish',{id,cookie:owner,data:{photos:[photo]}})).status,200);
  assert.equal((await request('unlock',{id,data:{passcode:'wrong-code'}})).status,401);
  const client=cookie(await request('unlock',{id,data:{passcode:'client-pass-123'}}));
  assert.equal((await request('photo',{id,photo})).status,401);
  assert.equal((await request('photo',{id,photo,cookie:client})).status,200);
  assert.equal((await request('upload',{id,photo,cookie:client,filename:'hack.jpg',bytes:Buffer.from([255,216,255,0])})).status,403);
  assert.equal((await request('submit',{id,cookie:client,data:{picks:[photo,photo]}})).status,400);
  assert.equal((await request('submit',{id,cookie:client,data:{picks:['b'.repeat(32)]}})).status,400);
  const submissions = await Promise.all([1,2].map(() => request('submit',{id,cookie:client,data:{picks:[photo]}})));
  assert.ok(submissions.every(r=>r.status===200));
  const result=await (await request('gallery',{id,cookie:owner})).json();
  assert.deepEqual(result.selection.picks,[photo]);
  assert.equal(result.photos[0].filename,'DSC001.JPG');
  const listed=await (await request('list',{cookie:owner})).json();
  assert.ok(listed[0].submitted);
  assert.equal((await request('gallery',{id,cookie:client.replace(/.$/,'x')})).status,401);
});

import { videoRange, chunkSize } from '../netlify/lib/video-support.mjs';
test('video byte ranges cap response size and support seeking and suffixes', () => {
  assert.deepEqual(videoRange('bytes=20-39',100),{start:20,end:39});
  assert.deepEqual(videoRange('bytes=-10',100),{start:90,end:99});
  assert.deepEqual(videoRange('bytes=0-',chunkSize*3),{start:0,end:chunkSize-1});
  for(const range of ['bytes=100-','bytes=30-10','bytes=0-1,3-4','invalid','bytes=-0']) assert.equal(videoRange(range,100),null);
});
test('video lifecycle supports private playback, resumable chunks and timestamped comments', async () => {
  const owner=cookie(await request('owner-login',{data:{password:secret}}));
  const created=await request('create',{cookie:owner,data:{kind:'video',client:'Linkind',title:'Rough cut V1',limit:12,passcode:'test-client-pass'}});
  const {id}=await created.json();
  const bytes=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom00000000')]);
  const meta={filename:'review.mp4',size:bytes.length,duration:150,fingerprint:'a'.repeat(64)};
  assert.equal((await request('video-init',{id,cookie:owner,data:meta})).status,200);
  assert.equal((await request('video-publish',{id,cookie:owner,data:{}})).status,400);
  const upload=()=>handler(new Request(`https://filmstopcreate.com/.netlify/functions/photo-review?action=video-upload&gallery=${id}&chunk=0`,{method:'POST',headers:{origin:'https://filmstopcreate.com',cookie:owner},body:bytes}));
  assert.equal((await upload()).status,200);
  assert.equal((await upload()).status,200);
  assert.equal((await request('video-init',{id,cookie:owner,data:{...meta,fingerprint:'b'.repeat(64)}})).status,409);
  assert.equal((await request('video-publish',{id,cookie:owner,data:{}})).status,200);
  assert.equal((await request('video',{id})).status,401);
  const viewer=cookie(await request('unlock',{id,data:{passcode:'test-client-pass'}}));
  const streamed=await handler(new Request(`https://filmstopcreate.com/.netlify/functions/photo-review?action=video&gallery=${id}`,{headers:{cookie:viewer,range:'bytes=4-7'}}));
  assert.equal(streamed.status,206);assert.equal(streamed.headers.get('Content-Range'),`bytes 4-7/${bytes.length}`);assert.equal(await streamed.text(),'ftyp');
  const comment={id:'f'.repeat(32),time:65,author:'Client',text:'Shorten this section.'};
  assert.equal((await request('comment',{id,cookie:viewer,data:{...comment,time:200}})).status,400);
  assert.equal((await request('comment',{id,cookie:viewer,data:comment})).status,200);
  assert.equal((await request('comment',{id,cookie:viewer,data:comment})).status,200);
  assert.equal((await request('comment',{id,cookie:viewer,data:{...comment,text:'Changed'}})).status,409);
  const comments=await (await request('comments',{id,cookie:owner})).json();assert.equal(comments.length,1);assert.equal(comments[0].time,65);
});

test('batch feedback validates every row and prepares a complete Netlify form submission', async () => {
  const id='1'.repeat(32);
  records.set(`gallery/${id}`,{data:{id,title:'Linkind Mini documentary commercial',kind:'video',limit:12,published:false,created:new Date().toISOString()}});
  records.set(`published/${id}`,{data:{video:{duration:150,size:100}}});
  const owner=cookie(await request('owner-login',{data:{password:secret}}));
  const data={id:'2'.repeat(32),author:'Client reviewer',notes:[{time:15,text:'Shorten this shot.'},{time:70,text:'Raise the music here.'}],general:'Use a warmer overall grade.'};
  assert.equal((await request('feedback',{id,data})).status,401);
  for(const invalid of [{...data,notes:[]},{...data,notes:[{time:151,text:'Outside video'}]},{...data,notes:[{time:2,text:' '}]},{...data,author:''}]) {
    assert.equal((await request('feedback',{id,cookie:owner,data:invalid})).status,400);
  }
  const result=await request('feedback',{id,cookie:owner,data});assert.equal(result.status,200);
  const {fields}=await result.json();
  assert.equal(fields['form-name'],'feedback-notes');
  assert.equal(fields['video-title'],'Linkind Mini documentary commercial');
  assert.equal(fields['feedback-notes'],'00:15\nShorten this shot.\n\n01:10\nRaise the music here.');
  assert.equal(fields['general-request'],data.general);
  assert.equal((await request('feedback',{id,cookie:owner,data})).status,200);
  assert.equal((await request('feedback',{id,cookie:owner,data:{...data,general:'Changed'}})).status,409);
  assert.equal((await request('feedback-delivered',{id,cookie:owner,data:{id:data.id}})).status,200);
  const saved=await (await request('feedback-list',{id,cookie:owner})).json();assert.equal(saved.length,1);assert.equal(saved[0].notes.length,2);
});

import {PDFDocument, StandardFonts} from 'pdf-lib';
import {writeFile} from 'node:fs/promises';
import {validateSignature,validateFields,completedPDF} from '../netlify/lib/document-support.mjs';
const testCheck=(condition,message)=>{if(!condition)throw new Error(message);};
const signature=[[[.05,.7],[.2,.2],[.35,.8],[.5,.3],[.7,.7],[.9,.3]]];
const field=(type,id,extra={})=>({id:id.repeat(32),type,label:type,page:0,x:.1,y:.3,w:.4,h:.06,required:true,...extra});
test('document layout rejects forged fields and malformed signatures',()=>{
  const pages=[{width:612,height:792}];
  assert.throws(()=>validateFields([field('text','a',{page:9})],pages,testCheck));
  assert.throws(()=>validateFields([field('text','a',{x:.9})],pages,testCheck));
  assert.throws(()=>validateFields([field('text','a'),field('text','a')],pages,testCheck));
  assert.throws(()=>validateSignature([[[0,0],[0,0]]],testCheck));
  assert.throws(()=>validateSignature([[[0,0],[1,1],[2,2],[3,3],[4,4]]],testCheck));
  assert.deepEqual(validateSignature(signature,testCheck),signature);
});
test('private document lifecycle preserves source, validates fields and saves immutable signed PDF',async()=>{
  const owner=cookie(await request('owner-login',{data:{password:secret}}));
  const {id}=await (await request('create',{cookie:owner,data:{kind:'document',client:'Workflow test',title:'TEST ONLY — not a contract',limit:12,passcode:'test-document'}})).json();
  const pdf=await PDFDocument.create();const page=pdf.addPage([612,792]);page.drawText('TEST ONLY — workflow verification',{x:50,y:720,font:await pdf.embedFont(StandardFonts.Helvetica),size:18});
  const source=await pdf.save();
  const fields=[field('text','a'),field('signature','b',{y:.5,h:.12}),field('radio','c',{group:'payment',y:.7,w:.03,h:.025}),field('radio','d',{group:'payment',y:.75,w:.03,h:.025})];
  const badTransport=await handler(new Request(`https://filmstopcreate.com/.netlify/functions/photo-review?action=document-upload&gallery=${id}`,{method:'POST',headers:{origin:'https://filmstopcreate.com',cookie:owner,'content-type':'application/x-www-form-urlencoded'},body:source}));
  assert.equal(badTransport.status,400);
  const upload=(auth=owner)=>request('document-upload',{id,cookie:auth,bytes:source,filename:'test.pdf'});
  assert.equal((await upload()).status,200);
  assert.equal((await upload()).status,409);
  assert.equal((await request('document-file',{id})).status,401);
  assert.equal((await request('document-publish',{id,cookie:owner,data:{signing:true,fields:[]}})).status,400);
  assert.equal((await request('document-publish',{id,cookie:owner,data:{signing:true,fields}})).status,200);
  const client=cookie(await request('unlock',{id,data:{passcode:'test-document'}}));
  assert.equal((await upload(client)).status,403);
  assert.equal((await request('upload',{id,cookie:client,photo:'a'.repeat(32),filename:'fake.jpg',bytes:Buffer.from([255,216,255])})).status,400);
  const fetched=await request('document-file',{id,cookie:client});assert.equal(fetched.status,200);assert.deepEqual(new Uint8Array(await fetched.arrayBuffer()),source);
  const data={requestId:'a'.repeat(32),name:'Workflow Test',email:'test@example.com',consent:true,signature,values:{['a'.repeat(32)]:'Test signer',['c'.repeat(32)]:true,['d'.repeat(32)]:false}};
  assert.equal((await request('document-submit',{id,cookie:client,data:{...data,consent:false}})).status,400);
  assert.equal((await request('document-submit',{id,cookie:client,data:{...data,values:{...data.values,['d'.repeat(32)]:true}}})).status,400);
  assert.equal((await request('document-submit',{id,cookie:client,data})).status,200);
  assert.equal((await request('document-submit',{id,cookie:client,data})).status,200);
  assert.equal((await request('document-submit',{id,cookie:client,data:{...data,requestId:'b'.repeat(32)}})).status,409);
  const saved=records.get(`document-completed/${id}`).data;
  const result=await PDFDocument.load(Buffer.from(saved.pdf,'base64'));assert.equal(result.getPageCount(),2);assert.equal(saved.values['a'.repeat(32)],'Test signer');assert.match(saved.hash,/^[a-f0-9]{64}$/);
  const listed=await(await request('list',{cookie:owner})).json();assert.ok(listed.find(p=>p.id===id).submitted);
  await writeFile('/tmp/filmstop-document-workflow-test.pdf',Buffer.from(saved.pdf,'base64'));
});
test('read-only documents publish without fields and cannot be signed',async()=>{
  const owner=cookie(await request('owner-login',{data:{password:secret}}));
  const {id}=await(await request('create',{cookie:owner,data:{kind:'document',client:'Test',title:'Script',limit:12,passcode:'test-script'}})).json();
  const pdf=await PDFDocument.create();pdf.addPage();const source=await pdf.save();
  assert.equal((await request('document-upload',{id,cookie:owner,bytes:source})).status,200);
  assert.equal((await request('document-publish',{id,cookie:owner,data:{signing:false,fields:[field('text','a')]}})).status,400);
  assert.equal((await request('document-publish',{id,cookie:owner,data:{signing:false,fields:[]}})).status,200);
  const viewer=cookie(await request('unlock',{id,data:{passcode:'test-script'}}));
  assert.equal((await request('document-submit',{id,cookie:viewer,data:{}})).status,409);
  assert.equal((await request('document-file',{id,cookie:viewer})).status,200);
});

test('owner signature stays private in draft and is embedded before client signing',async()=>{
  const owner=cookie(await request('owner-login',{data:{password:secret}}));
  const {id}=await(await request('create',{cookie:owner,data:{kind:'document',client:'Workflow verification',title:'TEST ONLY — two signatures',limit:12,passcode:'test-contract'}})).json();
  const pdf=await PDFDocument.create();pdf.addPage();const source=await pdf.save();
  await request('document-upload',{id,cookie:owner,bytes:source});
  const fields=[field('owner-signature','a'),field('signature','b',{y:.6,h:.1})];
  await request('document-layout',{id,cookie:owner,data:{fields,signing:true}});
  assert.equal((await request('document-owner-signature',{id,data:{fieldId:'a'.repeat(32),signature,name:'TEST producer'}})).status,401);
  assert.equal((await request('document-publish',{id,cookie:owner,data:{fields,signing:true}})).status,400);
  assert.equal((await request('document-owner-signature',{id,cookie:owner,data:{fieldId:'a'.repeat(32),signature,name:'TEST producer'}})).status,200);
  const draft=await(await request('document-config',{id,cookie:owner})).json();assert.ok(draft.config.ownerSignatures['a'.repeat(32)]);
  assert.equal((await request('document-publish',{id,cookie:owner,data:{fields,signing:true}})).status,200);
  const client=cookie(await request('unlock',{id,data:{passcode:'test-contract'}}));
  const shared=await(await request('document-config',{id,cookie:client})).json();assert.equal(shared.config.fields.length,1);assert.equal(shared.config.ownerSignatures,undefined);assert.equal(shared.config.producerSigned,true);
  assert.equal((await request('document-owner-signature',{id,cookie:client,data:{fieldId:'a'.repeat(32),signature,name:'Imposter'}})).status,403);
  const published=await(await request('document-file',{id,cookie:client})).arrayBuffer();assert.notDeepEqual(new Uint8Array(published),source);
  const data={requestId:'e'.repeat(32),name:'TEST client',email:'test@example.com',signature,values:{},consent:true};
  assert.equal((await request('document-submit',{id,cookie:client,data})).status,200);
  const saved=records.get(`document-completed/${id}`).data;assert.equal(saved.sourceHash,shared.config.sourceHash);
});

test('profiles isolate projects, hide drafts, share access, and revoke old sessions',async()=>{
  const owner=cookie(await request('owner-login',{data:{password:secret}}));
  assert.equal((await request('profile-create',{data:{name:'Unauthorized',passcode:'123456'}})).status,403);
  const a=await(await request('profile-create',{cookie:owner,data:{name:'Profile A',passcode:'simple-A',listed:true}})).json();
  const b=await(await request('profile-create',{cookie:owner,data:{name:'Profile B',passcode:'simple-B',listed:false}})).json();
  assert.equal((await request('profile-create',{cookie:owner,data:{name:'profile a',passcode:'123456'}})).status,409);
  const directory=await(await request('profile-list')).json();assert.deepEqual(directory.map(p=>p.id),[a.id]);assert.equal(directory[0].hash,undefined);
  const create=async(title,profileId)=> (await(await request('create',{cookie:owner,data:{title,client:'Test',profileId,kind:'document',category:'agreements',limit:12,passcode:'item-passcode'}})).json()).id;
  const first=await create('Published A',a.id),draft=await create('Draft A',a.id),other=await create('Published B',b.id);
  for(const id of[first,other]){const pdf=await PDFDocument.create();pdf.addPage();await request('document-upload',{id,cookie:owner,bytes:await pdf.save()});await request('document-publish',{id,cookie:owner,data:{fields:[],signing:false}});}
  assert.equal((await request('profile-detail',{profile:a.id})).status,401);
  assert.equal((await request('profile-unlock',{profile:a.id,data:{passcode:'wrong'}})).status,401);
  const client=cookie(await request('profile-unlock',{profile:a.id,data:{passcode:'simple-A'}}));
  const detail=await(await request('profile-detail',{profile:a.id,cookie:client})).json();assert.deepEqual(detail.items.map(i=>i.id),[first]);assert.equal(detail.hash,undefined);
  assert.equal((await request('document-file',{id:first,cookie:client})).status,200);
  assert.equal((await request('gallery',{id:first,cookie:client})).status,200);
  assert.equal((await request('gallery',{id:draft,cookie:client})).status,401);
  assert.equal((await request('document-file',{id:other,cookie:client})).status,401);
  assert.equal((await request('profile-detail',{profile:b.id,cookie:client})).status,401);
  assert.equal((await request('profile-assign',{profile:a.id,cookie:client,data:{gallery:other,category:'agreements'}})).status,403);
  assert.equal((await request('profile-assign',{profile:b.id,cookie:owner,data:{gallery:first,category:'scripts'}})).status,200);
  assert.equal((await request('document-file',{id:first,cookie:client})).status,401);
  const clientB=cookie(await request('profile-unlock',{profile:b.id,data:{passcode:'simple-B'}}));
  assert.equal((await request('document-file',{id:first,cookie:clientB})).status,200);
  const bItems=await(await request('profile-detail',{profile:b.id,cookie:clientB})).json();assert.equal(bItems.items.find(i=>i.id===first).category,'scripts');
  await request('profile-update',{profile:b.id,cookie:owner,data:{name:'Profile B',passcode:'changed-B',listed:false}});
  assert.equal((await request('document-file',{id:first,cookie:clientB})).status,401);
  const fresh=cookie(await request('profile-unlock',{profile:b.id,data:{passcode:'changed-B'}}));
  await request('profile-assign',{profile:b.id,cookie:owner,data:{gallery:first,category:'scripts',remove:true}});
  assert.equal((await request('document-file',{id:first,cookie:fresh})).status,401);
  const ownerDetail=await(await request('profile-detail',{profile:a.id,cookie:owner})).json();assert.ok(ownerDetail.items.find(i=>i.id===draft));
});

test('draft entries persist, retain signatures, and carry into client completion',async()=>{
  const owner=cookie(await request('owner-login',{data:{password:secret}}));
  const {id}=await(await request('create',{cookie:owner,data:{kind:'document',client:'Test',title:'TEST ONLY — editable draft',limit:12,passcode:'draft-test'}})).json();
  const pdf=await PDFDocument.create();pdf.addPage();await request('document-upload',{id,cookie:owner,bytes:await pdf.save()});
  const fields=[field('text','a'),field('date','b',{y:.4}),field('signature','c',{y:.5})];
  assert.equal((await request('document-layout',{id,cookie:owner,data:{fields,signing:true,values:{['a'.repeat(32)]:'Saved draft entry',['b'.repeat(32)]:''}}})).status,200);
  let draft=await(await request('document-config',{id,cookie:owner})).json();assert.equal(draft.config.prefill['a'.repeat(32)],'Saved draft entry');assert.equal(draft.config.fields.length,3);
  assert.equal((await request('document-layout',{id,cookie:owner,data:{fields,signing:true,values:{['a'.repeat(32)]:false}}})).status,400);
  await request('document-layout',{id,cookie:owner,data:{fields,signing:true}});
  draft=await(await request('document-config',{id,cookie:owner})).json();assert.equal(draft.config.prefill['a'.repeat(32)],'Saved draft entry');
  await request('document-publish',{id,cookie:owner,data:{fields,signing:true}});
  const client=cookie(await request('unlock',{id,data:{passcode:'draft-test'}}));
  const published=await(await request('document-config',{id,cookie:client})).json();assert.equal(published.config.prefill['a'.repeat(32)],'Saved draft entry');
  assert.equal((await request('document-layout',{id,cookie:client,data:{fields,signing:true,values:{}}})).status,403);
  const data={requestId:'9'.repeat(32),name:'Workflow Test',email:'test@example.com',consent:true,signature,values:{...published.config.prefill,['b'.repeat(32)]:'2026-11-18'}};
  assert.equal((await request('document-submit',{id,cookie:client,data})).status,200);
  assert.equal(records.get(`document-completed/${id}`).data.values['a'.repeat(32)],'Saved draft entry');
});
