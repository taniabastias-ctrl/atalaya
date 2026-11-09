# Disparador del agente (Cloudflare Worker)

GitHub Actions atrasa los horarios programados (el 6-nov-2026 la ejecución de las 06:30 corrió a las 13:52).
Este Worker usa una alarma de Cloudflare, que es puntual, para lanzar el workflow de lunes a viernes a las 06:30
hora de Chile. Ajusta solo el cambio de horario de verano/invierno.

## Publicar / actualizar
```powershell
cd agente/disparador
npx wrangler deploy
```

## Token de GitHub (una sola vez, o cuando venza)
1. https://github.com/settings/personal-access-tokens/new (fine-grained token)
   - Repository access: **Only select repositories** → `atalaya` (antes `licitaciones-mp`)
   - Permissions → Repository → **Actions: Read and write** (nada más)
2. Cargarlo en el Worker:
```powershell
cd agente/disparador
npx wrangler secret put GITHUB_TOKEN
```

## Verificar
- `https://licitaciones-disparador.<subdominio>.workers.dev` dice si el token está configurado (no dispara nada).
- Registros: panel de Cloudflare → Workers → licitaciones-disparador → Logs.
- Si el token vence, el Worker registra "GitHub respondió 401" y el agente no corre ese día.
