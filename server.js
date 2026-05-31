const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cambia-esta-clave';
const DB = path.join(__dirname, 'licenses.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function load(){ if(!fs.existsSync(DB)) return {licenses:[]}; return JSON.parse(fs.readFileSync(DB,'utf8')); }
function save(db){ fs.writeFileSync(DB, JSON.stringify(db,null,2)); }
function newKey(){ return 'CP-' + crypto.randomBytes(3).toString('hex').toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase(); }
function auth(req,res,next){ if(req.headers['x-admin-password'] !== ADMIN_PASSWORD) return res.status(401).json({ok:false,message:'Contraseña admin incorrecta'}); next(); }

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
