#!/usr/bin/env python3
import hashlib
import hmac
import logging
import os
import subprocess
from datetime import datetime, timezone
from threading import Lock

from flask import Flask, abort, jsonify, render_template_string, request

# ---------------------------------------------------------------------------
# REPO_MAP: nombre exacto del repo en GitHub → script de deploy en el NAS
# ---------------------------------------------------------------------------
REPO_MAP: dict[str, str] = {
    "club":        "/volume1/@appdata/ContainerManager/all_shares/docker/club/repo/scripts/deploy.sh",
    "ruizespana":  "/volume1/@appdata/ContainerManager/all_shares/docker/ruizespana/pisos-app/deploy.sh",
    "ERP-haptica": "/volume1/@appdata/ContainerManager/all_shares/docker/ERP-haptica/scripts/deploy.sh",
}

WEBHOOK_SECRET       = os.environ["WEBHOOK_SECRET"].encode()
NAS_HOST             = os.environ["NAS_HOST"]
NAS_USER             = os.environ["NAS_USER"]
SSH_KEY_PATH         = os.environ.get("SSH_KEY_PATH",         "/run/secrets/deploy_key")
SSH_KNOWN_HOSTS_PATH = os.environ.get("SSH_KNOWN_HOSTS_PATH", "/run/secrets/known_hosts")
LOG_DIR              = os.environ.get("LOG_DIR",              "/logs")

app   = Flask(__name__)
_lock = Lock()
_events: list[dict] = []
_last: dict[str, dict] = {r: {"ts": None, "status": "—", "msg": ""} for r in REPO_MAP}


def _record(repo: str, status: str, msg: str) -> None:
    ts    = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    entry = {"ts": ts, "repo": repo, "status": status, "msg": msg[:400]}
    with _lock:
        _events.append(entry)
        if len(_events) > 200:
            _events.pop(0)
        _last[repo] = entry
    logging.info("[%s] %s %s: %s", ts, repo, status, msg[:200])
    try:
        with open(os.path.join(LOG_DIR, "deploy-panel.log"), "a") as fh:
            fh.write(f"{ts} [{repo}] {status}: {msg[:200]}\n")
    except OSError:
        pass


def _verify_hmac(payload: bytes, sig: str) -> bool:
    if not sig or not sig.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(WEBHOOK_SECRET, payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


def _ssh_exec(script: str) -> tuple[int, str]:
    cmd = [
        "ssh",
        "-i", SSH_KEY_PATH,
        "-o", f"UserKnownHostsFile={SSH_KNOWN_HOSTS_PATH}",
        "-o", "StrictHostKeyChecking=yes",
        "-o", "ConnectTimeout=10",
        "-o", "BatchMode=yes",
        f"{NAS_USER}@{NAS_HOST}",
        f"bash {script}",
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return r.returncode, (r.stdout + r.stderr).strip()
    except subprocess.TimeoutExpired:
        return 1, "Timeout (120 s)"
    except Exception as exc:
        return 1, str(exc)


def _deploy(repo: str) -> bool:
    script = REPO_MAP[repo]
    _record(repo, "START", f"→ {script}")
    rc, out = _ssh_exec(script)
    _record(repo, "OK" if rc == 0 else "ERROR", out or f"rc={rc}")
    return rc == 0


# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

@app.post("/hooks/<repo>")
def hooks(repo: str):
    payload = request.get_data()
    if not _verify_hmac(payload, request.headers.get("X-Hub-Signature-256", "")):
        abort(403)
    if request.headers.get("X-GitHub-Event") == "ping":
        return jsonify(ok=True, msg="pong"), 200
    if repo not in REPO_MAP:
        return jsonify(ok=True, skipped="repo desconocido"), 200
    data = request.get_json(force=True, silent=True) or {}
    ref  = data.get("ref", "")
    if ref and ref != "refs/heads/main":
        return jsonify(ok=True, skipped="no es main"), 200
    ok = _deploy(repo)
    return jsonify(ok=ok), (200 if ok else 500)


@app.post("/webhook")
def webhook():
    """Endpoint legacy — usar /hooks/<repo> para nuevos webhooks."""
    payload = request.get_data()
    if not _verify_hmac(payload, request.headers.get("X-Hub-Signature-256", "")):
        abort(403)
    if request.headers.get("X-GitHub-Event") == "ping":
        return jsonify(ok=True, msg="pong"), 200
    data = request.get_json(force=True, silent=True) or {}
    repo = (data.get("repository") or {}).get("name", "")
    ref  = data.get("ref", "")
    if repo not in REPO_MAP:
        return jsonify(ok=True, skipped="repo desconocido")
    if ref != "refs/heads/main":
        return jsonify(ok=True, skipped="no es main")
    ok = _deploy(repo)
    return jsonify(ok=ok), (200 if ok else 500)


@app.post("/redeploy/<repo>")
def redeploy(repo: str):
    if repo not in REPO_MAP:
        abort(404)
    return jsonify(ok=_deploy(repo))


@app.get("/status")
def status_api():
    with _lock:
        return jsonify(last=dict(_last), recent=list(reversed(_events[-50:])))


@app.get("/")
def index():
    with _lock:
        repos_data = [{"name": r, "script": REPO_MAP[r], **_last[r]} for r in REPO_MAP]
        recent     = list(reversed(_events[-50:]))
    return render_template_string(_HTML, repos=repos_data, recent=recent)


# ---------------------------------------------------------------------------
# Plantilla HTML
# ---------------------------------------------------------------------------

_HTML = r"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel de deploy · Haptica</title>
<style>
:root{--am:#f5c400;--ne:#1a1a1a;--gr:#4a4a4a;--bg:#f7f7f5}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--ne)}
header{background:var(--ne);color:var(--am);padding:1rem 1.5rem;display:flex;align-items:center;gap:1rem}
header h1{font-size:1.1rem;font-weight:700}
header small{display:block;color:#aaa;font-size:.8rem;font-weight:400}
main{max-width:900px;margin:2rem auto;padding:0 1rem}
h2{font-size:.85rem;text-transform:uppercase;letter-spacing:.05em;color:var(--gr);margin-bottom:1rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem;margin-bottom:2.5rem}
.card{background:#fff;border-radius:8px;padding:1.25rem;border:1px solid #e0e0e0;display:flex;flex-direction:column;gap:.75rem}
.card-hd{display:flex;align-items:center;justify-content:space-between}
.card h3{font-size:.95rem;font-weight:700;font-family:monospace}
.badge{font-size:.7rem;padding:.2rem .5rem;border-radius:4px;font-weight:600;text-transform:uppercase}
.ok{background:#d4edda;color:#155724}
.error{background:#f8d7da;color:#721c24}
.start{background:#fff3cd;color:#856404}
.unknown{background:#e2e3e5;color:#383d41}
.script{font-size:.7rem;color:var(--gr);font-family:monospace;word-break:break-all}
.ts{font-size:.7rem;color:#888}
.msg{font-size:.72rem;color:var(--gr);background:#f4f4f4;border-radius:4px;padding:.4rem .6rem;font-family:monospace;white-space:pre-wrap;max-height:4rem;overflow:auto}
button{margin-top:auto;background:var(--am);color:var(--ne);border:none;border-radius:6px;padding:.55rem 1rem;font-weight:700;font-size:.85rem;cursor:pointer;transition:opacity .15s}
button:hover{opacity:.85}
button:disabled{opacity:.5;cursor:not-allowed}
table{width:100%;border-collapse:collapse;font-size:.78rem}
th{text-align:left;padding:.4rem .6rem;background:#eee}
td{padding:.35rem .6rem;border-bottom:1px solid #eee;font-family:monospace}
tr:hover td{background:#fafafa}
</style>
</head>
<body>
<header>
  <div>
    <h1>Panel de deploy</h1>
    <small>Fundación Haptica · NAS</small>
  </div>
</header>
<main>
  <h2>Repositorios</h2>
  <div class="grid">
  {% for r in repos %}
  <div class="card" id="card-{{ r.name }}">
    <div class="card-hd">
      <h3>{{ r.name }}</h3>
      <span class="badge {{ 'unknown' if r.status == '—' else r.status.lower() }}" id="badge-{{ r.name }}">{{ r.status }}</span>
    </div>
    <div class="script">{{ r.script }}</div>
    <div class="ts" id="ts-{{ r.name }}">{{ r.ts or 'Sin despliegues' }}</div>
    <div class="msg" id="msg-{{ r.name }}">{{ r.msg or '' }}</div>
    <button onclick="deploy('{{ r.name }}')" id="btn-{{ r.name }}">▶ Redesplegar</button>
  </div>
  {% endfor %}
  </div>

  <h2>Actividad reciente</h2>
  <table>
    <thead><tr><th>Timestamp</th><th>Repo</th><th>Estado</th><th>Mensaje</th></tr></thead>
    <tbody id="log-body">
    {% for e in recent %}
    <tr>
      <td>{{ e.ts }}</td>
      <td>{{ e.repo }}</td>
      <td><span class="badge {{ e.status.lower() }}">{{ e.status }}</span></td>
      <td>{{ e.msg[:120] }}</td>
    </tr>
    {% endfor %}
    </tbody>
  </table>
</main>
<script>
async function deploy(repo) {
  if (!confirm('¿Redesplegar ' + repo + ' ahora?')) return;
  const btn   = document.getElementById('btn-'   + repo);
  const badge = document.getElementById('badge-' + repo);
  btn.disabled = true;
  btn.textContent = '⏳ Desplegando…';
  badge.className = 'badge start';
  badge.textContent = 'START';
  try {
    const res = await fetch('/redeploy/' + repo, {method: 'POST'});
    const d   = await res.json();
    badge.className  = 'badge ' + (d.ok ? 'ok' : 'error');
    badge.textContent = d.ok ? 'OK' : 'ERROR';
  } catch(e) {
    badge.className  = 'badge error';
    badge.textContent = 'ERROR';
  }
  btn.disabled = false;
  btn.textContent = '▶ Redesplegar';
  setTimeout(refreshLog, 500);
}

async function refreshLog() {
  try {
    const d = await (await fetch('/status')).json();
    for (const [repo, info] of Object.entries(d.last)) {
      if (info.status === '—') continue;
      const badge = document.getElementById('badge-' + repo);
      const ts    = document.getElementById('ts-'    + repo);
      const msg   = document.getElementById('msg-'   + repo);
      if (badge) { badge.className = 'badge ' + info.status.toLowerCase(); badge.textContent = info.status; }
      if (ts  && info.ts)  ts.textContent  = info.ts;
      if (msg && info.msg) msg.textContent = info.msg;
    }
    document.getElementById('log-body').innerHTML = d.recent.map(e =>
      `<tr><td>${e.ts}</td><td>${e.repo}</td>` +
      `<td><span class="badge ${e.status.toLowerCase()}">${e.status}</span></td>` +
      `<td>${(e.msg || '').substring(0, 120)}</td></tr>`
    ).join('');
  } catch(e) {}
}

setInterval(refreshLog, 10000);
</script>
</body>
</html>"""


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    app.run(host="0.0.0.0", port=8000)
