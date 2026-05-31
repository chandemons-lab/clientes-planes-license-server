const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cambia-esta-clave';
const DB = path.join(__dirname, 'licenses.json');

const ADMIN_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Panel</title><style>body{font-family:Arial;margin:0;background:#f5f7fb;color:#172033}.wrap{max-width:1180px;margin:auto;padding:24px}.card{background:white;border-radius:12px;padding:20px;margin:14px 0;box-shadow:0 10px 30px #0001}input,select,button{padding:10px;border-radius:8px;border:1px solid #ccd;margin:4px}button{background:#1e7f4f;color:white;border:0;cursor:pointer}button.danger{background:#b00020}button.secondary{background:#334155}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #eee;padding:8px;text-align:left;vertical-align:top}.blocked{color:#b00020;font-weight:bold}.actions{display:flex;gap:6px;flex-wrap:wrap}</style></head><body><div class="wrap"><h1>Panel de Activacion</h1><div class="card"><h2>Acceso admin</h2><input id="pass" type="password" placeholder="Contrasena admin"><button onclick="load()">Entrar</button></div><div class="card"><h2>Crear licencia</h2><input id="name" placeholder="Nombre cliente"><input id="phone" placeholder="Telefono"><input id="months" type="number" value="12"><input id="devices" type="number" value="1"><button onclick="createLicense()">Generar clave</button><p id="created"></p></div><div class="card"><h2>Licencias</h2><table><thead><tr><th>Clave</th><th>Cliente</th><th>Estado</th><th>Vence</th><th>Dispositivos</th><th>Acciones</th></tr></thead><tbody id="rows"></tbody></table></div></div><script>
const pass=document.getElementById('pass'),rows=document.getElementById('rows'),created=document.getElementById('created');
const api=(url,opts={})=>fetch(url,{...opts,headers:{'Content-Type':'application/json','x-admin-password':pass.value,...(opts.headers||{})}}).then(r=>r.json());
function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dateInput(iso){if(!iso)return'';return new Date(iso).toISOString().slice(0,10)}
async function load(){const r=await api('/api/admin/licenses');if(!r.ok){alert(r.message);return}rows.innerHTML=r.licenses.map(l=>'<tr><td><b>'+esc(l.key)+'</b><br><small>'+esc(l.businessName||'')+'</small></td><td><input id="name-'+l.key+'" value="'+esc(l.customerName)+'" placeholder="Cliente"><br><input id="phone-'+l.key+'" value="'+esc(l.customerPhone)+'" placeholder="Telefono"></td><td><select id="status-'+l.key+'"><option value="active" '+(l.status==='active'?'selected':'')+'>active</option><option value="blocked" '+(l.status==='blocked'?'selected':'')+'>blocked</option></select></td><td><input id="expires-'+l.key+'" type="date" value="'+dateInput(l.expiresAt)+'"></td><td><input id="devices-'+l.key+'" type="number" min="1" value="'+(l.maxDevices||1)+'" style="width:70px"><br><small>Usados: '+((l.devices||[]).length)+'/'+(l.maxDevices||1)+'</small></td><td><div class="actions"><button onclick="saveLicense(\\''+l.key+'\\')">Guardar</button><button class="secondary" onclick="clearDevices(\\''+l.key+'\\')">Liberar dispositivos</button><button class="danger" onclick="deleteLicense(\\''+l.key+'\\')">Borrar</button></div></td></tr>').join('')}
async function createLicense(){const r=await api('/api/admin/licenses',{method:'POST',body:JSON.stringify({customerName:name.value,customerPhone:phone.value,months:months.value,maxDevices:devices.value})});if(!r.ok){alert(r.message);return}created.innerHTML='Clave creada: <b>'+esc(r.license.key)+'</b>';load()}
async function saveLicense(key){const r=await api('/api/admin/update',{method:'POST',body:JSON.stringify({licenseKey:key,customerName:document.getElementById('name-'+key).value,customerPhone:document.getElementById('phone-'+key).value,status:document.getElementById('status-'+key).value,expiresAt:document.getElementById('expires-'+key).value,maxDevices:document.getElementById('devices-'+key).value})});if(!r.ok)alert(r.message);load()}
async function clearDevices(key){if(!confirm('Liberar dispositivos usados?'))return;const r=await api('/api/admin/update',{method:'POST',body:JSON.stringify({licenseKey:key,clearDevices:true})});if(!r.ok)alert(r.message);load()}
async function deleteLicense(key){if(!confirm('Seguro que quieres borrar esta licencia?'))return;const r=await api('/api/admin/delete',{method:'POST',body:JSON.stringify({licenseKey:key})});if(!r.ok)alert(r.message);load()}
</script></body></html>`;

app.use(cors());
app.use(express.json());
app.get('/', (req,res)=> res.type('html').send(ADMIN_HTML));
app.use(express.static(path.join(__dirname, 'public')));

function load(){ if(!fs.existsSync(DB)) return {licenses:[]}; return JSON.parse(fs.readFileSync(DB,'utf8')); }
function save(db){ fs.writeFileSync(DB, JSON.stringify(db,null,2)); }
function newKey(){ return 'CP-' + crypto.randomBytes(3).toString('hex').toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase(); }
function auth(req,res,next){ if(req.headers['x-admin-password'] !== ADMIN_PASSWORD) return res.status(401).json({ok:false,message:'Contrasena admin incorrecta'}); next(); }

app.get('/api/admin/licenses', auth, (req,res)=> res.json({ok:true, licenses: load().licenses}));

app.post('/api/admin/licenses', auth, (req,res)=>{
  const db = load();
  const months = Number(req.body.months || 12);
  const license = {
    key: newKey(),
    customerName: req.body.customerName || '',
    customerPhone: req.body.customerPhone || '',
    status: 'active',
    maxDevices: Number(req.body.maxDevices || 1),
    devices: [],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now()+months*30*24*60*60*1000).toISOString()
  };
  db.licenses.push(license); save(db); res.json({ok:true, license});
});

app.post('/api/admin/update', auth, (req,res)=>{
  const db = load(); const l = db.licenses.find(x=>x.key===req.body.licenseKey);
  if(!l) return res.status(404).json({ok:false,message:'No encontrada'});
  if(req.body.customerName !== undefined) l.customerName = req.body.customerName;
  if(req.body.customerPhone !== undefined) l.customerPhone = req.body.customerPhone;
  if(req.body.status === 'active' || req.body.status === 'blocked') l.status = req.body.status;
  if(req.body.maxDevices !== undefined) l.maxDevices = Math.max(1, Number(req.body.maxDevices || 1));
  if(req.body.expiresAt) l.expiresAt = new Date(req.body.expiresAt).toISOString();
  if(req.body.clearDevices) l.devices = [];
  save(db); res.json({ok:true, license:l});
});

app.post('/api/admin/delete', auth, (req,res)=>{
  const db = load(); const before = db.licenses.length;
  db.licenses = db.licenses.filter(x=>x.key!==req.body.licenseKey);
  if(db.licenses.length === before) return res.status(404).json({ok:false,message:'No encontrada'});
  save(db); res.json({ok:true});
});

app.post('/api/admin/block', auth, (req,res)=>{
  const db = load(); const l = db.licenses.find(x=>x.key===req.body.licenseKey);
  if(!l) return res.status(404).json({ok:false,message:'No encontrada'});
  l.status = 'blocked'; save(db); res.json({ok:true});
});

app.post('/api/admin/unblock', auth, (req,res)=>{
  const db = load(); const l = db.licenses.find(x=>x.key===req.body.licenseKey);
  if(!l) return res.status(404).json({ok:false,message:'No encontrada'});
  l.status = 'active'; save(db); res.json({ok:true});
});

app.post('/api/activate', (req,res)=>{
  const {licenseKey, deviceId, businessName} = req.body;
  const db = load(); const l = db.licenses.find(x=>x.key===licenseKey);
  if(!l) return res.status(404).json({ok:false,message:'Licencia no existe'});
  if(l.status !== 'active') return res.status(403).json({ok:false,message:'Licencia bloqueada'});
  if(new Date(l.expiresAt) < new Date()) return res.status(403).json({ok:false,message:'Licencia vencida'});
  if(!l.devices.includes(deviceId)) {
    if(l.devices.length >= l.maxDevices) return res.status(403).json({ok:false,message:'Licencia ya usada en otro dispositivo'});
    l.devices.push(deviceId);
  }
  l.businessName = businessName || l.businessName || '';
  l.lastActivationAt = new Date().toISOString();
  save(db);
  res.json({ok:true, expiresAt:l.expiresAt, message:'Activada'});
});

app.post('/api/check', (req,res)=>{
  const {licenseKey, deviceId} = req.body;
  const l = load().licenses.find(x=>x.key===licenseKey);
  if(!l) return res.status(404).json({ok:false,message:'Licencia no existe'});
  if(l.status !== 'active') return res.status(403).json({ok:false,message:'Licencia bloqueada'});
  if(new Date(l.expiresAt) < new Date()) return res.status(403).json({ok:false,message:'Licencia vencida'});
  if(!l.devices.includes(deviceId)) return res.status(403).json({ok:false,message:'Dispositivo no activado'});
  res.json({ok:true, expiresAt:l.expiresAt});
});

app.listen(PORT, ()=> console.log('Panel licencias activo en puerto '+PORT));
