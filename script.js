// ============================================================
// CONEXIÓN A SUPABASE
// ------------------------------------------------------------
// 1. Ve a tu proyecto en https://app.supabase.com
// 2. Entra a Project Settings > API
// 3. Copia "Project URL" y pégala en SUPABASE_URL
// 4. Copia la clave "anon public" y pégala en SUPABASE_ANON_KEY
//    (NUNCA pegues la "service_role key" aquí, esa es secreta)
// ============================================================

const SUPABASE_URL = "https://wswundgmdgzxweqgcbtz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indzd3VuZGdtZGd6eHdlcWdjYnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2OTUwNzgsImV4cCI6MjA5MjI3MTA3OH0.siEcKxMIU6VJOprqozbbY_6ptyH59NUUJwesYvMJVD4";

const BUCKET_NAME = "portafolio";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// ============================================================
// ARQQUITECTURA DE SOFTWARE — app.js
// ============================================================

const UNIDADES = [1, 2, 3, 4];
const SEMANAS = [1, 2, 3, 4];

let currentAdmin = false;
let currentTab = "sobre-mi"; // "sobre-mi" | "u{n}-s{n}"

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $all(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

function showToast(msg, type = "") {
  const toast = $("#toast");
  toast.textContent = msg;
  toast.className = "toast " + type;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add("hidden"), 3200);
}

function extIcon(ext) {
  ext = (ext || "").toLowerCase();
  if (ext === "pdf") return "PDF";
  if (["doc", "docx"].includes(ext)) return "DOC";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "IMG";
  if (["xls", "xlsx"].includes(ext)) return "XLS";
  if (["ppt", "pptx"].includes(ext)) return "PPT";
  return "FILE";
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

// ------------------------------------------------------------
// Construcción del sidebar (unidades / semanas)
// ------------------------------------------------------------
function buildSidebar() {
  UNIDADES.forEach(u => {
    const unitEl = $(`.nav-unit[data-unit="${u}"]`);
    const weeksWrap = $(".nav-weeks", unitEl);

    SEMANAS.forEach(s => {
      const btn = document.createElement("button");
      btn.className = "nav-week-btn";
      btn.dataset.unidad = u;
      btn.dataset.semana = s;
      btn.innerHTML = `Semana ${s} <span class="count mono" id="count-${u}-${s}"></span>`;
      btn.addEventListener("click", () => selectWeek(u, s));
      weeksWrap.appendChild(btn);
    });

    $(".nav-unit-head", unitEl).addEventListener("click", () => {
      unitEl.classList.toggle("open");
    });
  });

  $('.nav-item[data-tab="sobre-mi"]').addEventListener("click", selectAboutMe);
}

// ------------------------------------------------------------
// Construcción de los paneles de semana (uno por unidad/semana)
// ------------------------------------------------------------
function buildWeekPanels() {
  const wrap = $("#week-panels");
  UNIDADES.forEach(u => {
    SEMANAS.forEach(s => {
      const panel = document.createElement("section");
      panel.className = "panel hidden";
      panel.id = `panel-u${u}-s${s}`;
      panel.innerHTML = `
        <div class="week-header">
          <div class="week-eyebrow mono">UNIDAD ${u} · SEMANA ${s}</div>
          <h2 class="week-title">Recursos de la semana ${s}</h2>
        </div>

        <div class="dropzone hidden" id="dz-${u}-${s}">
          <strong>Arrastra archivos aquí</strong> o haz clic para seleccionar<br/>
          <small>PDF, Word, imágenes y otros documentos</small>
          <input type="file" id="file-${u}-${s}" multiple />
        </div>

        <form class="link-form hidden" id="linkform-${u}-${s}">
          <input type="text" placeholder="Título del enlace" id="linktitle-${u}-${s}" required />
          <input type="url" placeholder="https://..." id="linkurl-${u}-${s}" required />
          <button type="submit" class="btn btn-solid">Agregar enlace</button>
        </form>

        <div class="resource-grid" id="grid-${u}-${s}"></div>
        <p class="mono empty-hint hidden" id="emptyhint-${u}-${s}" style="color:var(--text-faint); font-size:12.5px;">// aún no hay recursos en esta semana</p>
      `;
      wrap.appendChild(panel);

      setupDropzone(u, s);
      setupLinkForm(u, s);
    });
  });
}

// ------------------------------------------------------------
// Navegación entre pestañas
// ------------------------------------------------------------
function hideAllPanels() {
  $all(".panel").forEach(p => p.classList.add("hidden"));
  $all(".nav-item, .nav-week-btn").forEach(b => b.classList.remove("active"));
}

function selectAboutMe() {
  hideAllPanels();
  $("#panel-sobre-mi").classList.remove("hidden");
  $('.nav-item[data-tab="sobre-mi"]').classList.add("active");
  currentTab = "sobre-mi";
}

function selectWeek(u, s) {
  hideAllPanels();
  $(`#panel-u${u}-s${s}`).classList.remove("hidden");
  $(`.nav-week-btn[data-unidad="${u}"][data-semana="${s}"]`).classList.add("active");
  const unitEl = $(`.nav-unit[data-unit="${u}"]`);
  unitEl.classList.add("open");
  currentTab = `u${u}-s${s}`;
  loadResources(u, s);
}

// ------------------------------------------------------------
// Carga y renderizado de recursos desde Supabase
// ------------------------------------------------------------
async function loadResources(u, s) {
  const grid = $(`#grid-${u}-${s}`);
  const emptyHint = $(`#emptyhint-${u}-${s}`);
  grid.innerHTML = `<p class="mono" style="color:var(--text-faint); font-size:12.5px;">// cargando...</p>`;

  const { data, error } = await supabaseClient
    .from("recursos")
    .select("*")
    .eq("unidad", u)
    .eq("semana", s)
    .order("creado_en", { ascending: false });

  if (error) {
    grid.innerHTML = "";
    showToast("Error al cargar recursos: " + error.message, "error");
    return;
  }

  const countBadge = $(`#count-${u}-${s}`);
  if (countBadge) countBadge.textContent = data.length ? String(data.length) : "";

  grid.innerHTML = "";
  emptyHint.classList.toggle("hidden", data.length > 0);

  data.forEach(item => grid.appendChild(renderResourceCard(item)));
}

function renderResourceCard(item) {
  const card = document.createElement("div");
  card.className = "resource-card";

  const isLink = item.tipo === "link";
  const icon = isLink ? "LINK" : extIcon(item.extension);
  const meta = isLink
    ? formatDate(item.creado_en)
    : `${formatBytes(item.tamano_bytes)} · ${formatDate(item.creado_en)}`;

  card.innerHTML = `
    <div class="resource-icon mono">${icon}</div>
    <div class="resource-name">${escapeHtml(item.nombre)}</div>
    <div class="resource-meta">${meta}</div>
    <div class="resource-actions"></div>
  `;

  const actions = $(".resource-actions", card);

  if (isLink) {
    const openBtn = document.createElement("a");
    openBtn.href = item.url;
    openBtn.target = "_blank";
    openBtn.rel = "noopener noreferrer";
    openBtn.innerHTML = `<button class="btn btn-outline">Abrir</button>`;
    actions.appendChild(openBtn);
  } else {
    // Botón "Ver": muestra el archivo en pantalla sin descargarlo
    const viewBtn = document.createElement("button");
    viewBtn.className = "btn btn-solid";
    viewBtn.textContent = "Ver";
    viewBtn.addEventListener("click", () => openPreview(item));
    actions.appendChild(viewBtn);

    // Botón "Descargar": opcional, para quien sí quiera el archivo
    const dlBtn = document.createElement("a");
    dlBtn.href = item.url;
    dlBtn.setAttribute("download", item.nombre);
    dlBtn.innerHTML = `<button class="btn btn-outline">Descargar</button>`;
    actions.appendChild(dlBtn);
  }

  if (currentAdmin) {
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-danger";
    delBtn.textContent = "Eliminar";
    delBtn.addEventListener("click", () => deleteResource(item));
    actions.appendChild(delBtn);
  }

  return card;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ------------------------------------------------------------
// Vista previa de archivos (sin necesidad de descargar)
// ------------------------------------------------------------
function openPreview(item) {
  const ext = (item.extension || "").toLowerCase();
  const body = $("#preview-body");
  const tag = $("#preview-tag");
  const title = $("#preview-title");
  const download = $("#preview-download");

  title.textContent = item.nombre;
  download.href = item.url;
  download.setAttribute("download", item.nombre);
  body.innerHTML = "";

  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
    tag.textContent = "IMAGEN";
    const img = document.createElement("img");
    img.src = item.url;
    img.alt = item.nombre;
    body.appendChild(img);

  } else if (ext === "pdf") {
    tag.textContent = "PDF";
    const iframe = document.createElement("iframe");
    iframe.src = item.url;
    body.appendChild(iframe);

  } else if (["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(ext)) {
    tag.textContent = "DOCUMENTO";
    const iframe = document.createElement("iframe");
    // Visor de Google Docs: permite ver Word/Excel/PowerPoint sin descargar
    iframe.src = "https://docs.google.com/gview?url=" + encodeURIComponent(item.url) + "&embedded=true";
    body.appendChild(iframe);

  } else {
    tag.textContent = "ARCHIVO";
    body.innerHTML = `<p class="preview-fallback">Este tipo de archivo no tiene vista previa disponible.<br/>Usa el botón "Descargar" para abrirlo.</p>`;
  }

  $("#preview-modal").classList.remove("hidden");
}

function closePreview() {
  $("#preview-modal").classList.add("hidden");
  $("#preview-body").innerHTML = "";
}

// ------------------------------------------------------------
// Subida de archivos (drag & drop + selector)
// ------------------------------------------------------------
function setupDropzone(u, s) {
  const dz = $(`#dz-${u}-${s}`);
  const input = $(`#file-${u}-${s}`);

  dz.addEventListener("click", () => input.click());
  input.addEventListener("change", () => handleFiles(u, s, input.files));

  ["dragover", "dragenter"].forEach(evt =>
    dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.add("drag"); })
  );
  ["dragleave", "drop"].forEach(evt =>
    dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.remove("drag"); })
  );
  dz.addEventListener("drop", e => handleFiles(u, s, e.dataTransfer.files));
}

async function handleFiles(u, s, fileList) {
  const files = [...fileList];
  if (!files.length) return;

  for (const file of files) {
    await uploadOneFile(u, s, file);
  }
  loadResources(u, s);
}

async function uploadOneFile(u, s, file) {
  const ext = file.name.split(".").pop();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `u${u}/s${s}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabaseClient
    .storage
    .from(BUCKET_NAME)
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (uploadError) {
    showToast("Error al subir " + file.name + ": " + uploadError.message, "error");
    return;
  }

  const { data: pub } = supabaseClient.storage.from(BUCKET_NAME).getPublicUrl(path);

  const { error: insertError } = await supabaseClient.from("recursos").insert({
    unidad: u,
    semana: s,
    tipo: "archivo",
    nombre: file.name,
    url: pub.publicUrl,
    storage_path: path,
    extension: ext,
    tamano_bytes: file.size
  });

  if (insertError) {
    showToast("Error al registrar " + file.name + ": " + insertError.message, "error");
    return;
  }

  showToast(file.name + " subido correctamente", "success");
}

// ------------------------------------------------------------
// Agregar enlaces
// ------------------------------------------------------------
function setupLinkForm(u, s) {
  const form = $(`#linkform-${u}-${s}`);
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const title = $(`#linktitle-${u}-${s}`).value.trim();
    const url = $(`#linkurl-${u}-${s}`).value.trim();
    if (!title || !url) return;

    const { error } = await supabaseClient.from("recursos").insert({
      unidad: u, semana: s, tipo: "link", nombre: title, url
    });

    if (error) {
      showToast("Error al agregar enlace: " + error.message, "error");
      return;
    }

    form.reset();
    showToast("Enlace agregado", "success");
    loadResources(u, s);
  });
}

// ------------------------------------------------------------
// Eliminar recurso (archivo o enlace)
// ------------------------------------------------------------
async function deleteResource(item) {
  if (!confirm(`¿Eliminar "${item.nombre}"? Esta acción no se puede deshacer.`)) return;

  if (item.tipo === "archivo" && item.storage_path) {
    const { error: storageError } = await supabaseClient
      .storage.from(BUCKET_NAME).remove([item.storage_path]);
    if (storageError) {
      showToast("Error al eliminar archivo: " + storageError.message, "error");
      return;
    }
  }

  const { error } = await supabaseClient.from("recursos").delete().eq("id", item.id);
  if (error) {
    showToast("Error al eliminar registro: " + error.message, "error");
    return;
  }

  showToast("Eliminado correctamente", "success");
  loadResources(item.unidad, item.semana);
}

// ------------------------------------------------------------
// Autenticación de administrador
// ------------------------------------------------------------
function openLoginModal() { $("#login-modal").classList.remove("hidden"); }
function closeLoginModal() {
  $("#login-modal").classList.add("hidden");
  $("#login-error").classList.add("hidden");
  $("#login-form").reset();
}

async function handleLogin(e) {
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  const errEl = $("#login-error");

  if (error) {
    errEl.textContent = "Credenciales incorrectas o usuario no autorizado.";
    errEl.classList.remove("hidden");
    return;
  }

  closeLoginModal();
  showToast("Sesión de administrador iniciada", "success");
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  showToast("Sesión cerrada");
}

function applyAdminUI(isAdmin) {
  currentAdmin = isAdmin;

  $("#btn-login").classList.toggle("hidden", isAdmin);
  $("#btn-logout").classList.toggle("hidden", !isAdmin);
  $("#session-badge").classList.toggle("hidden", !isAdmin);

  $all(".dropzone").forEach(el => el.classList.toggle("hidden", !isAdmin));
  $all(".link-form").forEach(el => el.classList.toggle("hidden", !isAdmin));

  // Re-renderiza el panel activo para mostrar/ocultar botones "Eliminar"
  if (currentTab.startsWith("u")) {
    const [, u, s] = currentTab.match(/u(\d)-s(\d)/);
    loadResources(u, s);
  }
}

// ------------------------------------------------------------
// Inicialización
// ------------------------------------------------------------
async function initAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  applyAdminUI(!!session);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    applyAdminUI(!!session);
  });
}

function initUI() {
  $("#btn-login").addEventListener("click", openLoginModal);
  $("#login-close").addEventListener("click", closeLoginModal);
  $("#login-modal").addEventListener("click", e => { if (e.target.id === "login-modal") closeLoginModal(); });
  $("#login-form").addEventListener("submit", handleLogin);
  $("#btn-logout").addEventListener("click", handleLogout);

  $("#preview-close").addEventListener("click", closePreview);
  $("#preview-modal").addEventListener("click", e => { if (e.target.id === "preview-modal") closePreview(); });
}

document.addEventListener("DOMContentLoaded", () => {
  buildSidebar();
  buildWeekPanels();
  initUI();
  initAuth();
  selectAboutMe();
  $("#panel-empty").classList.add("hidden");
});
