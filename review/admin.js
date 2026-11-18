import { $, api, endpoint, status, text, photoCard } from './shared.js';
let gallery;
let busy = false;
function panel(name) {
  for (const id of ['login-panel', 'dashboard', 'create-panel', 'project']) $(id).hidden = id !== name;
  status('');
}
async function list() {
  const projects = await api('list');
  panel('dashboard'); $('logout').hidden = false;
  $('projects').replaceChildren();
  if (!projects.length) $('projects').append(text('p', 'Create a gallery to begin.'));
  for (const project of projects) {
    const row = text('button', '', 'project-row');
    row.append(text('strong', project.title), text('span', project.submitted ? 'Selections received' : project.published ? 'Awaiting client selections' : 'Draft · Add photos'));
    row.onclick = () => open(project.id).catch(e => status(e.message));
    $('projects').append(row);
  }
}
async function open(id) {
  gallery = await api('gallery', id);
  panel('project');
  $('project-title').textContent = gallery.title;
  $('project-info').textContent = `Up to ${gallery.limit} ${gallery.limit === 1 ? 'selection' : 'selections'} · ${gallery.photos.length} ${gallery.photos.length === 1 ? 'photo' : 'photos'} · ${gallery.published ? 'Published' : 'Draft'}`;
  $('upload-panel').hidden = gallery.published;
  $('share').hidden = !gallery.published;
  $('share-url').value = `${location.origin}/review/?gallery=${id}`;
  $('results').hidden = !gallery.selection;
  $('project-photos').replaceChildren();
  const selected = new Set(gallery.selection?.picks || []);
  const shown = gallery.selection ? gallery.photos.filter(p => selected.has(p.id)) : gallery.photos;
  $('photo-heading').textContent = gallery.selection ? 'Photos to edit' : 'Uploaded photos';
  for (const photo of shown) {
    const card = photoCard(photo, id);
    if (selected.has(photo.id)) card.classList.add('selected');
    $('project-photos').append(card);
  }
  if (gallery.selection) {
    $('submission-date').textContent = `${shown.length} ${shown.length === 1 ? 'photo' : 'photos'} selected · ${new Date(gallery.selection.submitted).toLocaleString()}`;
    $('editing-list').replaceChildren(...shown.map(p => text('li', p.filename)));
  }
  $('publish').disabled = !gallery.photos.length;
}
$('login').onsubmit = async event => {
  event.preventDefault(); event.submitter.disabled = true;
  try { await api('owner-login', null, { password: new FormData(event.target).get('password') }); event.target.reset(); await list(); } catch(e) { status(e.message); } finally { event.submitter.disabled = false; }
};
$('logout').onclick = async () => { try { await api('logout', null, {}); $('logout').hidden = true; panel('login-panel'); } catch(e) { status(e.message); } };
$('new-project').onclick = () => { panel('create-panel'); $('create').reset(); const random = new Uint8Array(9); crypto.getRandomValues(random); $('create').elements.passcode.value = [...random].map(x => x.toString(16).padStart(2,'0')).join(''); };
$('cancel-create').onclick = () => panel('dashboard');
$('create').onsubmit = async event => {
  event.preventDefault(); event.submitter.disabled = true;
  const values = new FormData(event.target);
  try { const result = await api('create', null, { title: values.get('title'), passcode: values.get('passcode'), limit: Number(values.get('limit')) }); await open(result.id); } catch(e) { status(e.message); } finally { event.submitter.disabled = false; }
};
$('back').onclick = () => { if (!busy) list().catch(e => status(e.message)); };
async function preview(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .86));
  if (!blob || blob.size > 4 * 1024 * 1024) throw new Error('Preview is too large. Export a smaller JPEG.');
  return blob;
}
async function upload(files) {
  if (busy || !files.length) return;
  busy = true; $('publish').disabled = true; $('back').disabled = true;
  $('files').disabled = true; $('folder').disabled = true;
  let uploaded = 0; const failures = [];
  const supported = [...files].filter(f => /\.(jpe?g|png|webp)$/i.test(f.name) && !f.name.startsWith('._'));
  const skipped = files.length - supported.length;
  try {
    if (gallery.photos.length + supported.length > 1000) throw new Error('Each gallery supports up to 1,000 photos. Split this upload into separate galleries.');
    for (const file of supported) {
      $('upload-status').textContent = `Uploading ${uploaded + failures.length + 1} of ${supported.length} · ${file.name}`;
      try {
        const blob = await preview(file);
        const photo = crypto.randomUUID().replaceAll('-','');
        const filename = file.webkitRelativePath || file.name;
        const response = await fetch(endpoint('upload', gallery.id, { photo, filename }), { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
        if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Upload failed.'); }
        uploaded++;
      } catch(e) { failures.push(`${file.name}: ${e.message}`); }
    }
    await open(gallery.id);
    $('upload-status').textContent = `${uploaded} uploaded.${skipped ? ` ${skipped} unsupported or hidden files skipped.` : ''}${failures.length ? ` ${failures.length} failed. Choose those files again to retry.` : ''}`;
    if (failures.length) status(failures.join('\n'));
  } catch(e) { status(e.message); }
  finally { busy = false; $('back').disabled = false; $('files').disabled = false; $('folder').disabled = false; $('files').value = ''; $('folder').value = ''; $('publish').disabled = !gallery.photos.length; }
}
$('files').onchange = e => upload(e.target.files); $('folder').onchange = e => upload(e.target.files);
$('publish').onclick = async () => {
  if (busy) return;
  if (!confirm(`Publish ${gallery.photos.length} photos? The gallery will be ready to share. Uploads close after publishing.`)) return;
  $('publish').disabled = true;
  try { await api('publish', gallery.id, { photos: gallery.photos.map(p => p.id) }); await open(gallery.id); status('Gallery published. Copy the link and share it with your client.'); } catch(e) { status(e.message); $('publish').disabled = false; }
};
$('copy-link').onclick = async () => { try { await navigator.clipboard.writeText($('share-url').value); status('Gallery link copied.'); } catch { $('share-url').select(); status('Select and copy the gallery link above.'); } };
$('download').onclick = () => {
  const names = gallery.photos.filter(p => gallery.selection.picks.includes(p.id)).map(p => p.filename);
  const blob = new Blob([names.join('\n') + '\n'], { type: 'text/plain' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `filmstop-editing-list-${gallery.id}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener('beforeunload', e => { if (busy) { e.preventDefault(); e.returnValue = ''; } });
list().catch(e => { panel('login-panel'); if(e.status !== 401) status(e.message); });
