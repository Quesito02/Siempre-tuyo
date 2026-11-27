# Nosotros 💞 — preguntas para parejas

Página web estática (GitHub Pages) + Supabase. Cada uno responde desde su celular sin ver lo que puso el otro; los resultados se abren cuando ambos terminan.

## Tipos de juego
- **Yo nunca nunca**: Lo he hecho / ¡Nunca lo he hecho!
- **¿Quién es más probable?**: nombre 1 / nombre 2 / Ambos / Ninguno (con % de similitud)
- **¿Prefieres?**: opción A / opción B (con % de similitud)
- **Conversación profunda**: opciones o texto libre
- **Conversación diaria**: una pregunta nueva cada día (hora Colombia)
- **¿Me conoces?**: cada uno responde sobre sí mismo y adivina lo del otro; gana quien acierte más (marcador acumulado)

## Estructura
```
index.html            página
css/styles.css        estilos
js/config.js          ← aquí van la URL y la clave anon de Supabase
js/backend.js         Supabase o modo demo
js/app.js             pantallas y lógica
data/preguntas.json   banco de preguntas (edítalo libremente)
supabase/schema.sql   tablas + seguridad (RLS) + funciones
```

## Puesta en marcha
1. **Supabase**: crea el proyecto → *Authentication → Sign In / Providers* → activa **Allow anonymous sign-ins**.
2. **SQL Editor** → pega todo `supabase/schema.sql` → *Run*.
3. *Project Settings → API*: copia la **Project URL** y la clave **anon public** en `js/config.js`. (Nunca la `service_role`.)
4. **GitHub Pages**: repo → *Settings → Pages* → *Deploy from a branch* → `main` / `root`.

Sin datos en `config.js` la página funciona en **modo demo** (todo en el navegador y puedes jugar como los dos).

## Agregar preguntas
En `data/preguntas.json`, cada tema tiene `paquetes`. Cada paquete necesita un `id` único (no lo cambies después de jugarlo, porque las respuestas se guardan con ese id), `titulo`, `emoji`, `tipo` y `preguntas`:
- `nunca` y `quien`: lista de textos.
- `prefieres`: `{ "a": "…", "b": "…" }`.
- `profunda`: `{ "q": "…", "op": ["…"] }`, o solo `{ "q": "…" }` para respuesta libre.

Un tema con `"adultos": true` solo se ve si se activa "Mostrar temas 18+" en Ajustes.

## Paquetes de reemplazo
`nuevas` en `data/preguntas.json` guarda paquetes nuevos por tema. Cuando los dos terminan un paquete de `temas`, ese paquete sale de la lista y entra uno de `nuevas` del mismo tema. Los que nadie o solo uno ha respondido se quedan igual.

## ¿Me conoces?
Las rondas están en `conoces` (cada pregunta con 4 opciones). Usa la misma tabla `respuestas`, no necesita SQL nuevo.
