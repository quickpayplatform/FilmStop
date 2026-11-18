export const $ = id => document.getElementById(id);
export function endpoint(action, gallery, extra = {}) {
  const params = new URLSearchParams({ action, ...extra });
  if (gallery) params.set('gallery', gallery);
  return `/.netlify/functions/photo-review?${params}`;
}
export async function api(action, gallery, data) {
  const response = await fetch(endpoint(action, gallery), data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Request failed.'), { status: response.status });
  return result;
}
export function status(message) { $('status').textContent = message; }
export function text(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}
export function photoCard(photo, gallery) {
  const card = document.createElement('article');
  card.className = 'card';
  const img = document.createElement('img');
  img.src = endpoint('photo', gallery, { photo: photo.id });
  img.alt = photo.filename;
  img.loading = 'lazy';
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.append(text('p', photo.filename));
  card.append(img, meta);
  return card;
}
