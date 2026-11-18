import {profileLink, $, api, endpoint, status, text } from './shared.js';
const id = new URLSearchParams(location.search).get('gallery');
let gallery;
let picks = new Set();
let current = 0;
const draftKey = `filmstop-picks-${id}`;
function save() {
  try { sessionStorage.setItem(draftKey, JSON.stringify([...picks])); } catch { /* Browsing can continue without local storage. */ }
}
function updateCount() {
  $('count').textContent = `${picks.size} of ${gallery.limit} selected`;
  $('viewer-count').textContent = $('count').textContent;
  $('submit').disabled = picks.size === 0 || Boolean(gallery.selection);
}
function toggle(photo) {
  if (gallery.selection) return;
  if (picks.has(photo.id)) picks.delete(photo.id);
  else {
    if (picks.size >= gallery.limit) { status(`You can choose up to ${gallery.limit} ${gallery.limit === 1 ? 'photo' : 'photos'}. Deselect one to choose another.`); $('viewer-count').textContent = 'Selection limit reached. Deselect a photo first.'; return; }
    picks.add(photo.id);
  }
  status(''); save(); render();
  if ($('viewer').open) view(current);
}
function view(index) {
  current = (index + gallery.photos.length) % gallery.photos.length;
  const photo = gallery.photos[current];
  $('large').src = endpoint('photo', id, { photo: photo.id });
  $('large').alt = photo.filename;
  $('filename').textContent = `${current + 1} / ${gallery.photos.length} · ${photo.filename}`;
  $('toggle-pick').textContent = picks.has(photo.id) ? '✓ Selected · Deselect' : 'Select photo';
  $('toggle-pick').disabled = Boolean(gallery.selection);
  updateCount();
}
function render() {
  const fragment = document.createDocumentFragment();
  gallery.photos.forEach((photo, index) => {
    if ($('selected-only').checked && !picks.has(photo.id)) return;
    const card = text('article', '', `card${picks.has(photo.id) ? ' selected' : ''}`);
    const open = text('button', '', 'open');
    open.setAttribute('aria-label', `View ${photo.filename}`);
    const img = document.createElement('img');
    img.src = endpoint('photo', id, { photo: photo.id }); img.alt = photo.filename; img.loading = 'lazy';
    open.append(img); open.onclick = () => { view(index); $('viewer').showModal(); };
    const meta = text('div', '', 'meta'); meta.append(text('p', photo.filename));
    const pick = text('button', picks.has(photo.id) ? '✓ Selected' : 'Select', 'pick');
    pick.setAttribute('aria-pressed', String(picks.has(photo.id))); pick.setAttribute('aria-label', `Select ${photo.filename}`);
    pick.disabled = Boolean(gallery.selection); pick.onclick = () => toggle(photo);
    meta.append(pick); card.append(open, meta); fragment.append(card);
  });
  $('photos').replaceChildren(fragment); updateCount();
}
async function load() {
  gallery = await api('gallery', id); profileLink(gallery);
  if (gallery.kind === 'video') { location.replace(`/review/video.html?gallery=${id}`); return; }
  picks = new Set(gallery.selection?.picks || []);
  if (!gallery.selection) {
    try { const saved = JSON.parse(sessionStorage.getItem(draftKey) || '[]'); picks = new Set(saved.filter(p => gallery.photos.some(photo => photo.id === p)).slice(0, gallery.limit)); } catch { /* Ignore invalid saved picks. */ }
  }
  $('access').hidden = true; $('gallery').hidden = false;
  $('title').textContent = gallery.title;
  $('instructions').textContent = `Choose up to ${gallery.limit} ${gallery.limit === 1 ? 'photo' : 'photos'} for editing. Tap a photo to view it larger, then select your favorites.`;
  $('submitted').hidden = !gallery.selection;
  if (gallery.selection) $('submitted').textContent = `Your ${picks.size} ${picks.size === 1 ? 'selection was' : 'selections were'} submitted to Film Stop. Thank you!`;
  render();
}
$('unlock').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try { await api('unlock', id, { passcode: new FormData(event.target).get('passcode') }); await load(); status(''); } catch (e) { status(e.message); } finally { button.disabled = false; }
};
$('selected-only').onchange = render;
$('prev').onclick = () => view(current - 1); $('next').onclick = () => view(current + 1);
$('close-viewer').onclick = () => $('viewer').close();
$('toggle-pick').onclick = () => toggle(gallery.photos[current]);
$('viewer').onkeydown = e => { if(e.key === 'ArrowLeft') view(current-1); if(e.key === 'ArrowRight') view(current+1); };
let touchX;
$('large').ontouchstart = e => { touchX = e.changedTouches[0].clientX; };
$('large').ontouchend = e => { const dx = e.changedTouches[0].clientX - touchX; if(Math.abs(dx)>60) view(current + (dx<0 ? 1 : -1)); };
$('submit').onclick = () => { $('confirm-text').textContent = `You have chosen ${picks.size} of up to ${gallery.limit} ${gallery.limit === 1 ? 'photo' : 'photos'}.`; $('confirm').showModal(); };
$('cancel-submit').onclick = () => $('confirm').close();
$('confirm-submit').onclick = async () => {
  $('confirm-submit').disabled = true;
  try { await api('submit', id, { picks: [...picks] }); $('confirm').close(); await load(); status('Selections saved. Film Stop can now see your editing list.'); } catch(e) { $('confirm').close(); status(e.message); } finally { $('confirm-submit').disabled = false; }
};
if (!id || !/^[a-f0-9]{32}$/.test(id)) { $('unlock').hidden = true; status('Open the complete gallery link shared by Film Stop.'); }
else load().catch(e => { if(e.status !== 401) status(e.message); });
