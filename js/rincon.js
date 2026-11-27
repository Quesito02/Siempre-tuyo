// "Siempre tuyo": portada después de entrar, y las pestañas Planes, Cápsulas y Día a día.
// El contenido personal (subtítulo, planes, cartas y texto final) está cifrado en data/cartas.json
// y se abre con el código. Lo que escriben los dos se guarda en Supabase (tabla rincon).

const CLAVE_CODIGO = "nosotros-codigo";
const EMOJIS = ["🥰", "😊", "😴", "😔", "😤", "🤒", "💪", "🥲", "🤯", "😌"];
const ICONO_CANDADO = `<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><circle cx="12" cy="16" r="1.2"/></svg>`;
const ICONO_ABIERTO = `<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/><circle cx="12" cy="16" r="1.2"/></svg>`;

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hoyKey = (ms = Date.now()) => new Date(ms - 5 * 3600e3).toISOString().slice(0, 10); // fecha en Colombia
const fechaBonita = (iso) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" });
const diaCorto = (k) => new Date(k + "T12:00:00-05:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Bogota" });
const guardado = {
  get() { try { return localStorage.getItem(CLAVE_CODIGO) || sessionStorage.getItem("nosotros-cartas"); } catch { return null; } },
  set(v) { try { localStorage.setItem(CLAVE_CODIGO, v); } catch {} },
  borrar() { try { localStorage.removeItem(CLAVE_CODIGO); sessionStorage.removeItem("nosotros-cartas"); } catch {} },
};

export function crearRincon(ctx) {
  const { app, be, esc, toast, ir, nombre, yo, otro } = ctx;
  const R = { meta: null, contenido: null, filas: [], capsulas: [], emoji: null, errorTabla: false };
  const parrafos = (t) => String(t || "").split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const fila = (tipo, clave, jugador) => R.filas.find((r) => r.tipo === tipo && r.clave === clave && (jugador == null || r.jugador === jugador));
  const filas = (tipo) => R.filas.filter((r) => r.tipo === tipo);
  const cabeza = (titulo) => `<header class="top"><a class="icono" href="#/" aria-label="Inicio">‹</a><b class="titulo-top">${esc(titulo)}</b><span class="icono-vacio"></span></header>`;

  async function descifrar(codigo) {
    const m = R.meta;
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(codigo), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(m.salt), iterations: m.iter, hash: "SHA-256" }, base,
      { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(m.iv) }, key, b64(m.data));
    const d = JSON.parse(new TextDecoder().decode(plano));
    return Array.isArray(d) ? { cartas: d, rincon: {} } : d;
  }
  async function recargar() {
    try { [R.filas, R.capsulas] = await Promise.all([be.listarRincon(), be.capsulas()]); R.errorTabla = false; }
    catch (x) { R.errorTabla = true; throw x; }
  }
  async function recargarSeguro() {
    try { await recargar(); }
    catch (x) { toast(/rincon|capsulas|schema cache|does not exist|Could not find/i.test(x.message) ? "Falta correr rincon.sql en Supabase" : x.message); }
  }
  async function hacer(fn) { try { await fn(); await recargar(); return true; } catch (x) { toast(x.message); return false; } }

  // ---------- arranque ----------
  async function cargar() {
    try { const r = await fetch("data/cartas.json", { cache: "no-cache" }); R.meta = r.ok ? await r.json() : null; } catch { R.meta = null; }
    const cod = guardado.get();
    if (R.meta && cod) { try { R.contenido = await descifrar(cod); } catch { guardado.borrar(); } }
    if (ctx.info()) await recargarSeguro();
  }

  // ---------- bloqueo con código ----------
  function vistaBloqueo() {
    app.innerHTML = `<section class="bienvenida">
      <div class="logo">💌</div><h1 class="mano titulo-mano">Siempre tuyo</h1>
      <p class="sub">Hola, ${esc(R.meta?.para || "")}. Escribe el código para entrar.</p>
      <form class="form" id="fcod"><input id="cod" class="codigo-input" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="••••••" required>
      <button class="btn" type="submit">Entrar</button></form></section>`;
    const f = document.getElementById("fcod"), inp = document.getElementById("cod");
    inp.focus();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector("button"); btn.disabled = true;
      try {
        R.contenido = await descifrar(inp.value.trim()); guardado.set(inp.value.trim());
        await recargarSeguro(); vistaPortada();
      } catch {
        inp.value = ""; inp.classList.add("mal"); setTimeout(() => inp.classList.remove("mal"), 450);
        toast("Ese no es el código"); btn.disabled = false;
      }
    };
  }
  const necesitaCodigo = () => R.meta && !R.contenido;

  // ---------- portada ----------
  function vistaPortada() {
    if (necesitaCodigo()) return vistaBloqueo();
    const C = R.contenido?.rincon || {};
    const info = ctx.info();
    const pend = ctx.pendientesQuiz();
    const planes = todosLosPlanes(), hechos = planes.filter((p) => fila("plan", p.id)).length;
    const ahora = Date.now();
    const porAbrir = R.capsulas.filter((c) => new Date(c.abre_en).getTime() > ahora).length;
    const hoy = hoyKey(), mio = fila("dia", hoy, yo()), suyo = fila("dia", hoy, otro());
    const pctPlanes = planes.length ? Math.round((hechos / planes.length) * 100) : 0;
    const item = (href, emoji, titulo, sub, extra = "") => `<a class="tema" href="${href}">
        <span class="tema-emoji">${emoji}</span>
        <span class="tema-info"><b>${esc(titulo)}</b><small>${sub}</small></span>
        <span class="flecha">${extra || "›"}</span></a>`;
    app.innerHTML = `<header class="top">
        <div class="pareja"><span class="av av1">${esc(nombre(1).trim()[0]?.toUpperCase() || "?")}</span><span class="av av2">${esc(nombre(2).trim()[0]?.toUpperCase() || "?")}</span></div>
        <div class="top-der">${be.demo ? `<button class="chip demo" id="cambiar">Jugando como ${esc(nombre(yo()))} ⇄</button>` : ""}<a class="icono" href="#/ajustes" aria-label="Ajustes">⚙️</a></div></header>
      <section class="portada">
        <h1 class="mano titulo-mano">Siempre tuyo</h1>
        ${C.subtitulo ? `<p>${esc(C.subtitulo)}</p>` : ""}
      </section>
      ${info.miembros.length < 2 ? `<div class="invitar"><b>Invita a tu pareja</b><p>Pásale este código para que se una:</p><div class="codigo">${esc(info.codigo)}</div></div>` : ""}
      ${R.errorTabla ? `<div class="aviso" style="margin-top:14px">Falta correr <b>rincon.sql</b> en Supabase para que Planes, Cápsulas y Día a día se guarden.</div>` : ""}
      <h3>Lo nuestro</h3>
      <div class="temas">
        ${item("#/preguntas", "💬", "Preguntas", pend ? `<span class="pill">${pend} ${pend === 1 ? "pendiente" : "pendientes"}</span> Juegos y conversaciones` : "Juegos y conversaciones")}
        ${ctx.resumenConoces ? item("#/conoces", "🎯", "¿Me conoces?", ctx.resumenConoces()) : ""}
        ${item("#/planes", "📝", "Planes", `<i style="--p:${pctPlanes}%"></i>${hechos} de ${planes.length} cumplidos`)}
        ${item("#/capsulas", "💌", "Cápsulas", porAbrir ? `${porAbrir} por abrir · cartas y mensajes` : "Cartas y mensajes para el futuro")}
        ${item("#/dia", "☀️", "Día a día", mio ? `Tú: ${esc(mio.datos.emoji)}${suyo ? ` · ${esc(nombre(otro()))}: ${esc(suyo.datos.emoji)}` : ` · ${esc(nombre(otro()))} aún no`}` : `<span class="pill">Hoy</span> Cuéntale cómo va tu día`)}
      </div>
      ${C.final ? `<h3>Para ti</h3><article class="carta-oscura">${parrafos(C.final)}<p class="firma mano">${esc(C.firma || "Siempre tuyo")}</p></article>` : ""}`;
    const b = document.getElementById("cambiar");
    if (b) b.onclick = async () => { ctx.cambiarJugador?.(); };
  }

  // ---------- planes ----------
  function todosLosPlanes() {
    const base = (R.contenido?.rincon?.planes || []).map((p) => ({ id: p.id, texto: p.texto }));
    const propios = filas("deseo").map((r) => ({ id: "d-" + r.id, texto: r.datos.texto, fila: r }));
    return [...base, ...propios];
  }
  function vistaPlanes() {
    if (necesitaCodigo()) return ir("#/");
    const todos = todosLosPlanes(), hechos = todos.filter((p) => fila("plan", p.id)).length;
    const pct = todos.length ? Math.round((hechos / todos.length) * 100) : 0;
    const filtro = R.filtroPlanes || "todos";
    const visibles = todos.filter((p) => filtro === "todos" || (filtro === "hechos" ? fila("plan", p.id) : !fila("plan", p.id)));
    app.innerHTML = `${cabeza("Planes")}
      <nav class="chips">${[["todos", "⭐ Todos"], ["pend", "⏳ Pendientes"], ["hechos", "✅ Cumplidos"]].map(([k, t]) => `<button class="chip ${filtro === k ? "on" : ""}" data-f="${k}">${t}</button>`).join("")}</nav>
      <div class="progreso-planes"><span>${hechos} de ${todos.length} cumplidos</span><i style="--p:${pct}%"></i></div>
      <div class="planes">${visibles.map((p) => {
        const h = fila("plan", p.id);
        return `<div class="plan ${h ? "hecho" : ""}" data-id="${esc(p.id)}">
          <span class="caja"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span>
          <span class="txt"><span>${esc(p.texto)}</span>${h ? `<small>Cumplido · marcó ${esc(nombre(h.jugador))}</small>` : ""}</span>
          ${p.fila && p.fila.jugador === yo() ? `<button class="borrar" data-borrar="${esc(p.fila.id)}" aria-label="Quitar">×</button>` : ""}</div>`;
      }).join("") || `<p class="vacio">Nada por aquí.</p>`}</div>
      <h3>Agregar un plan</h3>
      <form class="agregar" id="f-plan"><input id="nuevo-plan" maxlength="80" placeholder="Ej. Ir a un partido juntos"><button class="btn" type="submit">Agregar</button></form>`;
    app.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { R.filtroPlanes = b.dataset.f; vistaPlanes(); });
    app.querySelectorAll(".plan").forEach((el) => el.onclick = async (e) => {
      const del = e.target.closest("[data-borrar]");
      const h = fila("plan", el.dataset.id);
      if (!del && !h) el.classList.add("hecho");
      const ok = await hacer(async () => {
        if (del) { await be.borrarRincon(del.dataset.borrar); if (h) await be.borrarRincon(h.id); }
        else if (h) await be.borrarRincon(h.id);
        else await be.crearRincon({ tipo: "plan", clave: el.dataset.id });
      });
      if (ok) setTimeout(vistaPlanes, del || h ? 0 : 380);
      else vistaPlanes();
    });
    document.getElementById("f-plan").onsubmit = async (e) => {
      e.preventDefault();
      const t = document.getElementById("nuevo-plan").value.trim(); if (!t) return;
      if (await hacer(() => be.crearRincon({ tipo: "deseo", clave: crypto.randomUUID().slice(0, 12), datos: { texto: t } }))) { vistaPlanes(); toast("Plan agregado"); }
    };
  }

  // ---------- cápsulas ----------
  function listaCapsulas() {
    const cartas = (R.contenido?.cartas || []).map((c) => ({ carta: c }));
    const caps = R.capsulas.map((c) => ({ cap: c, contenido: R.filas.find((r) => r.id === c.id) }));
    return [...cartas, ...caps];
  }
  function vistaCapsulas() {
    if (necesitaCodigo()) return ir("#/");
    const ahora = Date.now(), lista = listaCapsulas();
    const filtro = R.filtroCaps || "todas";
    const abierta = (x) => x.carta || new Date(x.cap.abre_en).getTime() <= ahora;
    const visibles = lista.map((x, k) => ({ x, k })).filter(({ x }) => filtro === "todas" || (filtro === "abiertas" ? abierta(x) : !abierta(x)));
    const tarjeta = ({ x, k }) => {
      if (x.carta) return `<button class="paq t-profunda capsula" data-k="${k}"><div class="paq-info">
          <div class="paq-tipo">Carta</div><div class="paq-titulo">${esc(x.carta.titulo)}</div>
          <div class="paq-pie"><span class="estado">Para ${esc(R.meta?.para || "ti")}</span><span class="accion a-listo">Leer ›</span></div></div>
          <div class="paq-emoji ico-cap">${ICONO_ABIERTO}</div></button>`;
      const c = x.cap, ab = abierta(x), dias = Math.ceil((new Date(c.abre_en).getTime() - ahora) / 86400e3);
      return `<button class="paq ${ab ? "t-profunda" : "t-nunca cerrada"} capsula" data-k="${k}"><div class="paq-info">
          <div class="paq-tipo">${ab ? "Cápsula abierta" : `Se abre el ${esc(fechaBonita(c.abre_en))}`}</div>
          <div class="paq-titulo">${esc(c.titulo || "Cápsula")}</div>
          <div class="paq-pie"><span class="estado">De ${esc(nombre(c.jugador))}${!ab ? ` · faltan ${dias} ${dias === 1 ? "día" : "días"}` : ""}</span>
          <span class="accion ${ab ? "a-listo" : "a-esperando"}">${ab ? "Leer ›" : c.jugador === yo() ? "Ver ›" : "Cerrada"}</span></div></div>
          <div class="paq-emoji ico-cap">${ab ? ICONO_ABIERTO : ICONO_CANDADO}</div></button>`;
    };
    const manana = hoyKey(ahora + 86400e3);
    app.innerHTML = `${cabeza("Cápsulas")}
      <nav class="chips">${[["todas", "⭐ Todas"], ["abiertas", "📖 Abiertas"], ["cerradas", "🔒 Por abrir"]].map(([k, t]) => `<button class="chip ${filtro === k ? "on" : ""}" data-f="${k}">${t}</button>`).join("")}</nav>
      <button class="btn nueva-cap" id="abrir-form">＋ Nueva cápsula</button>
      <form class="form-cap" id="f-cap" hidden>
        <input id="cap-titulo" maxlength="60" placeholder="Título (ej. Para cuando nos veamos)" required>
        <textarea id="cap-msg" maxlength="2000" placeholder="Lo que quieras decir…" required></textarea>
        <label class="fila"><span>Se abre el</span><input type="date" id="cap-fecha" min="${manana}" value="${manana}" required></label>
        <div class="fila-btns"><button type="button" class="btn sec" id="cancelar-cap">Cancelar</button><button class="btn" type="submit">Guardar</button></div>
      </form>
      <div class="lista">${visibles.map(tarjeta).join("") || `<p class="vacio">No hay cápsulas aquí.</p>`}</div>`;
    app.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { R.filtroCaps = b.dataset.f; vistaCapsulas(); });
    const form = document.getElementById("f-cap"), abrir = document.getElementById("abrir-form");
    abrir.onclick = () => { form.hidden = false; abrir.hidden = true; document.getElementById("cap-titulo").focus(); };
    document.getElementById("cancelar-cap").onclick = () => { form.hidden = true; abrir.hidden = false; };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const titulo = document.getElementById("cap-titulo").value.trim(), mensaje = document.getElementById("cap-msg").value.trim();
      const fecha = document.getElementById("cap-fecha").value;
      if (!titulo || !mensaje || !fecha) return;
      const ok = await hacer(() => be.crearRincon({ tipo: "capsula", clave: crypto.randomUUID().slice(0, 12), titulo, datos: { mensaje },
        abre_en: new Date(fecha + "T00:00:00-05:00").toISOString() }));
      if (ok) { vistaCapsulas(); toast("Guardada. Se abre el " + fechaBonita(fecha + "T12:00:00-05:00")); }
    };
    app.querySelectorAll(".capsula").forEach((b) => b.onclick = () => {
      const x = lista[Number(b.dataset.k)];
      if (x.carta) return abrirCarta(x.carta.titulo, x.carta.texto, x.carta.firma);
      if (!x.contenido) return toast(abierta(x) ? "Recarga para abrirla" : `Todavía no. Se abre el ${fechaBonita(x.cap.abre_en)}`);
      abrirCarta(x.cap.titulo, x.contenido.datos.mensaje, `De ${nombre(x.cap.jugador)}`, x.cap.jugador === yo() ? x.cap.id : null);
    });
  }
  function abrirCarta(titulo, texto, firma, borrarId) {
    const m = document.createElement("div"); m.className = "modal";
    m.innerHTML = `<article class="carta-oscura"><button class="cerrar" aria-label="Cerrar">✕</button>
      <h2 class="mano titulo-carta">${esc(titulo)}</h2>${parrafos(texto)}<p class="firma mano">${esc(firma || "")}</p>
      ${borrarId ? `<button class="btn sec peligro" id="borrar-cap">Borrar cápsula</button>` : ""}</article>`;
    document.body.appendChild(m);
    m.onclick = (e) => { if (e.target === m || e.target.closest(".cerrar")) m.remove(); };
    const bb = m.querySelector("#borrar-cap");
    if (bb) bb.onclick = async () => { if (await hacer(() => be.borrarRincon(borrarId))) { m.remove(); vistaCapsulas(); } };
  }

  // ---------- día a día ----------
  function vistaDia() {
    if (necesitaCodigo()) return ir("#/");
    const hoy = hoyKey(), mio = fila("dia", hoy, yo()), suyo = fila("dia", hoy, otro());
    if (R.emoji == null) R.emoji = mio?.datos?.emoji || null;
    const col = (j, r) => `<div class="dia-card"><span class="av av${j}">${esc(nombre(j).trim()[0]?.toUpperCase() || "?")}</span><b>${esc(nombre(j))}</b>
      ${r ? `<div class="emoji-grande">${esc(r.datos.emoji)}</div><div class="frase">${esc(r.datos.frase || "")}</div>` : `<div class="emoji-grande vacio-emoji">·</div><div class="frase vacio">Todavía no cuenta su día</div>`}</div>`;
    const dias = [];
    for (let d = 1; d <= 14; d++) {
      const k = hoyKey(Date.now() - d * 86400e3), a = fila("dia", k, yo()), b = fila("dia", k, otro());
      if (a || b) dias.push(`<div class="fila hist-dia"><span>${esc(diaCorto(k))}</span><b>${a ? `${esc(a.datos.emoji)} ${esc(a.datos.frase || "")}` : "—"}<br><small>${esc(nombre(otro()))}: ${b ? `${esc(b.datos.emoji)} ${esc(b.datos.frase || "")}` : "—"}</small></b></div>`);
    }
    app.innerHTML = `${cabeza("Día a día")}
      <h3>Hoy</h3>
      <div class="dias">${col(yo(), mio)}${col(otro(), suyo)}</div>
      <h3>¿Cómo va tu día?</h3>
      <div class="emojis">${EMOJIS.map((e) => `<button type="button" class="${R.emoji === e ? "sel" : ""}" data-e="${e}">${e}</button>`).join("")}</div>
      <input id="frase" maxlength="120" placeholder="Una frase corta…" value="${esc(mio?.datos?.frase || "")}">
      <button class="btn" id="guardar-dia" style="margin-top:10px">${mio ? "Actualizar" : "Guardar"}</button>
      ${dias.length ? `<h3>Días anteriores</h3><div class="mis">${dias.join("")}</div>` : ""}`;
    app.querySelectorAll(".emojis button").forEach((b) => b.onclick = () => {
      R.emoji = b.dataset.e; app.querySelectorAll(".emojis button").forEach((x) => x.classList.toggle("sel", x === b));
    });
    document.getElementById("guardar-dia").onclick = async () => {
      if (!R.emoji) return toast("Escoge un emoji");
      if (await hacer(() => be.guardarRincon({ tipo: "dia", clave: hoy, datos: { emoji: R.emoji, frase: document.getElementById("frase").value.trim() } }))) { vistaDia(); toast("Listo 💗"); }
    };
  }

  // ---------- actualización automática ----------
  const VISTAS = { "#/": vistaPortada, "": vistaPortada, "#/planes": vistaPlanes, "#/capsulas": vistaCapsulas, "#/dia": vistaDia };
  async function actualizar() {
    if (necesitaCodigo() || document.querySelector(".modal") || document.activeElement?.matches("input, textarea")) return;
    const f = document.getElementById("f-cap"); if (f && !f.hidden) return;
    const antes = JSON.stringify([R.filas, R.capsulas]);
    try { await recargar(); } catch { return; }
    if (antes !== JSON.stringify([R.filas, R.capsulas])) VISTAS[location.hash]?.();
  }

  return {
    cargar, vistaPortada, vistaPlanes, vistaCapsulas, vistaDia, actualizar,
    esSuya: (h) => h in VISTAS,
    olvidarCodigo() { guardado.borrar(); R.contenido = null; },
    async alEntrar() { await recargarSeguro(); },
  };
}
