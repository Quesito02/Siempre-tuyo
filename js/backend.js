// Dos formas de guardar los datos con la misma interfaz:
// - SupabaseBackend: real, sincroniza entre dos celulares.
// - DemoBackend: todo en este navegador, para probar sin Supabase.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

function err(msg) { const e = new Error(msg); e.amigable = true; return e; }

class SupabaseBackend {
  demo = false;
  constructor() {
    this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  async rpc(fn, args = {}) {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw err(error.message);
    if (data && data.error) throw err(data.error);
    return data;
  }
  async init() {
    const { data: { session } } = await this.sb.auth.getSession();
    if (!session) {
      const { error } = await this.sb.auth.signInAnonymously();
      if (error) throw err("No se pudo iniciar sesión. ¿Activaste 'Anonymous sign-ins' en Supabase? (" + error.message + ")");
    }
    return this.rpc("mi_info");
  }
  crearPareja(nombre, pin) { return this.rpc("crear_pareja", { p_nombre: nombre, p_pin: pin }); }
  unirse(codigo, nombre, pin) { return this.rpc("unirse_pareja", { p_codigo: codigo, p_nombre: nombre, p_pin: pin }); }
  recuperar(codigo, nombre, pin) { return this.rpc("recuperar_lugar", { p_codigo: codigo, p_nombre: nombre, p_pin: pin }); }
  info() { return this.rpc("mi_info"); }
  async estado() { return (await this.rpc("estado_paquetes")) || []; }
  async responder(paqueteId, jugador, pareja, respuestas) {
    const { error } = await this.sb.from("respuestas").insert({
      pareja_id: pareja.id, jugador, paquete_id: paqueteId, respuestas,
    });
    if (error) {
      if (error.code === "23505") throw err("Ya habías respondido este paquete.");
      throw err(error.message);
    }
  }
  async resultados(paqueteId) {
    const { data, error } = await this.sb.from("respuestas")
      .select("jugador, respuestas").eq("paquete_id", paqueteId);
    if (error) throw err(error.message);
    const out = {};
    for (const r of data) out[r.jugador] = r.respuestas;
    return out;
  }
  async salir() { await this.sb.auth.signOut(); }
}

// ---------- Modo demo (localStorage) ----------
const KEY = "nosotros-demo-v1";
function leer() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function guardar(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }

class DemoBackend {
  demo = true;
  async init() { return this.info(); }
  info() {
    const d = leer();
    if (!d.pareja) return null;
    return { id: "demo", codigo: d.pareja.codigo, jugador: d.activo || 1, miembros: d.pareja.miembros };
  }
  crearPareja(nombre, _pin, nombre2) {
    const d = { pareja: { codigo: "DEMO42", miembros: [
      { jugador: 1, nombre }, { jugador: 2, nombre: nombre2 || "Pareja" },
    ] }, activo: 1, respuestas: {} };
    guardar(d);
    return this.info();
  }
  unirse() { throw err("En modo demo solo puedes crear una pareja de prueba."); }
  recuperar() { throw err("No disponible en modo demo."); }
  cambiarJugador() { const d = leer(); d.activo = d.activo === 2 ? 1 : 2; guardar(d); return this.info(); }
  async estado() {
    const d = leer(); const out = [];
    for (const [pid, porJ] of Object.entries(d.respuestas || {}))
      for (const j of Object.keys(porJ)) out.push({ paquete_id: pid, jugador: Number(j) });
    return out;
  }
  async responder(paqueteId, jugador, _pareja, respuestas) {
    const d = leer(); d.respuestas ||= {}; d.respuestas[paqueteId] ||= {};
    if (d.respuestas[paqueteId][jugador]) throw err("Ya habías respondido este paquete.");
    d.respuestas[paqueteId][jugador] = respuestas; guardar(d);
  }
  async resultados(paqueteId) {
    const d = leer(); const r = (d.respuestas || {})[paqueteId] || {};
    const yo = d.activo || 1;
    // Igual que la regla de Supabase: solo ves al otro si ya respondiste tú
    if (!r[yo]) return {};
    return r;
  }
  async salir() { try { localStorage.removeItem(KEY); } catch {} }
}

export function crearBackend() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) return new SupabaseBackend();
  return new DemoBackend();
}
