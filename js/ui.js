/* Helpers de interfaz: iconos, hojas (sheets), avisos, mapas. */
const I = {
  svg(path, size = 22, sw = 2) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`; },
  home: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  map: '<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z"/><path d="M8 2v16M16 6v16"/>',
  route: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h6a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v9"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  nav: '<path d="M3 11l19-9-9 19-2-8z"/>',
  pin: '<path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13 7l4 4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  up: '<path d="M18 15l-6-6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  cloud: '<path d="M17.5 19a4.5 4.5 0 0 0 .4-9A7 7 0 0 0 4.3 12.5 4 4 0 0 0 6 19z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
};

const UI = {
  el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; },
  toast(msg, ms = 2600) {
    const t = document.getElementById('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(UI._toastT); UI._toastT = setTimeout(() => t.classList.add('hidden'), ms);
  },
  /* Hoja inferior. Devuelve el elemento .sheet; se cierra con UI.closeSheet() o botón atrás. */
  sheet(html, { onClose } = {}) {
    UI.closeSheet(true);
    const back = UI.el(`<div class="sheet-backdrop"><div class="sheet" role="dialog">${html}</div></div>`);
    back.addEventListener('click', e => { if (e.target === back) UI.closeSheet(); });
    document.getElementById('overlay').appendChild(back);
    UI._sheet = { el: back, onClose };
    history.pushState({ sheet: true }, '');
    return back.querySelector('.sheet');
  },
  closeSheet(silent) {
    const s = UI._sheet; if (!s) return;
    UI._sheet = null; s.el.remove();
    if (s.onClose) s.onClose();
    // al cerrar por código retiramos la entrada del historial sin que eso repinte la pantalla
    if (!silent && history.state && history.state.sheet) { UI._ignorePop = true; history.back(); }
    if (APP._dirty) { APP._dirty = false; APP.render(); }
  },
  /* Confirmación en hoja (la app no puede usar confirm()) */
  confirm(titulo, texto, { ok = 'Aceptar', cancel = 'Cancelar', danger = false } = {}) {
    return new Promise(res => {
      const s = UI.sheet(`<div class="grip"></div><h2>${U.esc(titulo)}</h2>${texto ? `<p class="muted" style="margin:0">${texto}</p>` : ''}
        <div class="btn-row"><button class="btn" data-a="c">${U.esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="ok">${U.esc(ok)}</button></div>`, { onClose: () => res(false) });
      s.querySelector('[data-a=ok]').onclick = () => { UI._sheet.onClose = null; UI.closeSheet(); res(true); };
      s.querySelector('[data-a=c]').onclick = () => UI.closeSheet();
    });
  },
  prompt(titulo, { valor = '', placeholder = '', ok = 'Guardar', multiline = false } = {}) {
    return new Promise(res => {
      const s = UI.sheet(`<div class="grip"></div><h2>${U.esc(titulo)}</h2>
        <div class="field">${multiline ? `<textarea id="pv" placeholder="${U.esc(placeholder)}">${U.esc(valor)}</textarea>` : `<input id="pv" value="${U.esc(valor)}" placeholder="${U.esc(placeholder)}">`}</div>
        <div class="btn-row"><button class="btn" data-a="c">Cancelar</button><button class="btn primary" data-a="ok">${U.esc(ok)}</button></div>`, { onClose: () => res(null) });
      const inp = s.querySelector('#pv'); setTimeout(() => inp.focus(), 50);
      s.querySelector('[data-a=ok]').onclick = () => { const v = inp.value; UI._sheet.onClose = null; UI.closeSheet(); res(v); };
      s.querySelector('[data-a=c]').onclick = () => UI.closeSheet();
    });
  },
  /* Dictado por voz (Web Speech API) sobre un textarea/input */
  dictar(input, btn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { UI.toast('Este navegador no permite dictar'); return; }
    if (UI._rec) { UI._rec.stop(); return; }
    const rec = new SR(); rec.lang = 'es-ES'; rec.interimResults = false; rec.continuous = false;
    UI._rec = rec; btn.style.color = 'var(--rojo)';
    rec.onresult = e => { const t = e.results[0][0].transcript; input.value = (input.value ? input.value.replace(/\s*$/, ' ') : '') + U.cap(t); input.dispatchEvent(new Event('input')); };
    rec.onend = () => { UI._rec = null; btn.style.color = ''; };
    rec.onerror = () => { UI._rec = null; btn.style.color = ''; UI.toast('No se entendió, prueba de nuevo'); };
    rec.start();
  },
  micBtn(targetId) { return `<button type="button" class="iconbtn flat" data-mic="${targetId}" aria-label="Dictar">${I.svg(I.mic, 20)}</button>`; },
  wireMics(root) { root.querySelectorAll('[data-mic]').forEach(b => { b.onclick = () => UI.dictar(root.querySelector('#' + b.dataset.mic), b); }); },

  /* ---------- teclado de PIN ----------
     opts: {titulo, sub, onEnter(pin) -> Promise<true|string error>, extra (html), fullscreen} */
  pinPad(opts) {
    let pin = '';
    const el = UI.el(`<div class="${opts.fullscreen ? 'lock' : 'pinpad-wrap'}"><div class="pinpad">
      <div class="col center" style="gap:6px;align-items:center"><div class="pin-title">${U.esc(opts.titulo)}</div><div class="muted small" id="pinSub">${U.esc(opts.sub || '')}</div></div>
      <div class="pin-dots" aria-live="polite">${[0, 1, 2, 3, 4, 5].map(() => '<span></span>').join('')}</div>
      <div class="pin-keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k === '' ? '<span></span>' : `<button type="button" data-k="${k}" aria-label="${k === '⌫' ? 'Borrar' : k}">${k}</button>`).join('')}</div>
      ${opts.extra || ''}</div></div>`);
    const dots = el.querySelectorAll('.pin-dots span'), sub = el.querySelector('#pinSub');
    const paint = () => dots.forEach((d, i) => { d.classList.toggle('on', i < pin.length); d.classList.toggle('hidden', i >= Math.max(4, pin.length)); });
    paint();
    let busy = false;
    const enter = async () => {
      busy = true;
      const r = await opts.onEnter(pin);
      if (r !== true) { sub.textContent = r || 'PIN incorrecto'; sub.style.color = 'var(--rojo)'; el.querySelector('.pin-dots').classList.add('shake'); setTimeout(() => el.querySelector('.pin-dots').classList.remove('shake'), 400); pin = ''; paint(); }
      busy = false;
    };
    el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
      if (busy) return;
      if (b.dataset.k === '⌫') pin = pin.slice(0, -1);
      else if (pin.length < 6) pin += b.dataset.k;
      paint();
      if (pin.length === 6 || (opts.auto && pin.length === opts.auto)) enter();
    });
    el.querySelector('.pin-keys').insertAdjacentHTML('afterend', `<button type="button" class="btn primary block" data-pin-ok style="margin-top:4px">Aceptar</button>`);
    el.querySelector('[data-pin-ok]').onclick = () => { if (pin.length >= 4 && !busy) enter(); else if (pin.length < 4) { sub.textContent = 'Mínimo 4 cifras'; } };
    el.reset = () => { pin = ''; paint(); };
    return el;
  },

  /* ---------- mapas (Leaflet + OpenStreetMap) ---------- */
  map(container, opts = {}) {
    const m = L.map(container, { zoomControl: false, attributionControl: true, ...opts });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    m.attributionControl.setPrefix('');
    return m;
  },
  pin(cls, label) { return L.divIcon({ className: '', html: `<div class="pin ${cls}${label != null ? ' num' : ''}">${label != null ? label : ''}</div>`, iconSize: label != null ? [26, 26] : [20, 20], iconAnchor: label != null ? [13, 13] : [10, 10], popupAnchor: [0, -12] }); },
  dot(key) { return `<span class="dot ${key}"></span>`; },
  stepper(id, val, min = 1) {
    return `<div class="stepper" data-stepper="${id}"><button type="button" data-d="-1" aria-label="Menos">−</button><span>${val}</span><button type="button" data-d="1" aria-label="Más">+</button></div>`;
  },
  horaInput(id, val) { return `<input type="time" id="${id}" value="${val || ''}" step="300">`; },
};
