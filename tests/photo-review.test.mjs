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
  async list({ prefix }) { return { blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; }
};
const secret = 'test-owner-password-long-enough';
const handler = createHandler(() => store, () => secret);
async function request(action, { id, data, cookie, photo, filename, bytes, origin = 'https://filmstopcreate.com' } = {}) {
  const url = new URL('https://filmstopcreate.com/.netlify/functions/photo-review');
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries({ gallery:id, photo, filename })) if(value) url.searchParams.set(key,value);
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
  const created=await request('create',{cookie:owner,data:{kind:'video',client:'Linkind',title:'Rough cut V1',limit:12,passcode:'Linkkind'}});
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
  const viewer=cookie(await request('unlock',{id,data:{passcode:'Linkkind'}}));
  const streamed=await handler(new Request(`https://filmstopcreate.com/.netlify/functions/photo-review?action=video&gallery=${id}`,{headers:{cookie:viewer,range:'bytes=4-7'}}));
  assert.equal(streamed.status,206);assert.equal(streamed.headers.get('Content-Range'),`bytes 4-7/${bytes.length}`);assert.equal(await streamed.text(),'ftyp');
  const comment={id:'f'.repeat(32),time:65,author:'Client',text:'Shorten this section.'};
  assert.equal((await request('comment',{id,cookie:viewer,data:{...comment,time:200}})).status,400);
  assert.equal((await request('comment',{id,cookie:viewer,data:comment})).status,200);
  assert.equal((await request('comment',{id,cookie:viewer,data:comment})).status,200);
  assert.equal((await request('comment',{id,cookie:viewer,data:{...comment,text:'Changed'}})).status,409);
  const comments=await (await request('comments',{id,cookie:owner})).json();assert.equal(comments.length,1);assert.equal(comments[0].time,65);
});
