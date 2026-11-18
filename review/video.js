import { $, api, endpoint, status, text } from './shared.js';
const id = new URLSearchParams(location.search).get('gallery');
let gallery;
let comments = [];
let pendingId;
const player = $('player');
export function timestamp(seconds) {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  return `${hours ? String(hours).padStart(2,'0') + ':' : ''}${String(minutes).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}
function seconds(value) {
  if (!/^\d{1,3}:\d{2}(:\d{2})?$/.test(value)) throw new Error('Use a timestamp such as 01:25.');
  const parts = value.split(':').map(Number);
  if (parts.slice(1).some(p => p > 59)) throw new Error('Minutes and seconds must be under 60.');
  return parts.reduce((total, part) => total * 60 + part, 0);
}
function renderNotes() {
  $('note-count').textContent = `${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}`;
  $('notes').replaceChildren();
  if (!comments.length) $('notes').append(text('p', 'Pause at any moment and add your first note.'));
  for (const note of comments) {
    const card = text('article', '', 'note');
    const seek = text('button', timestamp(note.time), 'timecode');
    seek.onclick = () => { player.currentTime = note.time; player.pause(); };
    card.append(seek, text('strong', note.author), text('p', note.text), text('small', new Date(note.created).toLocaleString()));
    $('notes').append(card);
  }
}
async function refresh() { comments = await api('comments', id); renderNotes(); }
async function load() {
  gallery = await api('gallery', id);
  if (gallery.kind !== 'video' || !gallery.published) throw new Error('This video review is not ready to view.');
  $('video-title').textContent = gallery.title; $('client-name').textContent = gallery.client;
  $('export-notes').hidden = !gallery.owner;
  player.src = endpoint('video', id);
  $('access').hidden = true; $('video-review').hidden = false;
  await refresh();
}
$('unlock').onsubmit = async event => {
  event.preventDefault(); event.submitter.disabled = true;
  try { await api('unlock', id, { passcode: new FormData(event.target).get('passcode') }); await load(); status(''); }
  catch(e) { status(e.message); } finally { event.submitter.disabled = false; }
};
player.oncontextmenu = e => e.preventDefault();
$('video-shell').oncontextmenu = e => e.preventDefault();
player.ontimeupdate = () => { $('playback-time').textContent = timestamp(player.currentTime); };
player.onerror = () => status('Playback failed. Refresh the page or enter the passcode again if your session has expired.');
$('add-note').onclick = () => { player.pause(); $('note-form').elements.time.value = timestamp(player.currentTime); $('note-form').elements.text.focus(); };
$('refresh-notes').onclick = () => refresh().catch(e => status(e.message));
$('note-form').onsubmit = async event => {
  event.preventDefault(); $('post-note').disabled = true;
  const form = event.target;
  try {
    pendingId ||= crypto.randomUUID().replaceAll('-','');
    await api('comment', id, { id: pendingId, author: form.elements.author.value, time: seconds(form.elements.time.value.trim()), text: form.elements.text.value });
    pendingId = null; form.elements.text.value = ''; await refresh(); status('Your comment has been saved for Film Stop.');
  } catch(e) { status(e.message); }
  finally { $('post-note').disabled = false; }
};
$('note-form').oninput = () => { pendingId = null; };
$('export-notes').onclick = () => {
  const lines = comments.map(c => `${timestamp(c.time)} · ${c.author}\n${c.text}\n`);
  const blob = new Blob([`${gallery.title}\n\n${lines.join('\n')}`], { type:'text/plain' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'filmstop-video-feedback.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
};
if (!/^[a-f0-9]{32}$/.test(id || '')) { $('unlock').hidden = true; status('Open the complete review link Film Stop shared with you.'); }
else load().catch(e => { if (e.status !== 401) status(e.message); });
