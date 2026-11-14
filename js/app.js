import { crearBackend } from "./backend.js";
import { NOMBRE_APP, ZONA_UTC } from "./config.js";

const TIPOS = {
  nunca:     { label: "Yo nunca nunca",          corto: "Nunca he",            emoji: "😝" },
  prefieres: { label: "¿Prefieres?",             corto: "¿Qué prefieres?",     emoji: "🤷" },
  quien:     { label: "¿Quién es más probable?", corto: "¿Quién es más probable?", emoji: "💪" },
  profunda:  { label: "Conversación profunda",   corto: "Charlas profundas",   emoji: "💬" },
};
const CON_PUNTAJE = new Set(["quien", "prefieres"]);
const NUNCA_OPS = [{ v: "si", t: "Lo he hecho" }, { v: "no", t: "¡Nunca lo he hecho!" }];

const app = document.getElementById("app");
const be = crearBackend();
const S = {
  data: null, info: null, estado: new Map(), // paquete_id -> Set(jugadores)
  paquetes: new Map(), temaDe: new Map(),
  filtroHome: "todos", filtroLista: "todos",
  juego: null, tabResultado: "respuestas",
};

// ---------- utilidades ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const yo = () => S.info.jugador;
const otro = () => (S.info.jugador === 1 ? 2 : 1);
const nombre = (j) => S.info.miembros.find((m) => m.jugador === j)?.nombre || "Esperando…";
const parejaCompleta = () => S.info.miembros.length === 2;
const ls = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
             set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const verAdultos = () => ls.get("nosotros-adultos", false);

function avatar(j, opts = {}) {
  const n = nombre(j);
  const check = opts.check ? `<span class="check">✓</span>` : "";
  return `<span class="av av${j} ${opts.sm ? "sm" : ""}" title="${esc(n)}">${esc(n.trim()[0]?.toUpperCase() || "?")}${check}</span>`;
}
function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}

// ---------- pregunta diaria ----------
function hoyLocal() { return new Date(Date.now() + ZONA_UTC * 3600e3); } // fecha "en la zona" leída con getUTC*
function diaria() {
  const d = hoyLocal();
  const clave = d.toISOString().slice(0, 10).replaceAll("-", "");
  const n = Math.floor(d.getTime() / 86400e3);
  const pool = S.data.diarias;
  return { id: "diaria-" + clave, titulo: "Conversación diaria", emoji: "☕", tipo: "profunda",
           preguntas: [{ q: pool[n % pool.length] }], diaria: true };
}
function faltaParaMedianoche() {
  const d = hoyLocal(); const ms = 86400e3 - (d.getTime() % 86400e3);
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3), s = Math.floor((ms % 60e3) / 1e3);
  return [h, m, s].map((x) => String(x).padStart(2, "0")).join(":");
}

// ---------- estado ----------
async function refrescarEstado() {
  const filas = await be.estado();
  S.estado = new Map();
  for (const f of filas) {
    if (!S.estado.has(f.paquete_id)) S.estado.set(f.paquete_id, new Set());
    S.estado.get(f.paquete_id).add(f.jugador);
  }
}
const respondio = (pid, j) => S.estado.get(pid)?.has(j) || false;
function situacion(pid) {
  const a = respondio(pid, yo()), b = respondio(pid, otro());
  if (a && b) return "listo";
  if (a) return "esperando";
  if (b) return "tuturno";
  return "nuevo";
}
function temasVisibles() { return S.data.temas.filter((t) => !t.adultos || verAdultos()); }
function paquetesVisibles() { return temasVisibles().flatMap((t) => t.paquetes); }
function progresoTema(t) {
  const hechos = t.paquetes.filter((p) => situacion(p.id) === "listo").length;
  return Math.round((hechos / t.paquetes.length) * 100);
}

// ---------- router ----------
const rutas = [
  [/^#\/tema\/(.+)$/, (id) => vistaLista({ tema: id })],
  [/^#\/tipo\/(.+)$/, (tipo) => vistaLista({ tipo })],
  [/^#\/jugar\/(.+)$/, (id) => vistaJugar(id)],
  [/^#\/resultado\/(.+)$/, (id) => vistaResultado(id)],
  [/^#\/ajustes$/, () => vistaAjustes()],
  [/^#\/cartas$/, () => vistaCartas()],
  [/^#\/carta\/(.+)$/, (id) => vistaCarta(id)],
];
async function render() {
  if (!S.info) return vistaBienvenida();
  const h = location.hash || "#/";
  for (const [re, fn] of rutas) {
    const m = h.match(re);
    if (m) return fn(decodeURIComponent(m[1] || ""));
  }
  return vistaHome();
}
window.addEventListener("hashchange", () => { window.scrollTo(0, 0); render(); });
const ir = (h) => { if (location.hash === h) render(); else location.hash = h; };

// ---------- vistas ----------
function vistaBienvenida(modo = "inicio") {
  const demo = be.demo;
  const bannerDemo = demo ? `<div class="aviso">Modo demo: Supabase aún no está conectado. Todo se guarda solo en este navegador y puedes jugar como los dos.</div>` : "";
  let cuerpo = "";
  if (modo === "inicio") {
    cuerpo = `
      <button class="btn" data-modo="crear">Crear nuestra pareja</button>
      ${demo ? "" : `<button class="btn sec" data-modo="unirse">Tengo un código</button>
      <button class="link" data-modo="recuperar">Ya tenía cuenta en otro celular</button>`}`;
  } else {
    const campos = {
      crear: demo
        ? `<input name="nombre" placeholder="Tu nombre" maxlength="30" required>
           <input name="nombre2" placeholder="Nombre de tu pareja" maxlength="30" required>`
        : `<input name="nombre" placeholder="Tu nombre" maxlength="30" required>
           <input name="pin" placeholder="Crea un PIN de 4 números" inputmode="numeric" pattern="\\d{4}" maxlength="4" required>
           <p class="nota">El PIN sirve para recuperar tu lugar si cambias de celular.</p>`,
      unirse: `<input name="codigo" placeholder="Código de tu pareja" maxlength="8" required autocapitalize="characters">
               <input name="nombre" placeholder="Tu nombre" maxlength="30" required>
               <input name="pin" placeholder="Crea un PIN de 4 números" inputmode="numeric" pattern="\\d{4}" maxlength="4" required>`,
      recuperar: `<input name="codigo" placeholder="Código de la pareja" maxlength="8" required autocapitalize="characters">
                  <input name="nombre" placeholder="Tu nombre (como lo escribiste)" maxlength="30" required>
                  <input name="pin" placeholder="Tu PIN" inputmode="numeric" pattern="\\d{4}" maxlength="4" required>`,
    }[modo];
    const titulos = { crear: "Crear pareja", unirse: "Unirme con código", recuperar: "Recuperar mi lugar" };
    cuerpo = `<form class="form" data-accion="${modo}">
      <h2>${titulos[modo]}</h2>${campos}
      <button class="btn" type="submit">Continuar</button>
      <button class="link" type="button" data-modo="inicio">Volver</button></form>`;
  }
  app.innerHTML = `<section class="bienvenida">
    <div class="logo">💞</div><h1>${esc(NOMBRE_APP)}</h1>
    <p class="sub">Respondan por separado, descubran qué tanto coinciden y hablen de lo que salga.</p>
    ${bannerDemo}${cuerpo}</section>`;
  app.querySelectorAll("[data-modo]").forEach((b) => b.onclick = () => vistaBienvenida(b.dataset.modo));
  const f = app.querySelector("form");
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    const btn = f.querySelector("[type=submit]"); btn.disabled = true;
    try {
      if (f.dataset.accion === "crear") S.info = await be.crearPareja(v.nombre.trim(), v.pin, v.nombre2?.trim());
      if (f.dataset.accion === "unirse") S.info = await be.unirse(v.codigo.trim().toUpperCase(), v.nombre.trim(), v.pin);
      if (f.dataset.accion === "recuperar") S.info = await be.recuperar(v.codigo.trim().toUpperCase(), v.nombre.trim(), v.pin);
      await refrescarEstado(); ir("#/");
    } catch (x) { toast(x.message); btn.disabled = false; }
  };
}

function cabecera() {
  return `<header class="top">
    <div class="pareja">${avatar(1)}${avatar(2)}</div>
    <div class="top-der">
      ${be.demo ? `<button class="chip demo" id="cambiar">Jugando como ${esc(nombre(yo()))} ⇄</button>` : ""}
      <a class="icono" href="#/ajustes" aria-label="Ajustes">⚙️</a>
    </div></header>`;
}
function conectarCabecera() {
  const b = document.getElementById("cambiar");
  if (b) b.onclick = async () => { S.info = be.cambiarJugador(); render(); };
}

function tarjetaPaquete(p) {
  const sit = situacion(p.id);
  const accion = { listo: "Resultados", esperando: "Esperando", tuturno: "Tu turno", nuevo: "Responder" }[sit];
  const adultos = S.temaDe.get(p.id)?.adultos ? `<span class="b18">18+</span>` : "";
  return `<a class="paq t-${p.tipo}" href="#/${sit === "listo" || sit === "esperando" ? "resultado" : "jugar"}/${p.id}">
    <div class="paq-info">
      <div class="paq-tipo">${adultos}${esc(TIPOS[p.tipo].label)}</div>
      <div class="paq-titulo">${esc(p.titulo)}</div>
      <div class="paq-pie">
        <span class="pareja">${avatar(1, { sm: true, check: respondio(p.id, 1) })}${avatar(2, { sm: true, check: respondio(p.id, 2) })}</span>
        <span class="accion a-${sit}">${accion} ›</span>
      </div>
    </div>
    <div class="paq-emoji">${p.emoji}</div></a>`;
}

function vistaHome() {
  const d = diaria(); S.paquetes.set(d.id, d);
  const sitD = situacion(d.id);
  const filtros = [["todos", "⭐ Todos"], ["tuturno", "⏳ Tu turno"], ["listo", "✅ Contestado"]];
  let contenido;
  if (S.filtroHome === "todos") {
    contenido = `
      <h3>Categorías</h3>
      <div class="cats">${Object.entries(TIPOS).map(([k, t]) => `
        <a class="cat t-${k}" href="#/tipo/${k}"><span>${t.emoji}</span>${esc(t.corto)}</a>`).join("")}</div>
      <h3>Temas</h3>
      <div class="temas">${temasVisibles().map((t) => {
        const pr = progresoTema(t);
        return `<a class="tema" href="#/tema/${t.id}">
          <span class="tema-emoji">${t.emoji}</span>
          <span class="tema-info"><b>${esc(t.nombre)}</b><small><i style="--p:${pr}%"></i>${pr}% completado</small></span>
          <span class="flecha">${pr === 100 ? "✔" : "›"}</span></a>`;
      }).join("")}</div>`;
  } else {
    const lista = paquetesVisibles().filter((p) => situacion(p.id) === S.filtroHome);
    contenido = lista.length ? `<div class="lista">${lista.map(tarjetaPaquete).join("")}</div>`
      : `<p class="vacio">${S.filtroHome === "tuturno" ? "No tienes nada pendiente. 🎉" : "Todavía no han terminado ningún paquete juntos."}</p>`;
  }
  const invitar = !parejaCompleta() ? `<div class="invitar">
      <b>Invita a tu pareja</b><p>Pásale este código para que se una:</p>
      <div class="codigo">${esc(S.info.codigo)}</div>
      <button class="btn sec" id="compartir">Compartir código</button></div>` : "";
  app.innerHTML = `${cabecera()}
    <nav class="chips">${filtros.map(([k, t]) => `<button class="chip ${S.filtroHome === k ? "on" : ""}" data-f="${k}">${t}</button>`).join("")}</nav>
    ${invitar}
    ${tarjetaCartas()}
    <h3>Conversación diaria gratuita</h3>
    <a class="paq t-profunda diaria" href="#/${sitD === "listo" || sitD === "esperando" ? "resultado" : "jugar"}/${d.id}">
      <div class="paq-info">
        <div class="paq-tipo">⏱ Próxima en <span id="reloj">${faltaParaMedianoche()}</span></div>
        <div class="paq-titulo">${esc(d.preguntas[0].q)}</div>
        <div class="paq-pie"><span class="pareja">${avatar(1, { sm: true, check: respondio(d.id, 1) })}${avatar(2, { sm: true, check: respondio(d.id, 2) })}</span>
        <span class="accion a-${sitD}">${{ listo: "Resultados", esperando: "Esperando", tuturno: "Tu turno", nuevo: "Responder" }[sitD]} ›</span></div>
      </div><div class="paq-emoji">☕</div></a>
    ${contenido}`;
  conectarCabecera();
  app.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { S.filtroHome = b.dataset.f; vistaHome(); });
  const c = document.getElementById("compartir");
  if (c) c.onclick = async () => {
    const texto = `Únete a mí en ${NOMBRE_APP} 💞 Código: ${S.info.codigo}\n${location.origin + location.pathname}`;
    try { if (navigator.share) await navigator.share({ text: texto }); else { await navigator.clipboard.writeText(texto); toast("Copiado"); } } catch {}
  };
}

function vistaLista({ tema, tipo }) {
  let titulo, paquetes;
  if (tema) {
    const t = S.data.temas.find((x) => x.id === tema);
    if (!t) return ir("#/");
    titulo = `${t.emoji} ${t.nombre}`; paquetes = t.paquetes;
  } else {
    titulo = `${TIPOS[tipo]?.emoji} ${TIPOS[tipo]?.label}`; paquetes = paquetesVisibles().filter((p) => p.tipo === tipo);
  }
  const filtros = [["todos", "Todos"], ["sin", "Sin responder"], ["resp", "Respondidos"]];
  const f = S.filtroLista;
  const lista = paquetes.filter((p) => f === "todos" || (f === "sin" ? !respondio(p.id, yo()) : respondio(p.id, yo())));
  app.innerHTML = `<header class="top"><a class="icono" href="#/">‹</a><b class="titulo-top">${esc(titulo)}</b><span></span></header>
    <nav class="chips">${filtros.map(([k, t]) => `<button class="chip ${f === k ? "on" : ""}" data-f="${k}">${t}</button>`).join("")}</nav>
    <div class="lista">${lista.map(tarjetaPaquete).join("") || `<p class="vacio">Nada por aquí.</p>`}</div>`;
  app.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { S.filtroLista = b.dataset.f; vistaLista({ tema, tipo }); });
}

// ---------- jugar ----------
function textoPregunta(p, q) { return p.tipo === "profunda" ? q.q : p.tipo === "prefieres" ? "¿Qué prefieres?" : q; }
function vistaJugar(id) {
  const p = S.paquetes.get(id) || (id.startsWith("diaria-") ? diaria() : null);
  if (!p) return ir("#/");
  if (respondio(id, yo())) return ir("#/resultado/" + id);
  if (!S.juego || S.juego.id !== id) S.juego = { id, i: 0, r: [] };
  const J = S.juego, q = p.preguntas[J.i], total = p.preguntas.length;
  let opciones;
  if (p.tipo === "nunca") opciones = NUNCA_OPS.map((o) => `<button class="op" data-v="${o.v}">${o.t}</button>`).join("");
  else if (p.tipo === "quien") opciones = [[1, nombre(1)], [2, nombre(2)], ["ambos", "Ambos"], ["ninguno", "Ninguno"]]
    .map(([v, t]) => `<button class="op ${typeof v === "number" ? "con-av" : ""}" data-v="${v}">${typeof v === "number" ? avatar(v, { sm: true }) : ""}${esc(t)}</button>`).join("");
  else if (p.tipo === "prefieres") opciones = `<div class="dos">${["a", "b"].map((k) => `<button class="op grande" data-v="${k}">${esc(q[k])}</button>`).join(`<span class="o">o</span>`)}</div>`;
  else if (q.op) opciones = q.op.map((o, k) => `<button class="op" data-v="${k}">${esc(o)}</button>`).join("");
  else opciones = `<textarea id="libre" maxlength="400" placeholder="Escribe tu respuesta…">${esc(J.r[J.i] ?? "")}</textarea>
                   <button class="btn" id="sig">${J.i === total - 1 ? "Enviar" : "Siguiente"}</button>`;
  const elegido = J.r[J.i];
  app.innerHTML = `<header class="top"><button class="icono" id="atras">‹</button>
      <b class="titulo-top">${esc(p.titulo)}</b><a class="icono" href="#/">✕</a></header>
    <div class="barra"><i style="width:${(J.i / total) * 100}%"></i></div>
    <section class="jugar t-${p.tipo}">
      <div class="contador">${J.i + 1} / ${total} · ${esc(TIPOS[p.tipo].label)}</div>
      <h2 class="pregunta">${esc(textoPregunta(p, q))}</h2>
      <div class="ops">${opciones}</div>
    </section>`;
  if (elegido !== undefined) app.querySelectorAll(".op").forEach((b) => { if (b.dataset.v === String(elegido)) b.classList.add("sel"); });
  document.getElementById("atras").onclick = () => { if (J.i > 0) { J.i--; vistaJugar(id); } else history.back(); };
  const avanzar = async (valor) => {
    J.r[J.i] = valor;
    if (J.i < total - 1) { J.i++; return vistaJugar(id); }
    app.querySelectorAll("button").forEach((b) => b.disabled = true);
    try {
      await be.responder(id, yo(), S.info, J.r);
      S.juego = null; await refrescarEstado(); ir("#/resultado/" + id);
    } catch (x) { toast(x.message); app.querySelectorAll("button").forEach((b) => b.disabled = false); }
  };
  app.querySelectorAll(".op").forEach((b) => b.onclick = () => {
    b.classList.add("sel");
    const v = b.dataset.v;
    setTimeout(() => avanzar(/^\d+$/.test(v) && p.tipo === "quien" ? Number(v) : (p.tipo === "profunda" ? Number(v) : v)), 180);
  });
  const sig = document.getElementById("sig");
  if (sig) sig.onclick = () => {
    const t = document.getElementById("libre").value.trim();
    if (!t) return toast("Escribe algo primero 🙂");
    avanzar(t);
  };
}

// ---------- resultados ----------
function etiqueta(p, q, v) {
  if (v === undefined || v === null) return "—";
  if (p.tipo === "nunca") return NUNCA_OPS.find((o) => o.v === v)?.t ?? v;
  if (p.tipo === "quien") return v === "ambos" ? "Ambos" : v === "ninguno" ? "Ninguno" : nombre(Number(v));
  if (p.tipo === "prefieres") return q[v];
  if (q.op && typeof v === "number") return q.op[v];
  return v;
}
function similitud(p, a, b) {
  const n = p.preguntas.length; let ok = 0;
  for (let i = 0; i < n; i++) if (String(a[i]) === String(b[i])) ok++;
  return Math.round((ok / n) * 100);
}
function medidor(pct) {
  const L = 251.3; // longitud del semicírculo r=80
  return `<div class="medidor"><svg viewBox="0 0 200 110"><path d="M20 100 A80 80 0 0 1 180 100" class="m-fondo"/>
    <path d="M20 100 A80 80 0 0 1 180 100" class="m-valor" style="stroke-dasharray:${L};stroke-dashoffset:${L * (1 - pct / 100)}"/></svg>
    <div class="m-num">${pct}<small>%</small></div><div class="m-txt">similitud de respuestas</div></div>`;
}
const PISTAS = {
  quien: ["¿Por qué elegiste eso?", "Den un ejemplo de cuándo pasó.", "¿Quién tiene la razón aquí? 😅"],
  prefieres: ["¿Por qué lo elegiste?", "¿Podríamos hacer los dos algún día?", "¿Qué te haría cambiar de opinión?"],
  nunca: ["Cuéntale cómo fue.", "¿Lo volverías a hacer?", "¿Lo harían juntos?"],
  profunda: ["¿Qué te sorprendió de la respuesta del otro?", "¿Por qué respondiste eso?", "¿Hay algo que quieras agregar?"],
};
async function vistaResultado(id) {
  const p = S.paquetes.get(id) || (id.startsWith("diaria-") ? diaria() : null);
  if (!p) return ir("#/");
  if (!respondio(id, yo())) return ir("#/jugar/" + id);
  const r = await be.resultados(id);
  const mio = r[yo()], suyo = r[otro()];
  const head = `<header class="top"><a class="icono" href="#/">‹</a><b class="titulo-top">${esc(p.titulo)}</b><span></span></header>`;
  if (!suyo) {
    app.innerHTML = `${head}<section class="esperando">
      <div class="reloj-arena">⏳</div><h2>Esperando a ${esc(nombre(otro()))}</h2>
      <p>Cuando ${parejaCompleta() ? "termine" : "se una y termine"}, aquí verán cuánto coinciden. Esta pantalla se actualiza sola.</p>
      <button class="btn sec" id="recargar">Revisar ahora</button>
      <h3>Tus respuestas</h3>
      <div class="mis">${p.preguntas.map((q, i) => `<div class="fila"><span>${esc(textoPregunta(p, q) === "¿Qué prefieres?" ? `${q.a} / ${q.b}` : textoPregunta(p, q))}</span><b>${esc(etiqueta(p, q, mio?.[i]))}</b></div>`).join("")}</div>
    </section>`;
    document.getElementById("recargar").onclick = async () => { await refrescarEstado(); vistaResultado(id); };
    return;
  }
  const tab = S.tabResultado;
  let cuerpo = "";
  if (tab === "respuestas") {
    if (CON_PUNTAJE.has(p.tipo)) cuerpo += medidor(similitud(p, mio, suyo));
    cuerpo += p.preguntas.map((q, i) => {
      const t = esc(textoPregunta(p, q)), n = i + 1;
      if (p.tipo === "prefieres" || p.tipo === "nunca") {
        const ops = p.tipo === "prefieres" ? [["a", q.a], ["b", q.b]] : NUNCA_OPS.map((o) => [o.v, o.t]);
        return `<div class="res"><div class="cols">${ops.map(([v, txt]) => `
          <div class="col"><span>${esc(txt)}</span><div class="pareja">${[yo(), otro()].filter((j) => String(r[j][i]) === v).map((j) => avatar(j, { sm: true })).join("")}</div></div>`).join("")}</div>
          ${p.tipo === "nunca" ? `<div class="res-q">${n}. ${t}</div>` : ""}</div>`;
      }
      const igual = String(mio[i]) === String(suyo[i]);
      return `<div class="res ${CON_PUNTAJE.has(p.tipo) ? (igual ? "igual" : "dif") : ""}"><div class="res-q">${n}. ${t}</div>
        <div class="burbuja izq">${avatar(yo(), { sm: true })}<span>${esc(etiqueta(p, q, mio[i]))}</span></div>
        <div class="burbuja der"><span>${esc(etiqueta(p, q, suyo[i]))}</span>${avatar(otro(), { sm: true })}</div></div>`;
    }).join("");
  } else {
    const pistas = PISTAS[p.tipo];
    const temas = p.preguntas.map((q, i) => ({ q, i })).filter(({ i }) =>
      p.tipo === "profunda" ? true : p.tipo === "nunca" ? (mio[i] === "si" || suyo[i] === "si") : String(mio[i]) !== String(suyo[i]));
    cuerpo = temas.length ? `<p class="nota">${p.tipo === "nunca" ? "Cosas que alguno de los dos sí ha hecho:" : p.tipo === "profunda" ? "Hablen de cada respuesta:" : "Aquí no coincidieron. Hablen de esto:"}</p>` +
      temas.map(({ q, i }, k) => `<div class="res discute"><div class="res-q">${esc(textoPregunta(p, q) === "¿Qué prefieres?" ? `${q.a} o ${q.b}` : textoPregunta(p, q))}</div>
        <div class="mini">${esc(nombre(yo()))}: <b>${esc(etiqueta(p, q, mio[i]))}</b> · ${esc(nombre(otro()))}: <b>${esc(etiqueta(p, q, suyo[i]))}</b></div>
        <div class="pista">💬 ${pistas[k % pistas.length]}</div></div>`).join("")
      : `<p class="vacio">¡Coincidieron en todo! 🎉 Nada que discutir.</p>`;
  }
  app.innerHTML = `${head}<nav class="chips"><button class="chip ${tab === "respuestas" ? "on" : ""}" data-t="respuestas">Respuestas</button>
    <button class="chip ${tab === "discute" ? "on" : ""}" data-t="discute">Discute</button></nav>
    <section class="resultados t-${p.tipo}">${cuerpo}</section>`;
  app.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => { S.tabResultado = b.dataset.t; vistaResultado(id); });
}

// ---------- cartas protegidas con código ----------
// El contenido está cifrado (AES-GCM) con una clave derivada del código; sin el código no se puede leer.
const C = { meta: null, cartas: null };
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function descifrar(codigo) {
  const m = C.meta, enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(codigo), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(m.salt), iterations: m.iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(m.iv) }, key, b64(m.data));
  return JSON.parse(new TextDecoder().decode(plano));
}
async function cargarMetaCartas() {
  if (C.meta !== null) return C.meta;
  try { const r = await fetch("data/cartas.json", { cache: "no-cache" }); C.meta = r.ok ? await r.json() : false; }
  catch { C.meta = false; }
  return C.meta;
}
async function intentarGuardado() {
  if (C.cartas) return true;
  let cod = null; try { cod = sessionStorage.getItem("nosotros-cartas"); } catch {}
  if (!cod) return false;
  try { C.cartas = await descifrar(cod); return true; } catch { return false; }
}
function tarjetaCartas() {
  if (!C.meta) return "";
  return `<a class="cartas-card" href="#/cartas">
    <span class="sobre">💌</span>
    <span><small>Solo para ti</small><b>Para ${esc(C.meta.para || "ti")}</b></span>
    <span class="candado">${C.cartas ? "›" : "🔒"}</span></a>`;
}
async function vistaCartas() {
  const meta = await cargarMetaCartas();
  if (!meta) return ir("#/");
  const head = `<header class="top"><a class="icono" href="#/">‹</a><b class="titulo-top">Para ${esc(meta.para)}</b><span></span></header>`;
  if (!(await intentarGuardado())) {
    app.innerHTML = `${head}<section class="bloqueo">
      <div class="sobre grande">💌</div>
      <h2 class="mano">Hola, ${esc(meta.para)}</h2>
      <p class="sub">Esto es solo para ti. Escribe el código para abrirlo.</p>
      <form id="fcod"><input id="cod" class="codigo-input" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="••••••" required>
      <button class="btn" type="submit">Abrir</button></form></section>`;
    const f = document.getElementById("fcod"), inp = document.getElementById("cod");
    inp.focus();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector("button"); btn.disabled = true;
      try {
        C.cartas = await descifrar(inp.value.trim());
        try { sessionStorage.setItem("nosotros-cartas", inp.value.trim()); } catch {}
        vistaCartas();
      } catch {
        inp.value = ""; inp.classList.add("mal"); setTimeout(() => inp.classList.remove("mal"), 500);
        toast("Ese no es el código 🙈"); btn.disabled = false;
      }
    };
    return;
  }
  const cats = [...new Set(C.cartas.map((c) => c.categoria))];
  app.innerHTML = `${head}<section class="cartas">
    <h2 class="mano">Hola, ${esc(meta.para)} 💗</h2>
    ${cats.map((cat) => `<h3>${esc(cat)}</h3><div class="lista">${C.cartas.filter((c) => c.categoria === cat).map((c) => `
      <a class="carta-item" href="#/carta/${encodeURIComponent(c.id)}"><span class="paq-emoji">${c.emoji}</span>
      <span><b>${esc(c.titulo)}</b><small>Toca para leer</small></span><span class="flecha">›</span></a>`).join("")}</div>`).join("")}
    <p class="nota centro">Pronto habrá más por aquí…</p></section>`;
}
async function vistaCarta(id) {
  await cargarMetaCartas();
  if (!(await intentarGuardado())) return ir("#/cartas");
  const c = C.cartas.find((x) => x.id === id);
  if (!c) return ir("#/cartas");
  const parrafos = c.texto.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  app.innerHTML = `<header class="top"><a class="icono" href="#/cartas">‹</a><b class="titulo-top">${esc(c.categoria)}</b><span></span></header>
    <article class="carta"><div class="carta-emoji">${c.emoji}</div><h2 class="mano">${esc(c.titulo)}</h2>
    ${parrafos}<p class="firma mano">${esc(c.firma || "")}</p></article>`;
}

// ---------- ajustes ----------
function vistaAjustes() {
  app.innerHTML = `<header class="top"><a class="icono" href="#/">‹</a><b class="titulo-top">Ajustes</b><span></span></header>
    <section class="ajustes">
      <div class="fila"><span>Código de la pareja</span><b class="codigo sm">${esc(S.info.codigo)}</b></div>
      <div class="fila"><span>Tú</span><b>${esc(nombre(yo()))}</b></div>
      <div class="fila"><span>Tu pareja</span><b>${esc(nombre(otro()))}</b></div>
      <label class="fila"><span>Mostrar temas 18+</span><input type="checkbox" id="adultos" ${verAdultos() ? "checked" : ""}></label>
      ${be.demo ? `<div class="aviso">Estás en modo demo. Cuando conectes Supabase, cada uno juega desde su celular.</div>` : ""}
      <button class="btn sec peligro" id="salir">${be.demo ? "Borrar datos de prueba" : "Cerrar sesión en este celular"}</button>
      ${be.demo ? "" : `<p class="nota">Para volver a entrar necesitarás el código, tu nombre y tu PIN.</p>`}
    </section>`;
  document.getElementById("adultos").onchange = (e) => ls.set("nosotros-adultos", e.target.checked);
  document.getElementById("salir").onclick = async () => {
    await be.salir(); S.info = null; S.estado = new Map();
    if (!be.demo) await be.init().catch(() => {});
    location.hash = "#/"; render();
  };
}

// ---------- arranque ----------
async function arrancar() {
  app.innerHTML = `<div class="cargando">💞</div>`;
  try {
    const res = await fetch("data/preguntas.json", { cache: "no-cache" });
    S.data = await res.json();
    for (const t of S.data.temas) for (const p of t.paquetes) { S.paquetes.set(p.id, p); S.temaDe.set(p.id, t); }
    S.info = await be.init();
    if (S.info) await refrescarEstado();
    await cargarMetaCartas(); await intentarGuardado();
  } catch (x) {
    app.innerHTML = `<section class="bienvenida"><div class="logo">⚠️</div><h2>No se pudo cargar</h2><p class="sub">${esc(x.message)}</p>
      <button class="btn" onclick="location.reload()">Reintentar</button></section>`;
    return;
  }
  render();
  // El reloj de la diaria y la actualización automática
  setInterval(() => { const r = document.getElementById("reloj"); if (r) r.textContent = faltaParaMedianoche(); }, 1000);
  const actualizar = async () => {
    if (!S.info || document.hidden || location.hash.startsWith("#/jugar")) return;
    const foto = () => JSON.stringify([S.info?.miembros, [...S.estado].map(([k, v]) => [k, [...v]])]);
    const antes = foto();
    try {
      if (!parejaCompleta()) S.info = (await be.info()) || S.info;
      await refrescarEstado();
    } catch { return; }
    if (antes !== foto() && !location.hash.startsWith("#/ajustes")) render();
  };
  setInterval(actualizar, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) actualizar(); });
}
arrancar();
