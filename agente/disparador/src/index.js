// Disparador puntual del agente de licitaciones.
// Cloudflare ejecuta `scheduled` a la hora exacta (GitHub Actions atrasa sus horarios hasta varias horas)
// y este Worker le pide a GitHub que corra el workflow "Licitaciones TI diarias".
//
// Chile cambia de horario (UTC-3 en verano, UTC-4 en invierno), así que wrangler.toml programa dos horas UTC
// y aquí solo se dispara la que corresponde a las 06:xx en Santiago.

// Repositorio cuyo workflow se lanza: variable GITHUB_REPO de wrangler.toml
const repo = (env) => env.GITHUB_REPO || "taniabastias-ctrl/atalaya";
const WORKFLOW = "licitaciones.yml";
const HORA_LOCAL = 6; // 06:30 en Chile

function horaSantiago(fecha) {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago", hour: "numeric", hourCycle: "h23",
  }).format(fecha));
}

async function dispararWorkflow(env) {
  const r = await fetch(`https://api.github.com/repos/${repo(env)}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "atalaya-disparador",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (r.status !== 204) {
    throw new Error(`GitHub respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
}

export default {
  async scheduled(controller, env, ctx) {
    const cuando = new Date(controller.scheduledTime);
    const hora = horaSantiago(cuando);
    if (hora !== HORA_LOCAL) {
      console.log(`Omitido: son las ${hora}:xx en Santiago (se dispara a las ${HORA_LOCAL}:xx).`);
      return;
    }
    await dispararWorkflow(env); // si falla, Cloudflare lo marca como error en los registros del Worker
    console.log(`Workflow disparado (${cuando.toISOString()}).`);
  },

  // Visitar la URL del Worker solo muestra el estado; no dispara nada.
  async fetch(request, env) {
    const listo = Boolean(env.GITHUB_TOKEN);
    return new Response(
      `Disparador de licitaciones: ${listo ? "token configurado" : "FALTA el secret GITHUB_TOKEN"}.\n` +
      `Corre L-V a las 06:30 (hora de Chile) y lanza ${WORKFLOW} en ${repo(env)}.\n`,
      { headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  },
};
