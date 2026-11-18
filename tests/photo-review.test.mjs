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
  async set(key, data, options) { records.set(key, { data: await data.arrayBuffer(), metadata: options.metadata }); return { modified: true }; },
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
