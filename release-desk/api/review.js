// The in-Slack review page: before/after screenshots, the change summary, and the decision buttons.
// Opened inside Slack's Work Object side panel via a short-lived signed link (see slack-events.js).
import { verify } from '../lib/review.js';
import { gh } from '../lib/github.js';
import { isApprover } from '../lib/slack.js';

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': 'frame-ancestors https://*.slack.com https://*.slack-gov.com https://*.slack-mcps.com',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = (s = '') => esc(s.replace(/\[(.+?)\]\((.+?)\)/g, '$1')).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>');

function section(body = '', heading) {
  // drop HTML comments and the PR attribution footer (it is for GitHub, not for the approver)
  const clean = body.replace(/<!--[\s\S]*?-->/g, '').replace(/^.*Generated with \[?Claude Code.*$/gim, '');
  const m = clean.match(new RegExp(`##\\s*${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|\\n---|$)`, 'i'));
  return m ? m[1].trim() : '';
}


const KINDS = { lightningExperienceThemes: 'Lightning theme', brandingSets: 'Branding set', contentassets: 'Image asset', permissionsets: 'Permission set',
  flexipages: 'Lightning page', layouts: 'Page layout', flows: 'Flow', classes: 'Apex class', triggers: 'Apex trigger', lwc: 'Lightning component', applications: 'App', tabs: 'Tab' };
function component(path) {
  const m = path.match(/force-app\/main\/default\/([^/]+)\/(.+)$/);
  if (!m) return null;
  const parts = m[2].split('/');
  if (m[1] === 'objects') return parts.length > 2 ? `${parts[1].replace(/s$/, '').replace(/^./, (c) => c.toUpperCase())} · ${parts[0]}.${parts[2].split('.')[0]}` : `Object · ${parts[0]}`;
  if (m[1] === 'lwc' || m[1] === 'aura') return `Lightning component · ${parts[0]}`;
  return `${KINDS[m[1]] || m[1]} · ${parts.at(-1).replace(/-meta\.xml$/, '').replace(/\.[^.]+$/, '').replace(/\.[^.]+$/, '')}`;
}

const page = (title, inner) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{--bg:#fff;--fg:#1d1c1d;--muted:#616061;--line:#e8e8e8;--card:#f8f8f8;--ok:#007a5a;--ok-fg:#fff;--warn:#b35900;--bad:#c4291c;--accent:#1264a3}
@media (prefers-color-scheme:dark){:root{--bg:#1a1d21;--fg:#d1d2d3;--muted:#9a9b9e;--line:#35373b;--card:#222529;--accent:#1d9bd1}}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:1100px;margin:0 auto;padding:20px 16px 120px}
h1{font-size:20px;margin:0 0 4px}.sub{color:var(--muted);font-size:13px;margin:0 0 18px}
.tabs{display:flex;gap:6px;margin:0 0 10px}.tabs button{border:1px solid var(--line);background:var(--card);color:var(--fg);padding:6px 12px;border-radius:6px;font:inherit;font-size:13px;cursor:pointer}
.tabs button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.compare{position:relative;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--card);user-select:none}
.compare img{display:block;width:100%;height:auto}.compare .top{position:absolute;inset:0;clip-path:inset(0 calc(100% - var(--x,50%)) 0 0)}
.compare .bar{position:absolute;top:0;bottom:0;left:var(--x,50%);width:3px;margin-left:-1px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.35);pointer-events:none}
.compare .lbl{position:absolute;top:10px;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:600;background:rgba(0,0,0,.65);color:#fff}
.compare .l{left:10px}.compare .r{right:10px}
.compare input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:ew-resize;margin:0}
.side{display:grid;grid-template-columns:1fr 1fr;gap:10px}.side figure{margin:0}.side img{width:100%;border:1px solid var(--line);border-radius:8px;display:block}
.side figcaption{font-size:12px;color:var(--muted);margin-top:4px}
@media (max-width:700px){.side{grid-template-columns:1fr}}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:18px 0}
.box{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.box h2{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:0 0 6px}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--line)}
code{font-size:12px;background:var(--card);padding:1px 4px;border-radius:4px}
.decide{position:fixed;left:0;right:0;bottom:0;background:var(--bg);border-top:1px solid var(--line);padding:12px 16px}
.decide .in{max-width:1100px;margin:0 auto;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.decide textarea{flex:1 1 100%;min-height:64px;font:inherit;padding:8px;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--fg);display:none}
.decide textarea.show{display:block}
.btn{border:1px solid var(--line);background:var(--card);color:var(--fg);padding:9px 16px;border-radius:6px;font:inherit;font-weight:600;cursor:pointer}
.btn.ok{background:var(--ok);border-color:var(--ok);color:var(--ok-fg)}.btn.bad{color:var(--bad)}.btn.arm{outline:3px solid var(--warn)}
.btn:disabled{opacity:.5;cursor:default}.msg{flex:1 1 auto;font-size:14px;color:var(--muted)}.msg.ok{color:var(--ok)}.msg.err{color:var(--bad)}
.banner{padding:10px 12px;border-radius:8px;background:var(--card);border:1px solid var(--line);margin:0 0 14px}
</style></head><body><main>${inner}</main></body></html>`;

export async function GET(request) {
  const url = new URL(request.url);
  const t = url.searchParams.get('t');
  const data = verify(t);
  if (!data) return new Response(page('Link expired', `<h1>This review link has expired</h1><p class="sub">Close this panel and open the Release Desk card again for a fresh link.</p>`), { status: 401, headers: HEADERS });

  const pr = await gh(`/pulls/${data.pr}`);
  const files = await gh(`/pulls/${data.pr}/files?per_page=100`);
  const comps = [...new Set(files.map((f) => component(f.filename)).filter(Boolean))];
  const open = pr.state === 'open';
  const fresh = pr.head.sha === data.sha;
  const canAct = open && fresh && isApprover(data.user);
  const img = (n) => `/api/asset?t=${encodeURIComponent(t)}&n=${n}`;
  const risk = (section(pr.body, 'Risk').match(/- \[x\] .+/gi) || []).map((l) => l.replace(/- \[x\] /i, ''));

  const status = !open
    ? `<div class="banner">This change is already <strong>${pr.merged ? 'merged' : 'closed'}</strong>. Nothing to decide here.</div>`
    : !fresh ? `<div class="banner">New commits landed after this link was created. Close and reopen the panel to review the latest version.</div>` : '';

  const inner = `
<h1>#${pr.number} · ${esc(pr.title)}</h1>
<p class="sub">Built by ${esc(pr.user.login)} · commit <code>${pr.head.sha.slice(0, 7)}</code> · <a href="${esc(pr.html_url)}" target="_blank" rel="noopener" style="color:var(--accent)">View on GitHub</a></p>
${status}
<div class="tabs" role="group" aria-label="Comparison view">
  <button type="button" data-v="slider" aria-pressed="true">Slider</button>
  <button type="button" data-v="side" aria-pressed="false">Side by side</button>
</div>
<div id="slider" class="compare" style="--x:50%">
  <img src="${img('after')}" alt="After: 21B Dev 2 (sandbox)">
  <img class="top" src="${img('before')}" alt="Before: 21B Dev 1 (production)">
  <div class="bar"></div><span class="lbl l">Before · production</span><span class="lbl r">After · sandbox</span>
  <input type="range" min="0" max="100" value="50" aria-label="Drag to compare before and after">
</div>
<div id="side" class="side" hidden>
  <figure><img src="${img('before')}" alt="Before"><figcaption>Before — 21B Dev 1 (production, today)</figcaption></figure>
  <figure><img src="${img('after')}" alt="After"><figcaption>After — 21B Dev 2 (sandbox, with this change)</figcaption></figure>
</div>
<div class="grid">
  <div class="box"><h2>What changed</h2>${md(section(pr.body, 'What changed') || 'No description.')}</div>
  ${section(pr.body, 'Who it affects') ? `<div class="box"><h2>Who it affects</h2>${md(section(pr.body, 'Who it affects'))}</div>` : ''}
  ${risk.length ? `<div class="box"><h2>Risk</h2>${risk.map(md).join('<br>')}</div>` : ''}
  ${section(pr.body, 'Rollback') ? `<div class="box"><h2>Rollback</h2>${md(section(pr.body, 'Rollback'))}</div>` : ''}
</div>
${comps.length ? `<div class="box"><h2>${comps.length} component${comps.length > 1 ? 's' : ''}</h2><div class="chips">${comps.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div></div>` : ''}
${canAct ? `
<div class="decide"><div class="in">
  <textarea id="note" placeholder="What needs to change? (required to send back)"></textarea>
  <button class="btn ok" data-a="approve">Approve &amp; ship</button>
  <button class="btn" data-a="request_changes">Request changes</button>
  <button class="btn bad" data-a="reject">Reject</button>
  <span class="msg" id="msg" role="status"></span>
</div></div>` : open && fresh ? `<p class="sub" style="margin-top:16px">You can view this change. Only approvers can act on it.</p>` : ''}
<script>
const T=${JSON.stringify(t)};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.setAttribute('aria-pressed',x===b));document.getElementById('slider').hidden=b.dataset.v!=='slider';document.getElementById('side').hidden=b.dataset.v!=='side';});
const s=document.querySelector('#slider input');if(s)s.oninput=e=>document.getElementById('slider').style.setProperty('--x',e.target.value+'%');
const msg=document.getElementById('msg'),note=document.getElementById('note');let armed=null;
document.querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{
  const a=b.dataset.a;
  if(a!=='approve'&&!note.classList.contains('show')){note.classList.add('show');note.focus();msg.textContent=a==='reject'?'Add an optional reason, then click Reject again.':'Describe what needs to change, then click again.';msg.className='msg';armed=a;return;}
  if(a==='request_changes'&&!note.value.trim()){msg.textContent='Add a note so the builder knows what to change.';msg.className='msg err';return;}
  if(armed!==a+':confirm'&&a!=='request_changes'){armed=a+':confirm';document.querySelectorAll('[data-a]').forEach(x=>x.classList.remove('arm'));b.classList.add('arm');msg.textContent=a==='approve'?'Click Approve & ship again to merge and deploy to production.':'Click Reject again to close this change.';msg.className='msg';return;}
  document.querySelectorAll('[data-a]').forEach(x=>x.disabled=true);msg.textContent='Working…';msg.className='msg';
  try{const r=await fetch('/api/review-action',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({t:T,action:a,note:note.value})});const j=await r.json();
    msg.textContent=j.message;msg.className='msg '+(j.ok?'ok':'err');if(!j.ok)document.querySelectorAll('[data-a]').forEach(x=>x.disabled=false);}
  catch(e){msg.textContent='Could not reach Release Desk. Use the buttons on the Slack card instead.';msg.className='msg err';document.querySelectorAll('[data-a]').forEach(x=>x.disabled=false);}
});
</script>`;
  return new Response(page(`#${pr.number} ${pr.title}`, inner), { headers: HEADERS });
}
