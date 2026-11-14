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
    if (data && data.id && data.jugador) this.yo = { pareja_id: data.id, jugador: data.jugador };
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

  // ---- "Siempre tuyo" (tabla rincon) ----
  async listarRincon() {
    const { data, error } = await this.sb.from("rincon").select("*").order("creada_en");
    if (error) throw err(error.message); return data;
  }
  async capsulas() { return (await this.rpc("capsulas")) || []; }
  async crearRincon(f) {
    const { data, error } = await this.sb.from("rincon").insert({ ...this.yo, ...f }).select().single();
    if (error) throw err(error.message); return data;
  }
  async guardarRincon(f) {
    const { data, error } = await this.sb.from("rincon").upsert({ ...this.yo, ...f }, { onConflict: "pareja_id,jugador,tipo,clave" }).select().single();
    if (error) throw err(error.message); return data;
  }
  async borrarRincon(id) {
    const { error } = await this.sb.from("rincon").delete().eq("id", id);
    if (error) throw err(error.message);
  }
}

// ---------- Modo demo (localStorage) ----------
const KEY = "nosotros-demo-v1";
const KEY_R = "nosotros-rincon-demo";
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
  async salir() { try { localStorage.removeItem(KEY); localStorage.removeItem(KEY_R); } catch {} }

  // ---- "Siempre tuyo" (simulado en este navegador) ----
  _r() { try { return JSON.parse(localStorage.getItem(KEY_R)) || []; } catch { return []; } }
  _w(v) { try { localStorage.setItem(KEY_R, JSON.stringify(v)); } catch {} }
  _yo() { return leer().activo || 1; }
  async listarRincon() {
    const yo = this._yo();
    return this._r().filter((r) => r.tipo !== "capsula" || r.jugador === yo || new Date(r.abre_en) <= new Date());
  }
  async capsulas() {
    return this._r().filter((r) => r.tipo === "capsula").map(({ id, jugador, titulo, abre_en, creada_en }) => ({ id, jugador, titulo, abre_en, creada_en }))
      .sort((a, b) => a.abre_en.localeCompare(b.abre_en));
  }
  async crearRincon(f) {
    const v = this._r(), yo = this._yo();
    if (v.some((r) => r.jugador === yo && r.tipo === f.tipo && r.clave === f.clave)) throw err("Ya existe");
    const r = { id: crypto.randomUUID(), jugador: yo, datos: {}, creada_en: new Date().toISOString(), ...f };
    v.push(r); this._w(v); return r;
  }
  async guardarRincon(f) {
    const v = this._r(), yo = this._yo(), i = v.findIndex((r) => r.jugador === yo && r.tipo === f.tipo && r.clave === f.clave);
    if (i < 0) return this.crearRincon(f);
    v[i] = { ...v[i], ...f }; this._w(v); return v[i];
  }
  async borrarRincon(id) { this._w(this._r().filter((r) => r.id !== id)); }
}

export function crearBackend() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    if (!window.supabase) {
      return { init: async () => { throw err("No cargó la librería de Supabase. Si usas Brave, baja los escudos para esta página y recarga."); } };
    }
    return new SupabaseBackend();
  }
  return new DemoBackend();
}
