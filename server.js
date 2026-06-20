const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cambia-esta-clave';
const DATA_DIR = process.env.DATA_DIR || process.env.RENDER_DISK_PATH || __dirname;
const DB = path.join(DATA_DIR, 'licenses.json');
const LEGACY_DB = path.join(__dirname, 'licenses.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || 'panel_data';
const SUPABASE_BACKUP_TABLE = process.env.SUPABASE_BACKUP_TABLE || 'panel_backups';
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const ADMIN_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Panel Licencias</title><style>body{font-family:Arial;margin:0;background:#f5f7fb;color:#172033}.wrap{max-width:1200px;margin:auto;padding:24px}.card{background:white;border-radius:12px;padding:20px;margin:14px 0;box-shadow:0 10px 30px #0001}input,select,button,textarea{padding:10px;border-radius:8px;border:1px solid #ccd;margin:4px}textarea{min-height:76px;resize:vertical;width:calc(100% - 8px);font-family:Arial}.accountData{background:#eef6ff;border-color:#cfe2ff}button{background:#1e7f4f;color:white;border:0;cursor:pointer}button.danger{background:#b00020}button.secondary{background:#334155}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #eee;padding:8px;text-align:left;vertical-align:top}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px}.actions{display:flex;gap:6px;flex-wrap:wrap}.small{font-size:12px;color:#64748b}.credit{display:inline-block;background:#e8f5ee;color:#126238;border:1px solid #b7e1c9;border-radius:8px;padding:8px 10px;margin:0 0 10px}.hidden{display:none}</style></head><body><div class="wrap"><h1>Panel de Licencias</h1><div class="card"><h2>Acceso</h2><input id="user" placeholder="Usuario" value="admin"><input id="pass" type="password" placeholder="Contrasena"><button onclick="login()">Entrar</button><p class="small">Admin principal: usuario admin + tu ADMIN_PASSWORD de Render.</p></div><div id="app" class="hidden"><div class="card"><h2>Crear licencia</h2><p id="creditBox" class="credit hidden"></p><div class="grid"><input id="name" placeholder="Nombre cliente"><input id="phone" placeholder="Telefono"><input id="months" type="number" min="1" value="12" placeholder="Meses"><input id="devices" type="number" value="1" placeholder="Dispositivos"></div><textarea id="accountData" class="accountData" placeholder="Datos de cuenta: usuario, contrasena, enlace, PIN, perfiles..."></textarea><button onclick="createLicense()">Generar clave</button><p class="small">Subusuarios: 1 credito = 1 mes de licencia.</p><p id="created"></p></div><div id="usersCard" class="card hidden"><h2>Subusuarios</h2><div class="grid"><input id="newUser" placeholder="Usuario"><input id="newPass" placeholder="Contrasena"><input id="newCredits" type="number" min="0" value="0" placeholder="Creditos iniciales"><button onclick="createUser()">Crear subusuario</button></div><table><thead><tr><th>Usuario</th><th>Creditos</th><th>Cargar creditos</th><th>Accion</th></tr></thead><tbody id="userRows"></tbody></table></div><div class="card"><h2>Licencias</h2><table><thead><tr><th>Clave</th><th>Usuario</th><th>Cliente</th><th>Datos cuenta</th><th>Estado</th><th>Vence</th><th>Dispositivos</th><th>Acciones</th></tr></thead><tbody id="rows"></tbody></table></div></div></div><script>
let session=null;
const api=(url,opts={})=>fetch(url,{...opts,headers:{'Content-Type':'application/json','x-panel-user':user.value,'x-panel-password':pass.value,...(opts.headers||{})}}).then(r=>r.json());
function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dateInput(iso){if(!iso)return'';return new Date(iso).toISOString().slice(0,10)}
function updateCredits(credits){if(session)session.credits=credits;if(!session||session.isAdmin){creditBox.classList.add('hidden');months.removeAttribute('max');return}creditBox.classList.remove('hidden');creditBox.innerHTML='Creditos disponibles: <b>'+esc(credits||0)+'</b>';months.max=credits||0;if(Number(months.value)>Number(credits||0))months.value=credits||0}
async function refreshSession(){const r=await api('/api/panel/session');if(r.ok){session=r;updateCredits(r.credits)}}
async function login(){const r=await api('/api/panel/session');if(!r.ok){alert(r.message);return}session=r;app.classList.remove('hidden');usersCard.classList.remove('hidden');updateCredits(r.credits);load();loadUsers()}
async function load(){const r=await api('/api/admin/licenses');if(!r.ok){alert(r.message);return}rows.innerHTML=r.licenses.map(l=>'<tr><td><b>'+esc(l.key)+'</b><div class="small">'+esc(l.businessName||'')+'</div></td><td>'+esc(l.ownerUser||'')+'</td><td><input id="name-'+l.key+'" value="'+esc(l.customerName)+'"><br><input id="phone-'+l.key+'" value="'+esc(l.customerPhone)+'"></td><td><textarea id="accountData-'+l.key+'" class="accountData" placeholder="Usuario, contrasena, enlace, PIN...">'+esc(l.accountData||'')+'</textarea></td><td><select id="status-'+l.key+'"><option value="active" '+(l.status==='active'?'selected':'')+'>active</option><option value="blocked" '+(l.status==='blocked'?'selected':'')+'>blocked</option></select></td><td><input id="expires-'+l.key+'" type="date" value="'+dateInput(l.expiresAt)+'"></td><td><input id="devices-'+l.key+'" type="number" min="1" value="'+(l.maxDevices||1)+'" style="width:70px"><div class="small">Usados: '+((l.devices||[]).length)+'/'+(l.maxDevices||1)+'</div></td><td><div class="actions"><button onclick="saveLicense(\\''+l.key+'\\')">Guardar</button><button class="secondary" onclick="clearDevices(\\''+l.key+'\\')">Liberar dispositivos</button><button class="danger" onclick="deleteLicense(\\''+l.key+'\\')">Borrar</button></div></td></tr>').join('')}
async function createLicense(){const r=await api('/api/admin/licenses',{method:'POST',body:JSON.stringify({customerName:name.value,customerPhone:phone.value,accountData:accountData.value,months:months.value,maxDevices:devices.value})});if(!r.ok){alert(r.message);return}created.innerHTML='Clave creada: <b>'+esc(r.license.key)+'</b>';accountData.value='';if(r.creditsRemaining!==undefined)updateCredits(r.creditsRemaining);else refreshSession();load()}
async function saveLicense(key){const r=await api('/api/admin/update',{method:'POST',body:JSON.stringify({licenseKey:key,customerName:document.getElementById('name-'+key).value,customerPhone:document.getElementById('phone-'+key).value,accountData:document.getElementById('accountData-'+key).value,status:document.getElementById('status-'+key).value,expiresAt:document.getElementById('expires-'+key).value,maxDevices:document.getElementById('devices-'+key).value})});if(!r.ok)alert(r.message);load()}
async function clearDevices(key){if(!confirm('Liberar dispositivos usados?'))return;const r=await api('/api/admin/update',{method:'POST',body:JSON.stringify({licenseKey:key,clearDevices:true})});if(!r.ok)alert(r.message);load()}
async function deleteLicense(key){if(!confirm('Seguro que quieres borrar esta licencia?'))return;const r=await api('/api/admin/delete',{method:'POST',body:JSON.stringify({licenseKey:key})});if(!r.ok)alert(r.message);load()}
async function loadUsers(){const r=await api('/api/admin/users');if(!r.ok){alert(r.message);return}userRows.innerHTML=r.users.map(u=>'<tr><td>'+esc(u.username)+'</td><td><b>'+esc(u.credits)+'</b></td><td><input id="credits-'+u.username+'" type="number" min="1" value="1" style="width:80px"><button onclick="addCredits(\\''+u.username+'\\')">Cargar</button></td><td><button class="danger" onclick="deleteUser(\\''+u.username+'\\')">Borrar</button></td></tr>').join('')}
async function createUser(){const r=await api('/api/admin/users',{method:'POST',body:JSON.stringify({username:newUser.value,password:newPass.value,credits:newCredits.value})});if(!r.ok){alert(r.message);return}newUser.value='';newPass.value='';newCredits.value='0';if(r.creditsRemaining!==undefined)updateCredits(r.creditsRemaining);loadUsers()}
async function addCredits(username){const amount=document.getElementById('credits-'+username).value;const r=await api('/api/admin/users/credits',{method:'POST',body:JSON.stringify({username,addCredits:amount})});if(!r.ok){alert(r.message);return}if(r.creditsRemaining!==undefined)updateCredits(r.creditsRemaining);loadUsers()}
async function deleteUser(username){if(!confirm('Borrar subusuario? Tambien se borraran sus subusuarios y licencias asociadas.'))return;const r=await api('/api/admin/users/delete',{method:'POST',body:JSON.stringify({username})});if(!r.ok)alert(r.message);loadUsers();load()}
</script></body></html>`;

app.use(cors());
app.use(express.json());
app.get('/', (req, res) => res.type('html').send(ADMIN_HTML));
app.use(express.static(path.join(__dirname, 'public')));

function defaultDb(){ return { users: [], licenses: [] }; }
function ensureDataDir(){
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if(!fs.existsSync(DB) && DB !== LEGACY_DB && fs.existsSync(LEGACY_DB)) {
    fs.copyFileSync(LEGACY_DB, DB);
  }
}
function normalizeDb(db){
  if(!db || typeof db !== 'object') db = defaultDb();
  if(!Array.isArray(db.users)) db.users = [];
  if(!Array.isArray(db.licenses)) db.licenses = [];
  for(const u of db.users) {
    u.credits = Math.max(0, Number(u.credits || 0));
    if(!u.parentUser) u.parentUser = 'admin';
  }
  for(const l of db.licenses) if(!l.ownerUser) l.ownerUser = 'admin';
  return db;
}
function findActiveDeviceLicense(db, licenseKey, deviceId){
  const l = db.licenses.find(x=>x.key===licenseKey);
  if(!l) return { error: { status: 404, message: 'Licencia no existe' } };
  if(l.status !== 'active') return { error: { status: 403, message: 'Licencia bloqueada' } };
  if(new Date(l.expiresAt) < new Date()) return { error: { status: 403, message: 'Licencia vencida' } };
  if(!Array.isArray(l.devices) || !l.devices.includes(deviceId)) return { error: { status: 403, message: 'Dispositivo no activado' } };
  return { license: l };
}
async function supabaseRequest(pathname, options = {}){
  const response = await fetch(SUPABASE_URL + pathname, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if(!response.ok) {
    const message = data && data.message ? data.message : text || response.statusText;
    throw new Error('Supabase: ' + message);
  }
  return data;
}
async function loadFromSupabase(){
  const rows = await supabaseRequest('/rest/v1/' + SUPABASE_TABLE + '?id=eq.main&select=data');
  if(!rows.length) return defaultDb();
  return normalizeDb(rows[0].data);
}
async function saveToSupabase(db){
  try {
    const previous = await loadFromSupabase();
    await supabaseRequest('/rest/v1/' + SUPABASE_BACKUP_TABLE, {
      method: 'POST',
      body: JSON.stringify({
        data: previous,
        created_at: new Date().toISOString()
      })
    });
  } catch (err) {
    console.error('No se pudo crear backup. El guardado principal continua.', err);
  }
  await supabaseRequest('/rest/v1/' + SUPABASE_TABLE + '?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'main', data: normalizeDb(db), updated_at: new Date().toISOString() })
  });
}
async function load(){
  if(USE_SUPABASE) return loadFromSupabase();
  ensureDataDir();
  if(!fs.existsSync(DB)) return defaultDb();
  try {
    return normalizeDb(JSON.parse(fs.readFileSync(DB,'utf8')));
  } catch (err) {
    const badPath = path.join(BACKUP_DIR, 'licenses-corrupt-' + Date.now() + '.json');
    fs.copyFileSync(DB, badPath);
    console.error('No se pudo leer licenses.json. Copia corrupta guardada en ' + badPath, err);
    return defaultDb();
  }
}
async function save(db){
  if(USE_SUPABASE) return saveToSupabase(db);
  ensureDataDir();
  db = normalizeDb(db);
  if(fs.existsSync(DB)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(DB, path.join(BACKUP_DIR, 'licenses-' + stamp + '.json'));
  }
  const tmp = DB + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db,null,2));
  fs.renameSync(tmp, DB);
}
function newKey(){ return 'CP-' + crypto.randomBytes(3).toString('hex').toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase(); }
function cleanUser(username){ return String(username || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g,''); }
async function auth(req,res,next){
  const username = cleanUser(req.headers['x-panel-user'] || 'admin');
  const password = String(req.headers['x-panel-password'] || req.headers['x-admin-password'] || '');
  if(username === 'admin' && password === ADMIN_PASSWORD) { req.panelUser = 'admin'; req.isAdmin = true; return next(); }
  try {
    const db = await load();
    const user = db.users.find(u => u.username === username && u.password === password);
    if(!user) return res.status(401).json({ok:false,message:'Usuario o contrasena incorrectos'});
    req.panelUser = username; req.isAdmin = false; req.panelCredits = user.credits || 0; next();
  } catch (err) {
    next(err);
  }
}
function visibleLicenses(db, req){ return req.isAdmin ? db.licenses : db.licenses.filter(l => l.ownerUser === req.panelUser); }
function findLicense(db, req, key){ return visibleLicenses(db, req).find(x => x.key === key); }
function visibleUsers(db, req){ return req.isAdmin ? db.users : db.users.filter(u => u.parentUser === req.panelUser); }
function findManagedUser(db, req, username){ return visibleUsers(db, req).find(u => u.username === username); }
function collectUserTree(db, username){
  const names = new Set([username]);
  let changed = true;
  while(changed) {
    changed = false;
    for(const u of db.users) {
      if(!names.has(u.username) && names.has(u.parentUser)) {
        names.add(u.username);
        changed = true;
      }
    }
  }
  return names;
}
function asyncRoute(fn){
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

app.get('/api/panel/session', auth, asyncRoute(async (req,res)=>{
  let credits = null;
  if(!req.isAdmin) {
    const db = await load();
    const user = db.users.find(u=>u.username===req.panelUser);
    credits = user ? user.credits || 0 : 0;
  }
  res.json({ok:true, user:req.panelUser, isAdmin:req.isAdmin, credits});
}));
app.get('/api/admin/users', auth, asyncRoute(async (req,res)=>{
  const db = await load();
  res.json({ok:true, users: visibleUsers(db, req).map(u=>({username:u.username, credits:u.credits || 0, parentUser:u.parentUser || 'admin'}))});
}));
app.post('/api/admin/users', auth, asyncRoute(async (req,res)=>{
  const username = cleanUser(req.body.username);
  const password = String(req.body.password || '').trim();
  const credits = Math.max(0, Math.floor(Number(req.body.credits || 0)));
  if(!username || !password) return res.status(400).json({ok:false,message:'Faltan usuario o contrasena'});
  if(username === 'admin') return res.status(400).json({ok:false,message:'Ese usuario esta reservado'});
  const db = await load();
  if(db.users.some(u=>u.username===username)) return res.status(409).json({ok:false,message:'El usuario ya existe'});
  let creditsRemaining = null;
  if(!req.isAdmin) {
    const parent = db.users.find(u=>u.username===req.panelUser);
    if(!parent) return res.status(404).json({ok:false,message:'Subusuario no encontrado'});
    parent.credits = Math.max(0, Number(parent.credits || 0));
    if(credits <= 0) return res.status(400).json({ok:false,message:'Para crear un subusuario debes cargarle creditos'});
    if(parent.credits < credits) return res.status(403).json({ok:false,message:'Creditos insuficientes para cargarle '+credits+' credito(s).'});
    parent.credits -= credits;
    creditsRemaining = parent.credits;
  }
  db.users.push({username,password,credits,parentUser:req.panelUser,createdAt:new Date().toISOString()});
  await save(db); res.json({ok:true, creditsRemaining});
}));
app.post('/api/admin/users/credits', auth, asyncRoute(async (req,res)=>{
  const username = cleanUser(req.body.username);
  const addCredits = Math.floor(Number(req.body.addCredits || 0));
  if(!username || addCredits <= 0) return res.status(400).json({ok:false,message:'Indica creditos mayores que 0'});
  const db = await load();
  const user = findManagedUser(db, req, username);
  if(!user) return res.status(404).json({ok:false,message:'Subusuario no encontrado'});
  let creditsRemaining = null;
  if(!req.isAdmin) {
    const parent = db.users.find(u=>u.username===req.panelUser);
    if(!parent) return res.status(404).json({ok:false,message:'Subusuario no encontrado'});
    parent.credits = Math.max(0, Number(parent.credits || 0));
    if(parent.credits < addCredits) return res.status(403).json({ok:false,message:'Creditos insuficientes para cargar '+addCredits+' credito(s).'});
    parent.credits -= addCredits;
    creditsRemaining = parent.credits;
  }
  user.credits = Math.max(0, Number(user.credits || 0)) + addCredits;
  await save(db); res.json({ok:true, credits:user.credits, creditsRemaining});
}));
app.post('/api/admin/users/delete', auth, asyncRoute(async (req,res)=>{
  const username = cleanUser(req.body.username);
  if(username === 'admin') return res.status(400).json({ok:false,message:'No se puede borrar admin'});
  const db = await load();
  if(!findManagedUser(db, req, username)) return res.status(404).json({ok:false,message:'Subusuario no encontrado'});
  const usersToDelete = collectUserTree(db, username);
  db.users = db.users.filter(u=>!usersToDelete.has(u.username));
  db.licenses = db.licenses.filter(l=>!usersToDelete.has(l.ownerUser));
  await save(db); res.json({ok:true});
}));

app.get('/api/admin/licenses', auth, asyncRoute(async (req,res)=> res.json({ok:true, licenses: visibleLicenses(await load(), req)})));
app.post('/api/admin/licenses', auth, asyncRoute(async (req,res)=>{
  const db = await load();
  const months = Math.max(1, Math.floor(Number(req.body.months || 12)));
  let creditsRemaining = null;
  if(!req.isAdmin) {
    const user = db.users.find(u=>u.username===req.panelUser);
    if(!user) return res.status(404).json({ok:false,message:'Subusuario no encontrado'});
    user.credits = Math.max(0, Number(user.credits || 0));
    if(user.credits < months) return res.status(403).json({ok:false,message:'Creditos insuficientes. Necesitas '+months+' credito(s).'});
    user.credits -= months;
    creditsRemaining = user.credits;
  }
  const license = {
    key: newKey(),
    ownerUser: req.panelUser,
    customerName: req.body.customerName || '',
    customerPhone: req.body.customerPhone || '',
    accountData: req.body.accountData || '',
    status: 'active',
    maxDevices: Number(req.body.maxDevices || 1),
    devices: [],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now()+months*30*24*60*60*1000).toISOString()
  };
  db.licenses.push(license); await save(db); res.json({ok:true, license, creditsRemaining});
}));
app.post('/api/admin/update', auth, asyncRoute(async (req,res)=>{
  const db = await load(); const l = findLicense(db, req, req.body.licenseKey);
  if(!l) return res.status(404).json({ok:false,message:'No encontrada'});
  if(req.body.customerName !== undefined) l.customerName = req.body.customerName;
  if(req.body.customerPhone !== undefined) l.customerPhone = req.body.customerPhone;
  if(req.body.accountData !== undefined) l.accountData = req.body.accountData;
  if(req.body.status === 'active' || req.body.status === 'blocked') l.status = req.body.status;
  if(req.body.maxDevices !== undefined) l.maxDevices = Math.max(1, Number(req.body.maxDevices || 1));
  if(req.body.expiresAt) l.expiresAt = new Date(req.body.expiresAt).toISOString();
  if(req.body.clearDevices) l.devices = [];
  await save(db); res.json({ok:true, license:l});
}));
app.post('/api/admin/delete', auth, asyncRoute(async (req,res)=>{
  const db = await load(); const before = db.licenses.length;
  db.licenses = db.licenses.filter(x => !(x.key === req.body.licenseKey && (req.isAdmin || x.ownerUser === req.panelUser)));
  if(db.licenses.length === before) return res.status(404).json({ok:false,message:'No encontrada'});
  await save(db); res.json({ok:true});
}));

app.post('/api/activate', asyncRoute(async (req,res)=>{
  const {licenseKey, deviceId, businessName} = req.body;
  const db = await load(); const l = db.licenses.find(x=>x.key===licenseKey);
  if(!l) return res.status(404).json({ok:false,message:'Licencia no existe'});
  if(l.status !== 'active') return res.status(403).json({ok:false,message:'Licencia bloqueada'});
  if(new Date(l.expiresAt) < new Date()) return res.status(403).json({ok:false,message:'Licencia vencida'});
  if(!l.devices.includes(deviceId)) {
    if(l.devices.length >= l.maxDevices) {
      if(Number(l.maxDevices || 1) === 1) l.devices = [deviceId];
      else return res.status(403).json({ok:false,message:'Licencia ya usada en otro dispositivo'});
    } else {
      l.devices.push(deviceId);
    }
  }
  l.businessName = businessName || l.businessName || '';
  l.lastActivationAt = new Date().toISOString();
  await save(db);
  res.json({ok:true, expiresAt:l.expiresAt, message:'Activada'});
}));
app.post('/api/check', asyncRoute(async (req,res)=>{
  const {licenseKey, deviceId} = req.body;
  const found = findActiveDeviceLicense(await load(), licenseKey, deviceId);
  if(found.error) return res.status(found.error.status).json({ok:false,message:found.error.message});
  const l = found.license;
  res.json({ok:true, expiresAt:l.expiresAt});
}));
app.post('/api/app/clients/load', asyncRoute(async (req,res)=>{
  const {licenseKey, deviceId} = req.body;
  const found = findActiveDeviceLicense(await load(), licenseKey, deviceId);
  if(found.error) return res.status(found.error.status).json({ok:false,message:found.error.message});
  res.json({ok:true, clients:Array.isArray(found.license.appClients) ? found.license.appClients : []});
}));
app.post('/api/app/clients/save', asyncRoute(async (req,res)=>{
  const {licenseKey, deviceId} = req.body;
  const clients = Array.isArray(req.body.clients) ? req.body.clients : [];
  const db = await load();
  const found = findActiveDeviceLicense(db, licenseKey, deviceId);
  if(found.error) return res.status(found.error.status).json({ok:false,message:found.error.message});
  found.license.appClients = clients;
  found.license.appClientsUpdatedAt = new Date().toISOString();
  await save(db);
  res.json({ok:true, saved:clients.length});
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok:false, message: err.message || 'Error interno del servidor' });
});

app.listen(PORT, ()=> console.log('Panel licencias multiusuario activo en puerto '+PORT+' usando datos en '+(USE_SUPABASE ? 'Supabase' : DB)));
