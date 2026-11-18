import { $, api, endpoint, status, text } from './shared.js';
const id = new URLSearchParams(location.search).get('gallery');
const player = $('player');
const form = $('feedback-form');
const draftKey = `filmstop-video-feedback-${id}`;
let gallery;
let submissionId = crypto.randomUUID().replaceAll('-', '');
let sending = false;
function timestamp(value) {
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  return `${hours ? String(hours).padStart(2, '0') + ':' : ''}${String(Math.floor(total % 3600 / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function seconds(value) {
  if (!/^\d{1,3}:\d{2}(:\d{2})?$/.test(value)) throw new Error('Enter each timestamp as mm:ss, such as 01:25.');
  const parts = value.split(':').map(Number);
  if (parts.slice(1).some(p => p > 59)) throw new Error('Timestamp minutes and seconds must be under 60.');
  return parts.reduce((total, part) => total * 60 + part, 0);
}
function rows() { return [...$('feedback-rows').children]; }
function updateRowLabels() {
  rows().forEach((row, index) => {
    row.querySelector('input').setAttribute('aria-label', `Timestamp ${index + 1}`);
    row.querySelector('textarea').setAttribute('aria-label', `Notes ${index + 1}`);
    row.querySelector('button').hidden = rows().length === 1;
    row.querySelector('button').setAttribute('aria-label', `Remove feedback note ${index + 1}`);
  });
  $('add-note').disabled = rows().length >= 25 || sending;
}
function saveDraft() {
  try {
    sessionStorage.setItem(draftKey, JSON.stringify({ submissionId, author: form.elements.author.value, general: form.elements.general.value, notes: rows().map(row => ({ time: row.querySelector('input').value, text: row.querySelector('textarea').value })) }));
  } catch { /* Feedback remains editable when browser storage is unavailable. */ }
}
function addRow(time = timestamp(player.currentTime || 0), note = '') {
  if (rows().length >= 25) { status('You can include up to 25 notes in one submission.'); return; }
  const row = text('div', '', 'feedback-row');
  const input = document.createElement('input');
  input.type = 'text'; input.required = true; input.placeholder = 'mm:ss'; input.value = time; input.maxLength = 12;
  const cell = text('div', '', 'feedback-note-cell');
  const textarea = document.createElement('textarea');
  textarea.required = true; textarea.maxLength = 2000; textarea.rows = 3; textarea.placeholder = 'Describe the change for this moment…'; textarea.value = note;
  const remove = text('button', 'Remove', 'remove-note'); remove.type = 'button';
  remove.onclick = () => { row.remove(); submissionId = crypto.randomUUID().replaceAll('-', ''); updateRowLabels(); saveDraft(); };
  cell.append(textarea, remove); row.append(input, cell); $('feedback-rows').append(row); updateRowLabels();
}
function restoreDraft() {
  let draft;
  try { draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null'); } catch { /* Ignore invalid saved data. */ }
  if (draft && Array.isArray(draft.notes) && draft.notes.length > 0 && draft.notes.length <= 25) {
    form.elements.author.value = typeof draft.author === 'string' ? draft.author : '';
    form.elements.general.value = typeof draft.general === 'string' ? draft.general : '';
    if (/^[a-f0-9]{32}$/.test(draft.submissionId)) submissionId = draft.submissionId;
    draft.notes.forEach(note => addRow(typeof note.time === 'string' ? note.time : '00:00', typeof note.text === 'string' ? note.text : ''));
  } else addRow('00:00');
}
async function load() {
  gallery = await api('gallery', id);
  if (gallery.kind !== 'video' || !gallery.published) throw new Error('This video review is not ready to view.');
  $('video-title').textContent = gallery.title; $('client-name').textContent = gallery.client;
  $('video-shell').classList.toggle('burned-watermark', Boolean(gallery.video.watermarked));
  player.src = endpoint('video', id);
  $('access').hidden = true; $('video-review').hidden = false;
  if (!rows().length) restoreDraft();
}
$('unlock').onsubmit = async event => {
  event.preventDefault(); event.submitter.disabled = true;
  try { await api('unlock', id, { passcode: new FormData(event.target).get('passcode') }); await load(); status(''); }
  catch(e) { status(e.message); } finally { event.submitter.disabled = false; }
};
player.oncontextmenu = event => event.preventDefault();
$('video-shell').oncontextmenu = event => event.preventDefault();
player.onerror = () => status('Playback failed. Refresh the page or enter the passcode again if your session has expired.');
$('add-note').onclick = () => { player.pause(); addRow(); submissionId = crypto.randomUUID().replaceAll('-', ''); saveDraft(); rows().at(-1).querySelector('textarea').focus(); };
form.oninput = () => { submissionId = crypto.randomUUID().replaceAll('-', ''); saveDraft(); };
form.onsubmit = async event => {
  event.preventDefault();
  if (sending || !form.reportValidity()) return;
  const notes = [];
  try {
    for (const row of rows()) {
      const input = row.querySelector('input'); input.setCustomValidity('');
      let time;
      try { time = seconds(input.value.trim()); if (time > gallery.video.duration) throw new Error('Choose a timestamp within this video.'); }
      catch(e) { input.setCustomValidity(e.message); input.reportValidity(); input.oninput = () => input.setCustomValidity(''); return; }
      notes.push({ time, text: row.querySelector('textarea').value });
    }
    sending = true; form.inert = true; $('submit-feedback').disabled = true; $('submit-feedback').textContent = 'Sending feedback…'; status('');
    const prepared = await api('feedback', id, { id: submissionId, author: form.elements.author.value, notes, general: form.elements.general.value });
    const response = await fetch('/review/video.html', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(prepared.fields).toString() });
    if (!response.ok) throw new Error('Your notes are saved, but delivery was interrupted. Please submit again to finish sending them.');
    await api('feedback-delivered', id, { id: submissionId }).catch(() => {});
    try { sessionStorage.removeItem(draftKey); } catch { /* The successful submission is already saved. */ }
    form.hidden = true; $('feedback-success').hidden = false; $('feedback-success').focus();
  } catch(e) { status(e.message || 'Unable to send your feedback. Please try again.'); }
  finally { sending = false; form.inert = false; $('submit-feedback').disabled = false; $('submit-feedback').textContent = 'Submit feedback'; updateRowLabels(); }
};
if (!/^[a-f0-9]{32}$/.test(id || '')) { $('unlock').hidden = true; status('Open the complete review link Film Stop shared with you.'); }
else load().catch(e => { if (e.status !== 401) status(e.message); });
