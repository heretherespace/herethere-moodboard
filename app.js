import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const $ = (id) => document.getElementById(id);
let sb = null, user = null, cfg = {};
let sections = [], pins = [];
let renaming = null, lastSec = null, dlgState = null, hotPin = null;
const urlCache = new Map(); // image_path -> signed url
let tab = "All";
try { tab = localStorage.getItem("mb-tab") || "All"; } catch (e) {}

/* ---------- helpers ---------- */
function setStatus(m) { $("status").textContent = m || ""; }
function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }
const isPinterest = (u) => /(^|\.)pinterest\.|(^|\.)pin\.it$/.test(host(u));
const isInstagram = (u) => /(^|\.)instagram\.com$|(^|\.)instagr\.am$/.test(host(u));
const srcName = (u) => (isPinterest(u) ? "Pinterest" : isInstagram(u) ? "Instagram" : host(u));
const safeUrl = (u) => { u = String(u || "").trim(); return /^https?:\/\//i.test(u) ? u : ""; };
function armed(btn, label, fn) {
  btn.addEventListener("click", () => {
    if (btn.dataset.armed) { fn(); return; }
    const o = btn.innerHTML; btn.dataset.armed = "1"; btn.textContent = label;
    setTimeout(() => { delete btn.dataset.armed; btn.innerHTML = o; }, 2600);
  });
}
function fail(e, msg) { console.error(e); setStatus(msg || "Couldn't save that change. Check your connection and try again."); }
const byOrder = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.created_at).localeCompare(String(b.created_at));
const mains = () => sections.filter((s) => !s.parent_id || !sections.some((m) => m.id === s.parent_id)).sort(byOrder);
const subsOf = (id) => sections.filter((s) => s.parent_id === id).sort(byOrder);
const secLabel = (s) => { const m = s.parent_id && sections.find((x) => x.id === s.parent_id); return m ? m.title + " › " + s.title : s.title; };
const imgUrl = (path) => urlCache.get(path) || "";

async function signUrls(paths) {
  const need = [...new Set(paths.filter((p) => p && !urlCache.has(p)))];
  if (!need.length) return;
  const { data, error } = await sb.storage.from("pins").createSignedUrls(need, 60 * 60 * 6);
  if (error) { fail(error, "Couldn't load some photos."); return; }
  data.forEach((d) => { if (d.signedUrl) urlCache.set(d.path, d.signedUrl); });
}

/* ---------- data ---------- */
async function loadAll() {
  const [s, p] = await Promise.all([
    sb.from("sections").select("*"),
    sb.from("pins").select("*"),
  ]);
  if (s.error || p.error) { fail(s.error || p.error, "Couldn't load your board. Reload to try again."); return; }
  sections = s.data; pins = p.data;
  await signUrls(pins.map((x) => x.image_path));
  render();
}

async function resizeImage(file) {
  // Downscale large photos to 2000px on the long side to keep storage light.
  try {
    const bm = await createImageBitmap(file);
    const max = 2000, k = Math.min(1, max / Math.max(bm.width, bm.height));
    if (k === 1 && file.size < 1.5e6) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k);
    c.getContext("2d").drawImage(bm, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b || file), "image/jpeg", 0.86));
  } catch (e) { return file; }
}
async function uploadImage(file) {
  const blob = await resizeImage(file);
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/gif" ? "gif" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("pins").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
  if (error) throw error;
  await signUrls([path]);
  return path;
}
async function removeFiles(paths) {
  paths = paths.filter(Boolean);
  if (paths.length) await sb.storage.from("pins").remove(paths);
}

/* ---------- rendering ---------- */
function tile(p) {
  const fig = document.createElement("figure"); fig.className = "tile"; fig.dataset.span = String(p.size || 1);
  const link = safeUrl(p.link);
  if (p.image_path) {
    const im = document.createElement("img");
    im.src = imgUrl(p.image_path); im.alt = p.caption || "Pinned image"; im.loading = "lazy";
    im.onclick = () => openLb(p); im.onload = () => layoutSoon();
    fig.appendChild(im);
    if (p.caption || link) {
      const c = document.createElement("figcaption"); c.className = "cap";
      if (p.caption) { const t = document.createElement("span"); t.textContent = p.caption; c.appendChild(t); }
      if (link) { const a = document.createElement("a"); a.className = "src"; a.href = link; a.target = "_blank"; a.rel = "noopener"; a.textContent = srcName(link) + " ↗"; c.appendChild(a); }
      fig.appendChild(c);
    }
  } else {
    const a = document.createElement(link ? "a" : "div");
    a.className = "linkcard" + (isInstagram(link) ? " ig" : "");
    if (link) { a.href = link; a.target = "_blank"; a.rel = "noopener"; }
    const k = document.createElement("span"); k.className = "k";
    k.textContent = link ? (isPinterest(link) ? "Pinterest pin" : isInstagram(link) ? "Instagram post" : "Link") : "Note";
    const t = document.createElement("span"); t.className = "t";
    t.textContent = p.caption || (isPinterest(link) ? "Pinterest reference" : isInstagram(link) ? "Instagram reference" : host(link) || "Untitled");
    const u = document.createElement("span"); u.className = "u";
    u.textContent = link ? link.replace(/^https?:\/\/(www\.)?/, "") + " ↗" : "";
    const ai = document.createElement("button"); ai.type = "button"; ai.className = "addimg"; ai.textContent = "+ Add image (or hover & paste)";
    ai.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); openDlg({ mode: "edit", pin: p }); };
    a.append(k, t, u, ai); fig.appendChild(a);
    fig.addEventListener("mouseenter", () => { hotPin = p.id; fig.classList.add("hot"); });
    fig.addEventListener("mouseleave", () => { if (hotPin === p.id) hotPin = null; fig.classList.remove("hot"); });
  }
  const bar = document.createElement("div"); bar.className = "tbar";
  [[1, "S", "Small"], [2, "M", "Medium (2 columns)"], [3, "L", "Large (3 columns)"]].forEach(([n, l, title]) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "sz"; b.textContent = l; b.title = title;
    b.setAttribute("aria-label", "Size " + title); b.setAttribute("aria-pressed", String((p.size || 1) === n));
    b.onclick = (ev) => { ev.stopPropagation(); setSize(p, n); };
    bar.appendChild(b);
  });
  const e = document.createElement("button"); e.type = "button"; e.textContent = "✎"; e.setAttribute("aria-label", "Edit pin");
  e.onclick = () => openDlg({ mode: "edit", pin: p }); bar.appendChild(e);
  fig.appendChild(bar);
  return fig;
}

let layT = 0;
function layoutSoon() { cancelAnimationFrame(layT); layT = requestAnimationFrame(layout); }
function layout() {
  document.querySelectorAll(".grid").forEach((g) => {
    const cols = Math.max(1, getComputedStyle(g).gridTemplateColumns.split(" ").filter(Boolean).length);
    [...g.children].forEach((c) => { c.style.gridColumn = "span " + Math.min(Number(c.dataset.span || 1), cols); });
    [...g.children].forEach((c) => { c.style.gridRowEnd = "span " + Math.max(1, Math.ceil((c.getBoundingClientRect().height + 14) / 4)); });
  });
}
async function setSize(p, n) {
  if ((p.size || 1) === n) return;
  p.size = n; render();
  const { error } = await sb.from("pins").update({ size: n }).eq("id", p.id);
  if (error) fail(error);
}

function controls(tools, s, i, n, isMain) {
  const mk = (txt, label, fn, dis) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "icon"; b.textContent = txt;
    b.setAttribute("aria-label", label); b.title = label; b.disabled = !!dis; if (fn) b.onclick = fn; tools.appendChild(b); return b;
  };
  mk("↑", "Move " + s.title + " up", () => moveSec(s, -1), i === 0);
  mk("↓", "Move " + s.title + " down", () => moveSec(s, 1), i === n - 1);
  mk("✎", "Rename " + s.title, () => { renaming = s.id; render(); });
  const ids = isMain ? [s.id, ...subsOf(s.id).map((x) => x.id)] : [s.id];
  const cnt = pins.filter((p) => ids.includes(p.section_id)).length;
  const del = mk("✕", "Delete " + s.title, null);
  armed(del, cnt ? "Delete with " + cnt + " pins?" : "Delete?", () => deleteSec(s));
}
function titleEl(tag, cls, s) {
  const h = document.createElement(tag); h.className = cls; h.id = "h-" + s.id;
  if (renaming === s.id) {
    const inp = document.createElement("input"); inp.id = "rename-" + s.id; inp.value = s.title; inp.maxLength = 60; inp.setAttribute("aria-label", "Section name");
    const done = async (save) => {
      if (renaming !== s.id) return; renaming = null;
      const v = inp.value.trim();
      if (save && v && v !== s.title) { s.title = v; render(); const { error } = await sb.from("sections").update({ title: v }).eq("id", s.id); if (error) fail(error); }
      else render();
    };
    inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); done(true); } if (ev.key === "Escape") done(false); });
    inp.addEventListener("blur", () => done(true));
    h.appendChild(inp); setTimeout(() => { inp.focus(); inp.select(); }, 0);
  } else h.textContent = s.title;
  return h;
}
function pinGrid(sec, label) {
  const grid = document.createElement("div"); grid.className = "grid";
  const add = document.createElement("button"); add.type = "button"; add.className = "addtile";
  add.innerHTML = "<b>+ Add</b><span>Paste, drop or upload images · Pinterest or Instagram link</span>";
  add.setAttribute("aria-label", "Add pin to " + label);
  add.onclick = () => openDlg({ mode: "add", sectionId: sec.id });
  add.addEventListener("dragover", (ev) => { if ([...(ev.dataTransfer?.types || [])].includes("Files")) { ev.preventDefault(); add.classList.add("dropping"); } });
  add.addEventListener("dragleave", () => add.classList.remove("dropping"));
  add.addEventListener("drop", (ev) => { add.classList.remove("dropping"); const f = imgFiles(ev.dataTransfer); if (!f.length) return; ev.preventDefault(); openDlg({ mode: "add", sectionId: sec.id }); addFiles(f); });
  grid.appendChild(add);
  pins.filter((p) => p.section_id === sec.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).forEach((p) => grid.appendChild(tile(p)));
  return grid;
}

function render() {
  const ms = mains();
  if (tab !== "All" && !ms.some((m) => m.id === tab)) tab = "All";
  $("count").textContent = pins.length + " pin" + (pins.length === 1 ? "" : "s") + " · " + ms.length + " board" + (ms.length === 1 ? "" : "s");
  $("add-any").hidden = !sections.length;
  const tabs = $("tabs"); tabs.innerHTML = ""; tabs.hidden = ms.length < 2;
  ["All", ...ms.map((m) => m.id)].forEach((id) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "tab"; b.setAttribute("aria-pressed", String(tab === id));
    b.textContent = id === "All" ? "All" : ms.find((m) => m.id === id).title;
    b.onclick = () => { tab = id; try { localStorage.setItem("mb-tab", id); } catch (e) {} render(); };
    tabs.appendChild(b);
  });
  const board = $("board"); board.innerHTML = "";
  if (!ms.length) {
    const n = document.createElement("p"); n.className = "empty-note";
    n.textContent = "No boards yet. Add a main section, for example HERE Senbonkita, then subsections like Artwork or Carpet.";
    board.appendChild(n); return;
  }
  ms.forEach((m, mi) => {
    if (tab !== "All" && tab !== m.id) return;
    const wrap = document.createElement("section"); wrap.className = "main"; wrap.setAttribute("aria-labelledby", "h-" + m.id);
    const head = document.createElement("div"); head.className = "main-head";
    const left = document.createElement("div"); left.style.minWidth = "0";
    const subs = subsOf(m.id);
    const ids = [m.id, ...subs.map((x) => x.id)];
    const total = pins.filter((p) => ids.includes(p.section_id)).length;
    const kick = document.createElement("span"); kick.className = "kick";
    kick.textContent = subs.length + " subsection" + (subs.length === 1 ? "" : "s") + " · " + total + " pin" + (total === 1 ? "" : "s");
    left.append(kick, titleEl("h2", "main-title", m));
    const tools = document.createElement("div"); tools.className = "sec-tools";
    const sb2 = document.createElement("button"); sb2.type = "button"; sb2.className = "btn"; sb2.textContent = "+ Subsection"; sb2.onclick = () => addSub(m);
    tools.appendChild(sb2); controls(tools, m, mi, ms.length, true);
    head.append(left, tools); wrap.appendChild(head);
    const direct = pins.filter((p) => p.section_id === m.id);
    if (direct.length || !subs.length) wrap.appendChild(pinGrid(m, m.title));
    const sw = document.createElement("div"); sw.className = "subs";
    subs.forEach((s, i) => {
      const sec = document.createElement("section"); sec.className = "sec"; sec.setAttribute("aria-labelledby", "h-" + s.id);
      const sh = document.createElement("div"); sh.className = "sec-head";
      const no = document.createElement("span"); no.className = "sec-no"; no.textContent = String(i + 1).padStart(2, "0");
      const st = document.createElement("div"); st.className = "sec-tools";
      const n = pins.filter((p) => p.section_id === s.id).length;
      const cnt = document.createElement("span"); cnt.className = "sec-no"; cnt.style.padding = "0 6px"; cnt.textContent = n + " pin" + (n === 1 ? "" : "s"); st.appendChild(cnt);
      controls(st, s, i, subs.length, false);
      sh.append(no, titleEl("h3", "sec-title", s), st);
      const rule = document.createElement("div"); rule.className = "sec-rule";
      sec.append(sh, rule, pinGrid(s, secLabel(s))); sw.appendChild(sec);
    });
    if (subs.length) wrap.appendChild(sw);
    board.appendChild(wrap);
  });
  layoutSoon();
}

/* ---------- sections ---------- */
async function addMain(title) {
  const sort = mains().reduce((m, s) => Math.max(m, s.sort ?? 0), -1) + 1;
  const { data, error } = await sb.from("sections").insert({ title, parent_id: null, sort }).select().single();
  if (error) { fail(error); return null; }
  sections.push(data); return data;
}
async function addSub(m) {
  const sort = subsOf(m.id).reduce((x, s) => Math.max(x, s.sort ?? 0), -1) + 1;
  const { data, error } = await sb.from("sections").insert({ title: "New subsection", parent_id: m.id, sort }).select().single();
  if (error) { fail(error); return; }
  sections.push(data); renaming = data.id; render();
}
async function moveSec(sec, dir) {
  const sib = sec.parent_id && sections.some((x) => x.id === sec.parent_id) ? subsOf(sec.parent_id) : mains();
  const i = sib.findIndex((s) => s.id === sec.id), j = i + dir;
  if (j < 0 || j >= sib.length) return;
  [sib[i], sib[j]] = [sib[j], sib[i]];
  const changed = [];
  sib.forEach((s, k) => { if (s.sort !== k) { s.sort = k; changed.push(s); } });
  render();
  for (const s of changed) { const { error } = await sb.from("sections").update({ sort: s.sort }).eq("id", s.id); if (error) { fail(error); break; } }
}
async function deleteSec(s) {
  const ids = [s.id, ...subsOf(s.id).map((x) => x.id)];
  const gone = pins.filter((p) => ids.includes(p.section_id));
  const { error } = await sb.from("sections").delete().eq("id", s.id); // pins and subsections cascade
  if (error) { fail(error); return; }
  await removeFiles(gone.map((p) => p.image_path));
  sections = sections.filter((x) => !ids.includes(x.id)); pins = pins.filter((p) => !ids.includes(p.section_id)); render();
}

/* ---------- images in the dialog ---------- */
function imgFiles(dt) {
  if (!dt) return [];
  const out = [];
  if (dt.items) for (const it of dt.items) if (it.kind === "file" && /^image\//.test(it.type)) { const f = it.getAsFile(); if (f) out.push(f); }
  if (!out.length && dt.files) for (const f of dt.files) if (/^image\//.test(f.type)) out.push(f);
  return out;
}
const DEFAULT_HINT = "Each image becomes its own pin. A link with no image becomes a link card.";
async function addFiles(files) {
  $("dlg-save").disabled = true;
  $("dlg-hint").textContent = "Uploading " + files.length + " image" + (files.length > 1 ? "s" : "") + "…";
  let ok = 0;
  for (const f of files) {
    try { const path = await uploadImage(f); if (dlgState) { dlgState.images.push(path); dlgState.fresh.push(path); drawThumbs(); } ok++; }
    catch (e) { console.error(e); }
  }
  $("dlg-save").disabled = false;
  $("dlg-hint").textContent = ok === files.length ? DEFAULT_HINT : "Some images couldn't be uploaded. Try PNG or JPG.";
}
function drawThumbs() {
  const t = $("thumbs"); t.innerHTML = "";
  (dlgState ? dlgState.images : []).forEach((path, i) => {
    const d = document.createElement("div"); d.className = "th";
    const img = document.createElement("img"); img.src = imgUrl(path); img.alt = "Image " + (i + 1);
    const x = document.createElement("button"); x.type = "button"; x.textContent = "✕"; x.setAttribute("aria-label", "Remove image " + (i + 1));
    x.onclick = () => { dlgState.images.splice(i, 1); drawThumbs(); };
    d.append(img, x); t.appendChild(d);
  });
}

/* ---------- dialog ---------- */
function fillSecSelect(sel) {
  const s = $("f-sec"); s.innerHTML = "";
  mains().forEach((m) => {
    const g = document.createElement("optgroup"); g.label = m.title;
    const om = document.createElement("option"); om.value = m.id; om.textContent = m.title + " (no subsection)"; g.appendChild(om);
    subsOf(m.id).forEach((x) => { const o = document.createElement("option"); o.value = x.id; o.textContent = x.title; g.appendChild(o); });
    s.appendChild(g);
  });
  const ok = (id) => id && sections.some((x) => x.id === id);
  const firstSub = (() => { for (const m of mains()) { const ss = subsOf(m.id); if (ss.length) return ss[0].id; } return (mains()[0] || {}).id || ""; })();
  s.value = ok(sel) ? sel : tab !== "All" && ok(tab) ? (subsOf(tab)[0] || { id: tab }).id : firstSub;
}
function openDlg(o) {
  if (!sections.length) return;
  const edit = o.mode === "edit"; const p = o.pin || {};
  dlgState = { mode: o.mode, pinId: p.id || null, images: edit && p.image_path ? [p.image_path] : [], fresh: [], original: edit ? p.image_path : null };
  $("dlg-h").textContent = edit ? "Edit pin" : "Add pin";
  $("f-link").value = edit ? p.link || "" : o.link || "";
  $("f-cap").value = edit ? p.caption || "" : "";
  fillSecSelect(edit ? p.section_id : o.sectionId || lastSec);
  const del = $("dlg-del"); del.hidden = !edit; del.textContent = "Delete"; delete del.dataset.armed;
  $("dlg-hint").textContent = edit ? "Replace the image by removing it and pasting a new one." : DEFAULT_HINT;
  drawThumbs();
  if (!$("dlg").open) { try { $("dlg").showModal(); } catch (e) {} }
  setTimeout(() => (edit ? $("f-link") : $("drop")).focus(), 0);
}
function closeDlg(discard) {
  if (discard && dlgState) removeFiles(dlgState.fresh); // uploads that never became pins
  dlgState = null; try { $("dlg").close(); } catch (e) {}
}
$("dlg-cancel").onclick = () => closeDlg(true);
$("dlg").addEventListener("cancel", () => { if (dlgState) removeFiles(dlgState.fresh); dlgState = null; });
$("pick").onclick = (ev) => { ev.stopPropagation(); $("file").click(); };
$("file").onchange = () => { const f = [...$("file").files]; $("file").value = ""; if (f.length) addFiles(f); };
const drop = $("drop");
drop.addEventListener("beforeinput", (ev) => ev.preventDefault());
drop.addEventListener("keydown", (ev) => { if (!(ev.metaKey || ev.ctrlKey) && ev.key !== "Tab") ev.preventDefault(); });
drop.addEventListener("dragover", (ev) => { ev.preventDefault(); drop.classList.add("dropping"); });
drop.addEventListener("dragleave", () => drop.classList.remove("dropping"));
drop.addEventListener("drop", (ev) => { ev.preventDefault(); drop.classList.remove("dropping"); const f = imgFiles(ev.dataTransfer); if (f.length) addFiles(f); });
$("dlg-del").addEventListener("click", async () => {
  const b = $("dlg-del");
  if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Delete this pin?"; return; }
  const st = dlgState; closeDlg(false); if (!st || !st.pinId) return;
  const { error } = await sb.from("pins").delete().eq("id", st.pinId);
  if (error) { fail(error); return; }
  await removeFiles([st.original, ...st.fresh]);
  pins = pins.filter((p) => p.id !== st.pinId); render();
});
$("dlg-form").addEventListener("submit", async (ev) => {
  ev.preventDefault(); if (!dlgState) return;
  const link = safeUrl($("f-link").value), caption = $("f-cap").value.trim(), section_id = $("f-sec").value;
  if ($("f-link").value.trim() && !link) { $("dlg-hint").textContent = "Links need to start with https://"; return; }
  const st = dlgState; lastSec = section_id;
  if (st.mode === "edit") {
    const image_path = st.images[0] || null;
    if (!image_path && !link && !caption) { $("dlg-hint").textContent = "Add an image, a link or a caption."; return; }
    closeDlg(false);
    const { data, error } = await sb.from("pins").update({ link, caption, section_id, image_path }).eq("id", st.pinId).select().single();
    if (error) { fail(error); return; }
    pins = pins.map((p) => (p.id === data.id ? data : p));
    const extras = st.images.slice(1).map((path) => ({ section_id, image_path: path, link, caption }));
    if (extras.length) { const r = await sb.from("pins").insert(extras).select(); if (r.error) fail(r.error); else pins.push(...r.data); }
    if (st.original && !st.images.includes(st.original)) removeFiles([st.original]);
    render(); return;
  }
  if (!st.images.length && !link) { $("dlg-hint").textContent = "Paste an image or add a link first."; return; }
  closeDlg(false);
  const rows = st.images.length ? st.images.map((path) => ({ section_id, image_path: path, link, caption })) : [{ section_id, image_path: null, link, caption }];
  const { data, error } = await sb.from("pins").insert(rows).select();
  if (error) { fail(error); return; }
  pins.push(...data); render();
});

/* ---------- paste anywhere ---------- */
document.addEventListener("paste", async (ev) => {
  if (!user || !sections.length) return;
  const f = imgFiles(ev.clipboardData);
  const tag = (ev.target && ev.target.tagName) || ""; const inField = /INPUT|TEXTAREA|SELECT/.test(tag);
  if (f.length && !dlgState && hotPin) {
    const pin = pins.find((x) => x.id === hotPin && !x.image_path);
    if (pin) {
      ev.preventDefault(); setStatus("Adding image…");
      try { const path = await uploadImage(f[0]); const { error } = await sb.from("pins").update({ image_path: path }).eq("id", pin.id); if (error) throw error; pin.image_path = path; setStatus(""); render(); }
      catch (e) { fail(e); }
      return;
    }
  }
  if (f.length) {
    ev.preventDefault();
    const lt = safeUrl((ev.clipboardData && ev.clipboardData.getData("text")) || "");
    if (!dlgState) openDlg({ mode: "add", sectionId: lastSec, link: lt }); else if (lt && !$("f-link").value) $("f-link").value = lt;
    addFiles(f); return;
  }
  if (inField || dlgState) return;
  const txt = ((ev.clipboardData && ev.clipboardData.getData("text")) || "").trim();
  if (safeUrl(txt)) { ev.preventDefault(); openDlg({ mode: "add", sectionId: lastSec, link: txt }); }
});

/* ---------- lightbox, header controls ---------- */
function openLb(p) {
  $("lb-img").src = imgUrl(p.image_path); $("lb-img").alt = p.caption || "Pinned image"; $("lb-cap").textContent = p.caption || "";
  const l = safeUrl(p.link); $("lb-link").hidden = !l; if (l) $("lb-link").href = l;
  try { $("lb").showModal(); } catch (e) {}
}
$("lb-close").onclick = () => $("lb").close();
$("lb").addEventListener("click", (ev) => { if (ev.target === $("lb")) $("lb").close(); });
$("add-any").onclick = () => openDlg({ mode: "add", sectionId: lastSec });
$("add-main").onclick = async () => {
  const m = await addMain("New board"); if (!m) return;
  tab = "All"; try { localStorage.setItem("mb-tab", "All"); } catch (e) {}
  renaming = m.id; render();
  setTimeout(() => { const el = $("h-" + m.id); if (el) el.scrollIntoView({ block: "center" }); }, 60);
};
$("newsec").addEventListener("submit", async (ev) => {
  ev.preventDefault(); const t = $("newsec-title").value.trim(); if (!t) return;
  $("newsec-title").value = ""; if (await addMain(t)) render();
});
(function () {
  const z = $("zoom"); let v = 220; try { v = Number(localStorage.getItem("mb-zoom")) || 220; } catch (e) {}
  z.value = v;
  const apply = () => { $("board").style.setProperty("--col", z.value + "px"); layoutSoon(); };
  z.addEventListener("input", () => { apply(); try { localStorage.setItem("mb-zoom", z.value); } catch (e) {} });
  apply();
  if (window.ResizeObserver) new ResizeObserver(layoutSoon).observe($("board")); else window.addEventListener("resize", layoutSoon);
})();

/* ---------- one-time import from the Claude moodboard artifact ---------- */
let manifest = null;
async function checkImport() {
  try { if (localStorage.getItem("mb-imported-v1")) return; } catch (e) {}
  try { const r = await fetch("/migrate/manifest.json", { cache: "no-store" }); if (!r.ok) return; manifest = await r.json(); } catch (e) { return; }
  $("import-text").textContent = "Bring in your " + manifest.pins.length + " pins and " + manifest.sections.length + " sections from the Claude moodboard.";
  $("importbar").hidden = false;
}
$("import-btn").onclick = async () => {
  if (!manifest) return;
  const btn = $("import-btn"); btn.disabled = true;
  const say = (t) => { $("import-text").textContent = t; };
  try {
    const idFor = {};
    const findExisting = (title, parentId) => sections.find((s) => s.title.trim().toLowerCase() === title.trim().toLowerCase() && (s.parent_id || null) === (parentId || null));
    const ordered = [...manifest.sections.filter((s) => !s.parent), ...manifest.sections.filter((s) => s.parent)];
    for (const s of ordered) {
      const parentId = s.parent ? idFor[s.parent] : null;
      if (s.parent && !parentId) continue;
      const ex = findExisting(s.title, parentId);
      if (ex) { idFor[s.key] = ex.id; continue; }
      const { data, error } = await sb.from("sections").insert({ title: s.title, parent_id: parentId, sort: s.sort ?? 0 }).select().single();
      if (error) throw error;
      sections.push(data); idFor[s.key] = data.id;
    }
    let n = 0;
    for (const p of manifest.pins) {
      n++; say("Importing pin " + n + " of " + manifest.pins.length + "…");
      const section_id = idFor[p.section]; if (!section_id) continue;
      let image_path = null;
      if (p.file) {
        const blob = await (await fetch("/migrate/" + p.file)).blob();
        image_path = await uploadImage(new File([blob], p.file, { type: blob.type || "image/jpeg" }));
      }
      const row = { section_id, image_path, link: p.link || "", caption: p.caption || "", size: p.size || 1 };
      if (p.created) row.created_at = p.created;
      const { data, error } = await sb.from("pins").insert(row).select().single();
      if (error) throw error;
      pins.push(data);
    }
    try { localStorage.setItem("mb-imported-v1", "1"); } catch (e) {}
    say("Imported " + manifest.pins.length + " pins. Your old moodboard is still there too.");
    btn.hidden = true; render();
  } catch (e) {
    console.error(e); say("Import stopped: " + (e.message || e) + ". Press Import to try again.");
    btn.disabled = false;
  }
};

/* ---------- auth + boot ---------- */
$("login-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = $("login-email").value.trim(); if (!email) return;
  $("login-btn").disabled = true; $("login-status").textContent = "Sending…";
  let msg = "";
  try {
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    if (error) msg = error.message;
  } catch (e) { msg = e.message || String(e); }
  if (msg) {
    // Ask Supabase directly so the message says what actually went wrong.
    try {
      const r = await fetch(cfg.supabaseUrl + "/auth/v1/otp?redirect_to=" + encodeURIComponent(location.origin), {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.supabaseAnonKey },
        body: JSON.stringify({ email, create_user: true }),
      });
      const t = (await r.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
      if (r.ok) msg = "";
      else msg += " (Supabase said " + r.status + ": " + (t || r.statusText) + ")";
    } catch (e2) { msg += " (couldn't reach Supabase: " + (e2.message || e2) + ")"; }
  }
  $("login-btn").disabled = false;
  $("login-status").textContent = msg ? "Couldn't send the link: " + msg : "Check your email and tap the link. You can close this tab.";
});
$("show-link").onclick = () => { $("login-form").hidden = false; $("login-email").value = $("pw-email").value; $("login-email").focus(); };
$("pw-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = $("pw-email").value.trim(), password = $("pw-pass").value;
  if (!email || !password) return;
  $("pw-btn").disabled = true; $("login-status").textContent = "Signing in…";
  const { error } = await sb.auth.signInWithPassword({ email, password });
  $("pw-btn").disabled = false;
  $("login-status").textContent = error ? "Couldn't sign in: " + error.message : "";
});
$("signout").onclick = async () => { await sb.auth.signOut(); location.reload(); };

function showApp(on) { $("app").hidden = !on; $("login").hidden = on; }

async function boot() {
  try { cfg = await (await fetch("/api/config", { cache: "no-store" })).json(); } catch (e) { cfg = {}; }
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    showApp(false); $("login-form").hidden = true; $("pw-form").hidden = true;
    $("login-status").textContent = "Setup isn't finished: add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel, then redeploy.";
    return;
  }
  sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
  const start = async (session) => {
    user = session ? session.user : null;
    if (!user) { showApp(false); return; }
    $("who").textContent = user.email || "";
    showApp(true); await loadAll(); checkImport();
  };
  const { data } = await sb.auth.getSession();
  await start(data.session);
  sb.auth.onAuthStateChange((evt, session) => {
    if (evt === "SIGNED_IN" && (!user || user.id !== session.user.id)) start(session);
    if (evt === "SIGNED_OUT") { user = null; showApp(false); }
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && user) loadAll(); });
}
boot();
