// "¿Me conoces?": en cada ronda respondes sobre ti y adivinas lo que respondió tu pareja.
// Usa la misma tabla `respuestas` del quiz (respuesta a ciegas), así que no necesita SQL nuevo.
// Cada respuesta se guarda como [lo mío, lo que adivino del otro] por pregunta.

export function crearConoces(ctx) {
  const { app, be, esc, toast, ir, nombre, yo, otro, avatar, respondio, situacion, refrescarEstado } = ctx;
  const C = { juego: null, cache: new Map() }; // cache: ronda id -> {1: [...], 2: [...]}
  const rondas = () => ctx.data().conoces || [];
  const ronda = (id) => rondas().find((r) => r.id === id);
  const cabeza = (titulo, atras = "#/conoces") =>
    `<header class="top"><a class="icono" href="${atras}" aria-label="Atrás">‹</a><b class="titulo-top">${esc(titulo)}</b><span class="icono-vacio"></span></header>`;

  // Puntos: cuántas veces mi adivinanza coincide con lo que el otro respondió de sí mismo
  function puntos(r, res) {
    const p = { 1: 0, 2: 0 }, n = r.preguntas.length;
    for (let i = 0; i < n; i++) {
      if (res[1]?.[i]?.[1] === res[2]?.[i]?.[0]) p[1]++;
      if (res[2]?.[i]?.[1] === res[1]?.[i]?.[0]) p[2]++;
    }
    return p;
  }
  async function resultados(id) {
    if (C.cache.has(id)) return C.cache.get(id);
    const res = await be.resultados(id);
    if (res[1] && res[2]) C.cache.set(id, res);
    return res;
  }
  async function marcador() {
    const listas = rondas().filter((r) => situacion(r.id) === "listo");
    const total = { 1: 0, 2: 0, rondas: listas.length, max: 0 };
    for (const r of listas) {
      try { const p = puntos(r, await resultados(r.id)); total[1] += p[1]; total[2] += p[2]; total.max += r.preguntas.length; } catch {}
    }
    return total;
  }

  // ---------- resumen para la portada ----------
  function resumen() {
    const rs = rondas();
    const tuTurno = rs.filter((r) => situacion(r.id) === "tuturno").length;
    const hechas = rs.filter((r) => situacion(r.id) === "listo").length;
    if (tuTurno) return `<span class="pill">${tuTurno} ${tuTurno === 1 ? "pendiente" : "pendientes"}</span> Adivina sus respuestas`;
    return `${hechas} de ${rs.length} rondas · ¿quién conoce más al otro?`;
  }

  // ---------- lista de rondas ----------
  async function vistaLista() {
    const rs = rondas();
    const tarjeta = (r) => {
      const sit = situacion(r.id);
      const accion = { listo: "Resultados", esperando: "Esperando", tuturno: "Tu turno", nuevo: "Jugar" }[sit];
      return `<a class="paq t-conoces" href="#/conoces/${sit === "listo" || sit === "esperando" ? "resultado" : "jugar"}/${r.id}">
        <div class="paq-info">
          <div class="paq-tipo">Ronda · ${r.preguntas.length} preguntas</div>
          <div class="paq-titulo">${esc(r.titulo)}</div>
          <div class="paq-pie"><span class="pareja">${avatar(1, { sm: true, check: respondio(r.id, 1) })}${avatar(2, { sm: true, check: respondio(r.id, 2) })}</span>
          <span class="accion a-${sit}">${accion} ›</span></div>
        </div><div class="paq-emoji">${r.emoji}</div></a>`;
    };
    const pintar = (m) => {
      const lider = !m || !m.rondas ? "" : m[yo()] === m[otro()] ? "Van empatados" : `${esc(nombre(m[yo()] > m[otro()] ? yo() : otro()))} va ganando`;
      app.innerHTML = `${cabeza("¿Me conoces?", "#/")}
        <section class="mc-intro">
          <div class="mc-marcador">
            <div>${avatar(yo())}<b>${m ? m[yo()] : "·"}</b><small>${esc(nombre(yo()))}</small></div>
            <span class="mc-vs">${m && m.rondas ? `${m.rondas} ${m.rondas === 1 ? "ronda" : "rondas"}` : "vs"}</span>
            <div>${avatar(otro())}<b>${m ? m[otro()] : "·"}</b><small>${esc(nombre(otro()))}</small></div>
          </div>
          <p>${lider ? `<b>${lider}.</b> ` : ""}Responde cada pregunta sobre ti y luego adivina qué respondió ${esc(nombre(otro()))}. Gana un punto quien acierte.</p>
        </section>
        <div class="lista">${rs.map(tarjeta).join("")}</div>`;
    };
    pintar(null);
    const m = await marcador();
    if (location.hash === "#/conoces") pintar(m);
  }

  // ---------- jugar ----------
  function vistaJugar(id) {
    const r = ronda(id);
    if (!r) return ir("#/conoces");
    if (respondio(id, yo())) return ir("#/conoces/resultado/" + id);
    if (!C.juego || C.juego.id !== id) C.juego = { id, paso: 0, r: [] };
    const J = C.juego, n = r.preguntas.length, i = Math.floor(J.paso / 2), adivina = J.paso % 2 === 1;
    const q = r.preguntas[i];
    const elegido = J.r[i]?.[adivina ? 1 : 0];
    app.innerHTML = `<header class="top"><button class="icono" id="atras" aria-label="Atrás">‹</button>
        <b class="titulo-top">${esc(r.titulo)}</b><a class="icono" href="#/conoces" aria-label="Salir">✕</a></header>
      <div class="barra"><i style="width:${(J.paso / (n * 2)) * 100}%"></i></div>
      <section class="jugar t-conoces">
        <div class="contador">${i + 1} / ${n}</div>
        <div class="mc-paso ${adivina ? "adivina" : ""}">${adivina
          ? `${avatar(otro(), { sm: true })}<span>Ahora adivina: <b>¿qué respondió ${esc(nombre(otro()))}?</b></span>`
          : `${avatar(yo(), { sm: true })}<span>Responde sobre <b>ti</b></span>`}</div>
        <h2 class="pregunta">${esc(q.q)}</h2>
        <div class="ops">${q.op.map((o, k) => `<button class="op ${elegido === k ? "sel" : ""}" data-v="${k}">${esc(o)}</button>`).join("")}</div>
      </section>`;
    document.getElementById("atras").onclick = () => { if (J.paso > 0) { J.paso--; vistaJugar(id); } else history.back(); };
    app.querySelectorAll(".op").forEach((b) => b.onclick = () => {
      app.querySelectorAll(".op").forEach((x) => x.classList.toggle("sel", x === b));
      J.r[i] ||= [null, null];
      J.r[i][adivina ? 1 : 0] = Number(b.dataset.v);
      setTimeout(async () => {
        if (J.paso < n * 2 - 1) { J.paso++; return vistaJugar(id); }
        app.querySelectorAll("button").forEach((x) => x.disabled = true);
        try {
          await be.responder(id, yo(), ctx.info(), J.r);
          C.juego = null; await refrescarEstado(); ir("#/conoces/resultado/" + id);
        } catch (x) { toast(x.message); app.querySelectorAll("button").forEach((x) => x.disabled = false); }
      }, 180);
    });
  }

  // ---------- resultado ----------
  async function vistaResultado(id) {
    const r = ronda(id);
    if (!r) return ir("#/conoces");
    if (!respondio(id, yo())) return ir("#/conoces/jugar/" + id);
    const res = await resultados(id);
    const mio = res[yo()], suyo = res[otro()];
    if (!suyo) {
      app.innerHTML = `${cabeza(r.titulo)}<section class="esperando">
        <div class="reloj-arena">⏳</div><h2>Esperando a ${esc(nombre(otro()))}</h2>
        <p>Cuando responda, aquí verán quién adivinó más. Tus respuestas quedan escondidas hasta entonces.</p>
        <button class="btn sec" id="recargar">Revisar ahora</button></section>`;
      document.getElementById("recargar").onclick = async () => { await refrescarEstado(); vistaResultado(id); };
      return;
    }
    const p = puntos(r, res), n = r.preguntas.length, a = p[yo()], b = p[otro()];
    const titular = a === b ? (a === n ? "¡Perfecto los dos! 🤯" : "Empate 🤝") : a > b ? "¡Ganaste esta ronda! 🏆" : `Ganó ${esc(nombre(otro()))} 🏆`;
    const linea = (quien, respondio, adivino, q) => {
      const ok = adivino === respondio;
      return `<div class="mc-linea ${ok ? "ok" : "no"}">${avatar(quien, { sm: true })}
        <span>${esc(nombre(quien))} dijo <b>${esc(q.op[respondio] ?? "—")}</b><br>
        <small>${esc(nombre(quien === yo() ? otro() : yo()))} adivinó: ${esc(q.op[adivino] ?? "—")}</small></span><i>${ok ? "✓" : "✗"}</i></div>`;
    };
    app.innerHTML = `${cabeza(r.titulo)}
      <section class="mc-res">
        <div class="mc-titular">${titular}</div>
        <div class="mc-marcador">
          <div>${avatar(yo())}<b>${a}<small>/${n}</small></b><small>${esc(nombre(yo()))} acertó</small></div>
          <span class="mc-vs">vs</span>
          <div>${avatar(otro())}<b>${b}<small>/${n}</small></b><small>${esc(nombre(otro()))} acertó</small></div>
        </div>
      </section>
      <section class="resultados t-conoces">${r.preguntas.map((q, k) => `
        <div class="res"><div class="res-q">${k + 1}. ${esc(q.q)}</div>
          ${linea(yo(), mio[k]?.[0], suyo[k]?.[1], q)}
          ${linea(otro(), suyo[k]?.[0], mio[k]?.[1], q)}
        </div>`).join("")}</section>
      <a class="btn" href="#/conoces" style="display:block;text-align:center;margin-top:16px">Ver todas las rondas</a>`;
  }

  return {
    resumen, vistaLista, vistaJugar, vistaResultado,
    esSuya: (h) => h.startsWith("#/conoces"),
    jugando: (h) => h.startsWith("#/conoces/jugar"),
  };
}
