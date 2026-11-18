export function formatTimestamp(value) {
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  return `${hours ? String(hours).padStart(2, '0') + ':' : ''}${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
export async function feedbackAction({ action, request, id, gallery, owner, store, body, check, json }) {
  if (action === 'feedback' && request.method === 'POST') {
    check(gallery.published && gallery.video, 'Published video required.', 409);
    const data = await body(request);
    check(/^[a-f0-9]{32}$/.test(data.id || ''), 'Invalid submission ID.');
    check(typeof data.author === 'string' && data.author.trim().length > 0 && data.author.length <= 100, 'Enter your name.');
    check(Array.isArray(data.notes) && data.notes.length > 0 && data.notes.length <= 25, 'Add between 1 and 25 timestamped notes.');
    const notes = data.notes.map(note => {
      check(note && Number.isFinite(note.time) && note.time >= 0 && note.time <= gallery.video.duration, 'Each timestamp must be within the video.');
      check(typeof note.text === 'string' && note.text.trim().length > 0 && note.text.length <= 2000, 'Each timestamp needs a note of up to 2,000 characters.');
      return { time: Math.round(note.time * 1000) / 1000, text: note.text.trim() };
    });
    check(typeof data.general === 'string' && data.general.length <= 6000, 'General requests must be under 6,000 characters.');
    const feedback = { id: data.id, author: data.author.trim(), notes, general: data.general.trim(), title: gallery.title, created: new Date().toISOString() };
    const saved = await store.setJSON(`feedback/${id}/${data.id}`, feedback, { onlyIfNew: true });
    if (!saved.modified) {
      const existing = await store.get(`feedback/${id}/${data.id}`, { type: 'json' });
      check(existing.author === feedback.author && existing.general === feedback.general && JSON.stringify(existing.notes) === JSON.stringify(notes), 'This submission has already been saved with different notes. Reload to begin another submission.', 409);
    }
    return json({ fields: {
      'form-name': 'feedback-notes', name: feedback.author, 'video-title': gallery.title,
      'review-id': id, 'submission-id': data.id,
      'feedback-notes': notes.map(note => `${formatTimestamp(note.time)}\n${note.text}`).join('\n\n'),
      'general-request': feedback.general || 'No general requests.', 'bot-field': ''
    } });
  }
  if (action === 'feedback-delivered' && request.method === 'POST') {
    const data = await body(request);
    check(/^[a-f0-9]{32}$/.test(data.id || ''), 'Invalid submission ID.');
    check(await store.get(`feedback/${id}/${data.id}`, { type: 'json' }), 'Feedback submission not found.', 404);
    await store.setJSON(`feedback-delivered/${id}/${data.id}`, { confirmed: new Date().toISOString() }, { onlyIfNew: true });
    return json({ delivered: true });
  }
  if (action === 'feedback-list' && request.method === 'GET') {
    check(owner, 'Owner access required.', 403);
    const { blobs } = await store.list({ prefix: `feedback/${id}/` });
    return json(await Promise.all(blobs.map(({ key }) => store.get(key, { type: 'json' }))));
  }
  return null;
}
