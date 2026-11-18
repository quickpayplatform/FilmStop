import { createHash } from 'node:crypto';
export const chunkSize = 3 * 1024 * 1024;
export function videoRange(header, size) {
  if (!header) return { start: 0, end: Math.min(size - 1, chunkSize - 1) };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const requestedEnd = match[1] && match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) return null;
  return { start, end: Math.min(requestedEnd, size - 1, start + chunkSize - 1) };
}
export async function videoAction({ action, request, url, id, gallery, owner, store, body, check, json, headers }) {
  const videoKey = `video/${id}`;
  if (action === 'video-init' && request.method === 'POST') {
    check(owner && !gallery.published && gallery.kind === 'video', 'Owner video draft required.', 403);
    const data = await body(request);
    check(typeof data.filename === 'string' && data.filename.length > 0 && data.filename.length < 500 && /\.mp4$/i.test(data.filename), 'Upload an MP4 review copy.');
    check(Number.isSafeInteger(data.size) && data.size > 0 && data.size <= 1024 ** 3, 'Maximum video size is 1 GB.');
    check(Number.isFinite(data.duration) && data.duration > 0 && data.duration <= 14400, 'Video must be shorter than four hours.');
    check(/^[a-f0-9]{64}$/.test(data.fingerprint || ''), 'Video fingerprint required.');
    const meta = { fingerprint: data.fingerprint, filename: data.filename, size: data.size, duration: data.duration, chunkSize, chunks: Math.ceil(data.size / chunkSize) };
    const result = await store.setJSON(`${videoKey}/meta`, meta, { onlyIfNew: true });
    if (!result.modified) {
      const previous = await store.get(`${videoKey}/meta`, { type: 'json' });
      check(previous.filename === meta.filename && previous.size === meta.size && previous.duration === meta.duration && previous.fingerprint === meta.fingerprint, 'This draft already contains another video. Create a new review for a different cut.', 409);
    }
    return json(meta);
  }
  if (action === 'video-upload' && request.method === 'POST') {
    check(owner && !gallery.published && gallery.kind === 'video', 'Owner video draft required.', 403);
    const meta = await store.get(`${videoKey}/meta`, { type: 'json' });
    check(meta, 'Initialize the video first.', 409);
    const index = Number(url.searchParams.get('chunk'));
    check(url.searchParams.has('chunk') && Number.isInteger(index) && index >= 0 && index < meta.chunks, 'Invalid video chunk.');
    const bytes = Buffer.from(await request.arrayBuffer());
    const expected = Math.min(chunkSize, meta.size - index * chunkSize);
    check(bytes.length === expected, 'Incomplete video chunk.');
    if (index === 0) check(bytes.toString('ascii', 4, 8) === 'ftyp', 'Use a browser-compatible MP4 file.');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const saved = await store.set(`${videoKey}/chunk/${index}`, new Blob([bytes]), { onlyIfNew: true, metadata: { size: expected, sha256 } });
    if (!saved.modified) {
      const previous = await store.getMetadata(`${videoKey}/chunk/${index}`);
      check(previous?.metadata.sha256 === sha256, 'This chunk differs from the uploaded video. Create a new review for another cut.', 409);
    }
    return json({ uploaded: index });
  }
  if (action === 'video-publish' && request.method === 'POST') {
    check(owner && gallery.kind === 'video', 'Owner access required.', 403);
    if (gallery.published) return json({ published: true });
    const meta = await store.get(`${videoKey}/meta`, { type: 'json' });
    check(meta, 'Upload a video first.');
    const parts = await Promise.all(Array.from({ length: meta.chunks }, (_, i) => store.getMetadata(`${videoKey}/chunk/${i}`)));
    check(parts.every((part, i) => part?.metadata.size === Math.min(chunkSize, meta.size - i * chunkSize)), 'Video upload is incomplete. Choose the same file to resume.');
    await store.setJSON(`published/${id}`, { video: meta }, { onlyIfNew: true });
    return json({ published: true });
  }
  if (action === 'video' && ['GET', 'HEAD'].includes(request.method)) {
    check(gallery.published && gallery.video, 'Video not available.', 404);
    const meta = gallery.video;
    const range = videoRange(request.headers.get('range'), meta.size);
    const videoHeaders = { ...headers, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Disposition': 'inline', 'Cross-Origin-Resource-Policy': 'same-origin' };
    if (!range) return new Response(null, { status: 416, headers: { ...videoHeaders, 'Content-Range': `bytes */${meta.size}` } });
    videoHeaders['Content-Range'] = `bytes ${range.start}-${range.end}/${meta.size}`;
    videoHeaders['Content-Length'] = String(range.end - range.start + 1);
    if (request.method === 'HEAD') return new Response(null, { status: 206, headers: videoHeaders });
    const first = Math.floor(range.start / chunkSize);
    const last = Math.floor(range.end / chunkSize);
    const parts = await Promise.all(Array.from({ length: last - first + 1 }, (_, i) => store.get(`${videoKey}/chunk/${first + i}`, { type: 'arrayBuffer' })));
    check(parts.every(Boolean), 'Video data unavailable. Try again.', 503);
    const bytes = Buffer.concat(parts.map(p => Buffer.from(p))).subarray(range.start - first * chunkSize, range.end - first * chunkSize + 1);
    return new Response(bytes, { status: 206, headers: videoHeaders });
  }
  if (action === 'video-draft' && request.method === 'GET') {
    check(owner && gallery.kind === 'video', 'Owner access required.', 403);
    const meta = await store.get(`${videoKey}/meta`, { type: 'json' });
    const { blobs } = await store.list({ prefix: `${videoKey}/chunk/` });
    return json({ meta, uploaded: blobs.map(p => Number(p.key.split('/').at(-1))) });
  }
  if (action === 'comments' && request.method === 'GET') {
    check(gallery.kind === 'video', 'Video review required.');
    const { blobs } = await store.list({ prefix: `comment/${id}/` });
    const comments = await Promise.all(blobs.map(({ key }) => store.get(key, { type: 'json' })));
    return json(comments.sort((a, b) => a.time - b.time || a.created.localeCompare(b.created)));
  }
  if (action === 'comment' && request.method === 'POST') {
    check(gallery.published && gallery.video, 'Published video required.', 409);
    const data = await body(request);
    check(/^[a-f0-9]{32}$/.test(data.id || ''), 'Invalid comment ID.');
    check(typeof data.author === 'string' && data.author.trim().length > 0 && data.author.length <= 100, 'Enter your name.');
    check(typeof data.text === 'string' && data.text.trim().length > 0 && data.text.length <= 4000, 'Enter a comment of up to 4,000 characters.');
    check(Number.isFinite(data.time) && data.time >= 0 && data.time <= gallery.video.duration, 'Choose a timestamp within the video.');
    const comment = { id: data.id, author: data.author.trim(), text: data.text.trim(), time: Math.round(data.time * 1000) / 1000, created: new Date().toISOString() };
    const saved = await store.setJSON(`comment/${id}/${data.id}`, comment, { onlyIfNew: true });
    if (!saved.modified) {
      const existing = await store.get(`comment/${id}/${data.id}`, { type: 'json' });
      check(existing.author === comment.author && existing.text === comment.text && existing.time === comment.time, 'Comment ID already used.', 409);
      return json(existing);
    }
    return json(comment);
  }
  return null;
}
