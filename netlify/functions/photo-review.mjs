import { profileAction, profileForGallery, profileCookie, profileSubject } from '../lib/profile-support.mjs';
import { documentAction } from '../lib/document-support.mjs';
import { feedbackAction } from '../lib/video-feedback.mjs';
import { videoAction } from '../lib/video-support.mjs';
import { getStore } from '@netlify/blobs';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (data, status = 200) => Response.json(data, { status, headers });
const idPattern = /^[a-f0-9]{32}$/;
const cookieName = id => `fs_review_${id}`;
const passwordHash = (password, salt) => scryptSync(password, salt, 32).toString('hex');
function equal(a, b) {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b || '');
  return left.length === right.length && timingSafeEqual(left, right);
}
function token(subject, secret) {
  const payload = Buffer.from(JSON.stringify({ subject, expires: Date.now() + 12 * 60 * 60 * 1000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
function authenticated(request, name, subject, secret) {
  const value = request.headers.get('cookie')?.split('; ').find(c => c.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!value) return false;
  const [payload, signature] = value.split('.');
  if (!payload || !equal(signature, createHmac('sha256', secret).update(payload).digest('base64url'))) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return claims.subject === subject && claims.expires > Date.now();
  } catch { return false; }
}
function session(name, subject, secret) {
  return { ...headers, 'Set-Cookie': `${name}=${token(subject, secret)}; Path=/.netlify/functions/photo-review; HttpOnly; Secure; SameSite=Strict; Max-Age=43200` };
}
function check(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
async function body(request) {
  const maxSize = ['document-submit','document-owner-signature','document-export'].includes(new URL(request.url).searchParams.get('action')) ? 350000 : 100000;
  check(Number(request.headers.get('content-length') || 0) < maxSize, 'Request too large', 413);
  const text = await request.text();
  check(text.length < maxSize, 'Request too large', 413);
  try { return JSON.parse(text); } catch { check(false, 'Invalid request'); }
}
export function validateSelection(picks, gallery) {
  check(Array.isArray(picks) && picks.length > 0, 'Choose at least one photo.');
  check(picks.length <= gallery.limit, `Choose up to ${gallery.limit} photos.`);
  check(new Set(picks).size === picks.length, 'Duplicate photo selection.');
  check(picks.every(id => gallery.photos.some(p => p.id === id)), 'A selected photo is not in this gallery.');
  return picks;
}
export function imageType(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  return null;
}
export function createHandler(storageFactory = getStore, ownerSecret = () => process.env.PHOTO_REVIEW_OWNER_PASSWORD) {
  return async function handler(request) {
    try {
      const secret = ownerSecret();
      check(secret?.length >= 20, 'Photo review is awaiting owner setup.', 503);
      if (!['GET', 'HEAD'].includes(request.method)) {
        check(request.headers.get('origin') === new URL(request.url).origin, 'Request origin rejected.', 403);
      }
      const url = new URL(request.url);
      const action = url.searchParams.get('action');
      const id = url.searchParams.get('gallery');
      const store = storageFactory({ name: 'filmstop-photo-review', consistency: 'strong' });
      const owner = authenticated(request, 'fs_owner', 'owner', secret);
      if (action === 'owner-login' && request.method === 'POST') {
        const data = await body(request);
        check(equal(data.password, secret), 'Incorrect owner password.', 401);
        return new Response('{}', { headers: session('fs_owner', 'owner', secret) });
      }
      if (action === 'logout' && request.method === 'POST') {
        return new Response('{}', { headers: { ...headers, 'Set-Cookie': 'fs_owner=; Path=/.netlify/functions/photo-review; HttpOnly; Secure; SameSite=Strict; Max-Age=0' } });
      }
      if (action === 'list' && request.method === 'GET') {
        check(owner, 'Sign in to continue.', 401);
        const { blobs } = await store.list({ prefix: 'gallery/' });
        const galleries = await Promise.all(blobs.map(async ({ key }) => {
          const g = await store.get(key, { type: 'json' });
          const submitted = await store.get(`${g.kind === 'document' ? 'document-completed' : 'selection'}/${g.id}`, { type: 'json' });
          const published = Boolean(await store.get(`published/${g.id}`, { type: 'json' }));
          return { id: g.id, title: g.title, profileId: (await store.get(`profile-link/${g.id}`, {type:'json'}))?.profileId || null, client: g.client || g.title.split('·')[0].trim(), kind: g.kind || 'photos', limit: g.limit, created: g.created, published, submitted: submitted?.submitted || null };
        }));
        return json(galleries.sort((a,b) => b.created.localeCompare(a.created)));
      }
      if (action === 'create' && request.method === 'POST') {
        check(owner, 'Sign in to continue.', 401);
        const data = await body(request);
        check(typeof data.title === 'string' && data.title.trim().length > 0 && data.title.length <= 150, 'Enter a project name.');
        check(!data.kind || ['photos', 'video', 'document'].includes(data.kind), 'Choose photos, video or document.');
        check(!data.client || (typeof data.client === 'string' && data.client.length <= 100), 'Client name must be under 100 characters.');
        check(Number.isInteger(data.limit) && data.limit > 0 && data.limit <= 500, 'Selection limit must be between 1 and 500.');
        check(typeof data.passcode === 'string' && data.passcode.length >= 8 && data.passcode.length <= 128, 'Use a client passcode of 8–128 characters.');
        if(data.profileId)check(idPattern.test(data.profileId) && await store.get(`profile/${data.profileId}`,{type:'json'}),'Choose a valid profile.');
        check(!data.category||['agreements','scripts','other'].includes(data.category),'Choose a document folder.');
        const galleryId = randomBytes(16).toString('hex');
        const salt = randomBytes(16).toString('hex');
        const gallery = { id: galleryId, title: data.title.trim(), client: data.client?.trim() || data.title.split('·')[0].trim(), kind: data.kind || 'photos', limit: data.limit, salt, hash: passwordHash(data.passcode, salt), created: new Date().toISOString(), published: false };
        await store.setJSON(`gallery/${galleryId}`, gallery, { onlyIfNew: true });
        if(data.profileId)await store.setJSON(`profile-link/${galleryId}`,{profileId:data.profileId,category:data.category||'other'});
        return json({ id: galleryId });
      }
      const profileResponse = await profileAction({action,request,url,store,owner,body,check,json,session,authenticated,secret,headers});
      if(profileResponse)return profileResponse;
      check(idPattern.test(id || ''), 'Gallery not found.', 404);
      let gallery = await store.get(`gallery/${id}`, { type: 'json' });
      check(gallery, 'Gallery not found.', 404);
      const manifest = await store.get(`published/${id}`, { type: 'json' });
      if (manifest) gallery = { ...gallery, photos: manifest.photos || [], video: manifest.video, document: manifest.document, published: true };
      if (action === 'unlock' && request.method === 'POST') {
        check(gallery.published, 'This gallery is not ready yet.', 404);
        const data = await body(request);
        check(typeof data.passcode === 'string' && data.passcode.length <= 128, 'Incorrect passcode.', 401);
        check(equal(passwordHash(data.passcode, gallery.salt), gallery.hash), 'Incorrect passcode.', 401);
        return new Response('{}', { headers: session(cookieName(id), id, secret) });
      }
      const profile = await profileForGallery(store,id);
      const client = authenticated(request, cookieName(id), id, secret) || Boolean(profile && authenticated(request,profileCookie(profile.id),profileSubject(profile),secret));
      check(owner || (client && gallery.published), 'Enter the gallery passcode.', 401);
      const documentResponse = await documentAction({ action, request, url, id, gallery, owner, store, body, check, json, headers });
      if (documentResponse) return documentResponse;
      check(gallery.kind !== 'document' || ['gallery'].includes(action), 'Action not available for documents.', 400);
      const feedbackResponse = await feedbackAction({ action, request, id, gallery, owner, store, body, check, json });
      if (feedbackResponse) return feedbackResponse;
      const videoResponse = await videoAction({ action, request, url, id, gallery, owner, store, body, check, json, headers });
      if (videoResponse) return videoResponse;
      if (action === 'upload' && request.method === 'POST') {
        check(owner && !gallery.published, 'Uploads are only available for owner drafts.', 403);
        const photoId = url.searchParams.get('photo');
        check(idPattern.test(photoId || ''), 'Invalid photo ID.');
        const filename = url.searchParams.get('filename');
        check(filename?.length > 0 && filename.length <= 500, 'Invalid filename.');
        const bytes = Buffer.from(await request.arrayBuffer());
        check(bytes.length > 0 && bytes.length <= 4 * 1024 * 1024, 'Each preview must be at most 4 MB.', 413);
        const type = imageType(bytes);
        check(type, 'Use JPEG, PNG or WebP previews.');
        await store.set(`photo/${id}/${photoId}`, new Blob([bytes], { type }), { onlyIfNew: true, metadata: { filename, type } });
        return json({ id: photoId });
      }
      if (action === 'publish' && request.method === 'POST') {
        check(owner, 'Owner access required.', 403);
        if (gallery.published) return json({ published: true });
        const data = await body(request);
        check(Array.isArray(data.photos) && data.photos.length > 0 && data.photos.length <= 1000, 'Publish between 1 and 1,000 photos.');
        check(new Set(data.photos).size === data.photos.length && data.photos.every(p => idPattern.test(p)), 'Invalid photo list.');
        const photos = await Promise.all(data.photos.map(async photoId => {
          const entry = await store.getMetadata(`photo/${id}/${photoId}`);
          check(entry, 'An upload is missing. Retry uploading before publishing.');
          return { id: photoId, filename: entry.metadata.filename };
        }));
        await store.setJSON(`published/${id}`, { photos }, { onlyIfNew: true });
        return json({ published: true });
      }
      if (action === 'photo' && request.method === 'GET') {
        const photoId = url.searchParams.get('photo');
        check(idPattern.test(photoId || ''), 'Photo not found.', 404);
        check(owner || gallery.photos.some(p => p.id === photoId), 'Photo not found.', 404);
        const photo = await store.getWithMetadata(`photo/${id}/${photoId}`, { type: 'arrayBuffer' });
        check(photo, 'Photo not found.', 404);
        return new Response(photo.data, { headers: { ...headers, 'Content-Type': photo.metadata.type, 'Content-Disposition': 'inline' } });
      }
      if (action === 'gallery' && request.method === 'GET') {
        let photos = gallery.photos || [];
        if (!gallery.published) {
          const { blobs } = await store.list({ prefix: `photo/${id}/` });
          photos = await Promise.all(blobs.map(async ({ key }) => ({ id: key.split('/').at(-1), filename: (await store.getMetadata(key)).metadata.filename })));
        }
        return json({ id, title: gallery.title, owner, kind: gallery.kind || 'photos', client: gallery.client || gallery.title.split('·')[0].trim(), video: gallery.video, document: gallery.document, profile: profile?{id:profile.id,name:profile.name}:null, limit: gallery.limit, published: gallery.published, photos, selection: await store.get(`selection/${id}`, { type: 'json' }) });
      }
      if (action === 'submit' && request.method === 'POST') {
        check(gallery.published, 'Gallery is not published.', 409);
        const data = await body(request);
        const picks = validateSelection(data.picks, gallery);
        const selection = { picks, submitted: new Date().toISOString() };
        const result = await store.setJSON(`selection/${id}`, selection, { onlyIfNew: true });
        if (!result.modified) {
          const existing = await store.get(`selection/${id}`, { type: 'json' });
          check(existing && existing.picks.length === picks.length && existing.picks.every(p => picks.includes(p)), 'Selections already submitted. Contact Film Stop for changes.', 409);
          return json(existing);
        }
        return json(selection);
      }
      return json({ error: 'Action not found.' }, 404);
    } catch (error) {
      if (!error.status) console.error('Photo review request failed', error.name);
      return json({ error: error.status ? error.message : 'Unable to complete this request. Please try again.' }, error.status || 500);
    }
  }
}
export default createHandler();
export const config = { rateLimit: { windowLimit: 600, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
