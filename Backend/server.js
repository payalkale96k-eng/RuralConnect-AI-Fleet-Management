const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'rural-connect.json');

const EMPTY_DB = {
  users: [], schemes: [], complaints: [], announcements: [], alerts: [],
  agriculture: [], market: [], opportunities: [], notifications: [],
  vehicles: [], drivers: [], trips: [], maintenance: [], fuelRecords: [], bookings: []
};

function loadEnv() {
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv();
const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET || 'rural-connect-local-development-secret';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

function ensureDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(EMPTY_DB, null, 2));
}
function readDb() {
  ensureDb();
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    let changed = false;
    for (const key of Object.keys(EMPTY_DB)) {
      if (!Array.isArray(parsed[key])) { parsed[key] = []; changed = true; }
    }
    if (changed) fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2));
    return parsed;
  }
  catch { fs.writeFileSync(DB_FILE, JSON.stringify(EMPTY_DB, null, 2)); return { ...EMPTY_DB }; }
}
function writeDb(db) {
  ensureDb();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function findById(list, value) { return list.find(x => String(x._id) === String(value)); }
function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...safe } = u;
  return safe;
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return `pbkdf2$120000$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [, iterations, salt, expected] = String(stored).split('$');
    const actual = crypto.pbkdf2Sync(String(password), salt, Number(iterations), 32, 'sha256').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch { return false; }
}
function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function base64urlJson(obj) { return base64url(JSON.stringify(obj)); }
function signToken(userId) {
  const header = base64urlJson({alg:'HS256',typ:'JWT'});
  const payload = base64urlJson({id:userId,exp:Math.floor(Date.now()/1000)+7*24*60*60});
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}
function verifyToken(token) {
  const parts = String(token||'').split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [header,payload,sig] = parts;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) throw new Error('Invalid token');
  const data = JSON.parse(Buffer.from(payload.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));
  if (!data.exp || data.exp < Math.floor(Date.now()/1000)) throw new Error('Expired token');
  return data;
}
function send(res, status, data, extra = {}) {
  const body = Buffer.from(
    typeof data === 'string' ? data : JSON.stringify(data)
  );

  res.writeHead(status, {
    'Content-Type':
      typeof data === 'string'
        ? 'text/plain; charset=utf-8'
        : 'application/json; charset=utf-8',

    'Content-Length': body.length,
    'Cache-Control': 'no-store',

    // CORS
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',

    ...extra
  });

  res.end(body);
}

function redirect(res,location){res.writeHead(302,{Location:location,'Access-Control-Allow-Origin':'*'});res.end();}
function parseBody(req) {
  return new Promise((resolve,reject)=>{
    let raw='';
    req.on('data',chunk=>{raw+=chunk;if(raw.length>2*1024*1024) reject(new Error('Request body too large'));});
    req.on('end',()=>{if(!raw)return resolve({});try{resolve(JSON.parse(raw));}catch{reject(new Error('Invalid JSON body'));}});
    req.on('error',reject);
  });
}
function authUser(req) {
  const h=req.headers.authorization||'';
  if(!h.startsWith('Bearer ')) throw Object.assign(new Error('Not authorized, no token'),{status:401});
  const payload=verifyToken(h.slice(7));
  const u=findById(readDb().users,payload.id);
  if(!u) throw Object.assign(new Error('User not found'),{status:401});
  return u;
}
function adminOnly(user){if(user.role!=='admin')throw Object.assign(new Error('Admin access required'),{status:403});}
function boolQuery(v){return v===undefined||v===null?undefined:String(v).toLowerCase()==='true';}
function includesCI(v,q){return String(v||'').toLowerCase().includes(String(q||'').toLowerCase());}
function limit(v, fallback=20){const n=parseInt(v,10);return Number.isFinite(n)&&n>0?Math.min(n,100):fallback;}

function contentList(db, collection, query, fields) {
  let items=[...db[collection]];
  const active=boolQuery(query.get('active'));
  if(active!==undefined) items=items.filter(x=>x.isActive===active);
  const search=query.get('search');
  if(search) items=items.filter(x=>fields.some(f=>includesCI(x[f],search)));
  const category=query.get('category');
  if(category) items=items.filter(x=>Array.isArray(x.targetCategory)?x.targetCategory.includes(category):x.category===category);
  if(query.has('limit')) items=items.slice(0,limit(query.get('limit')));
  return items;
}
const crudMap={
  schemes:['schemes',['name','description','benefits']],
  announcements:['announcements',['title','message','location']],
  alerts:['alerts',['title','message','location','severity','type']],
  agriculture:['agriculture',['title','crop','season','content','category']],
  market:['market',['crop','market','location','source']],
  opportunities:['opportunities',['title','type','description','organization','location','eligibility']],
  vehicles:['vehicles',['vehicleNumber','type','model','driverName','location','status']],
  drivers:['drivers',['name','phone','licenseNumber','status']],
  trips:['trips',['vehicleNumber','driverName','source','destination','purpose','status']],
  maintenance:['maintenance',['vehicleNumber','maintenanceType','description','status']],
  fuelRecords:['fuelRecords',['vehicleNumber','fuelType','location']]
};

async function route(req,res) {
  const parsed=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  const pathname=decodeURIComponent(parsed.pathname);
  const method=req.method;
  if(method==='OPTIONS') return send(res,204,'');
  if(pathname==='/api/health' && method==='GET') return send(res,200,{status:'ok',service:'Rural Connect API',time:now()});

  /* auth */
  if(pathname==='/api/auth/register' && method==='POST'){
    const b=await parseBody(req), name=String(b.name||'').trim(), email=String(b.email||'').trim().toLowerCase(), password=String(b.password||'');
    if(name.length<2)return send(res,400,{message:'Name must be at least 2 characters'});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return send(res,400,{message:'Please enter a valid email address'});
    if(password.length<6)return send(res,400,{message:'Password must be at least 6 characters'});
    const db=readDb(); if(db.users.some(u=>u.email===email))return send(res,409,{message:'An account with this email already exists'});
    const user={_id:id('usr'),name,email,passwordHash:hashPassword(password),role:'user',
      phone:String(b.phone||'').trim(),village:String(b.village||'').trim(),district:String(b.district||'').trim(),state:String(b.state||'').trim(),createdAt:now(),updatedAt:now()};
    db.users.push(user); db.notifications.push({_id:id('ntf'),user:user._id,title:'Welcome to Rural Connect',message:'Your account has been created successfully. Explore schemes, agriculture information and local services.',type:'System',isRead:false,createdAt:now()});
    writeDb(db); return send(res,201,{...publicUser(user),token:signToken(user._id)});
  }
  if(pathname==='/api/auth/login' && method==='POST'){
    const b=await parseBody(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''),db=readDb(),u=db.users.find(x=>x.email===email);
    if(!u||!verifyPassword(password,u.passwordHash))return send(res,401,{message:'Invalid email or password'});
    return send(res,200,{...publicUser(u),token:signToken(u._id)});
  }
  if(pathname==='/api/auth/logout'&&method==='POST')return send(res,200,{message:'Logged out successfully'});

  /* protected user endpoints */
  if(pathname==='/api/users/me'){
    let u=authUser(req);
    if(method==='GET')return send(res,200,publicUser(u));
    if(method==='PUT'){
      const b=await parseBody(req),db=readDb(),target=findById(db.users,u._id);
      for(const k of ['name','phone','village','district','state'])if(b[k]!==undefined)target[k]=String(b[k]).trim();
      target.updatedAt=now();writeDb(db);return send(res,200,publicUser(target));
    }
  }
  if(pathname==='/api/users'&&method==='GET'){authUser(req);adminOnly(authUser(req));return send(res,200,readDb().users.map(publicUser));}
  let m=pathname.match(/^\/api\/users\/([^/]+)$/);
  if(m){
    const u=authUser(req);adminOnly(u);const db=readDb(),target=findById(db.users,m[1]);
    if(!target)return send(res,404,{message:'User not found'});
    if(method==='GET')return send(res,200,publicUser(target));
    if(method==='PUT'){const b=await parseBody(req);for(const k of ['name','phone','village','district','state','role'])if(b[k]!==undefined)target[k]=b[k];if(b.password)target.passwordHash=hashPassword(b.password);target.updatedAt=now();writeDb(db);return send(res,200,publicUser(target));}
    if(method==='DELETE'){if(String(target._id)===String(u._id))return send(res,400,{message:'You cannot delete your own admin account'});db.users=db.users.filter(x=>x._id!==target._id);writeDb(db);return send(res,200,{message:'Deleted'});}
  }

  /* fleet management */
  const fleetCollections={
    vehicles:['vehicles',['vehicleNumber','type','model','driverName','location','status']],
    drivers:['drivers',['name','phone','licenseNumber','status']],
    trips:['trips',['vehicleNumber','driverName','source','destination','purpose','status']],
    maintenance:['maintenance',['vehicleNumber','maintenanceType','description','status']],
    fuelRecords:['fuelRecords',['vehicleNumber','fuelType','location']]
  };
  for (const [fleetName, [fleetCollection, fleetFields]] of Object.entries(fleetCollections)) {
    const base=`/api/${fleetName}`;
    if(pathname===base && method==='GET'){
      if(fleetName==='vehicles') return send(res,200,contentList(readDb(),fleetCollection,parsed.searchParams,fleetFields));
      const u=authUser(req);adminOnly(u);return send(res,200,contentList(readDb(),fleetCollection,parsed.searchParams,fleetFields));
    }
    if(pathname===base && method==='POST'){
      const u=authUser(req);adminOnly(u);const db=readDb();
      const b=await parseBody(req); const item={_id:id(fleetName.slice(0,-1)),...b,createdAt:now(),updatedAt:now()};
      if(fleetName==='vehicles'){
        if(!String(item.vehicleNumber||'').trim()||!String(item.type||'').trim()) return send(res,400,{message:'Vehicle number and type are required'});
        if(db.vehicles.some(v=>String(v.vehicleNumber).toLowerCase()===String(item.vehicleNumber).trim().toLowerCase())) return send(res,409,{message:'A vehicle with this number already exists'});
        item.status=item.status||'Available';
      }
      db[fleetCollection].push(item);writeDb(db);return send(res,201,item);
    }
    m=pathname.match(new RegExp(`^${base.replace('/','\\/')}\/([^/]+)$`));
    if(m){
      if(fleetName==='vehicles' && method==='GET'){
        const item=findById(readDb().vehicles,m[1]); return item?send(res,200,item):send(res,404,{message:'Vehicle not found'});
      }
      const u=authUser(req);adminOnly(u);const db=readDb(),item=findById(db[fleetCollection],m[1]);
      if(!item)return send(res,404,{message:'Fleet record not found'});
      if(method==='GET')return send(res,200,item);
      if(method==='PUT'){
        const b=await parseBody(req);
        if(fleetName==='vehicles' && b.vehicleNumber && db.vehicles.some(v=>v._id!==item._id && String(v.vehicleNumber).toLowerCase()===String(b.vehicleNumber).trim().toLowerCase())) return send(res,409,{message:'Another vehicle already uses this number'});
        Object.assign(item,b,{updatedAt:now()});writeDb(db);return send(res,200,item);
      }
      if(method==='DELETE'){db[fleetCollection]=db[fleetCollection].filter(x=>x._id!==item._id);writeDb(db);return send(res,200,{message:'Deleted'});}
    }
  }

  /* vehicle booking */
  if(pathname==='/api/bookings' && method==='GET'){
    const u=authUser(req); const db=readDb();
    const mine=parsed.searchParams.get('mine')==='true';
    if(u.role==='admin' && !mine) return send(res,200,db.bookings);
    return send(res,200,db.bookings.filter(b=>String(b.userId)===String(u._id)));
  }
  if(pathname==='/api/bookings' && method==='POST'){
    const u=authUser(req); const b=await parseBody(req); const db=readDb();
    const vehicle=findById(db.vehicles,b.vehicleId);
    if(!vehicle)return send(res,404,{message:'Vehicle not found'});
    if(vehicle.status!=='Available')return send(res,409,{message:'This vehicle is not available for booking right now.'});
    const bookingDate=String(b.bookingDate||'').trim();
    const bookingTime=String(b.bookingTime||'').trim();
    const purpose=String(b.purpose||'').trim();
    if(!bookingDate)return send(res,400,{message:'Booking date is required'});
    if(!purpose)return send(res,400,{message:'Purpose is required'});
    const activeBooking=db.bookings.find(x=>String(x.vehicleId)===String(vehicle._id) && ['Pending','Approved'].includes(x.status));
    if(activeBooking)return send(res,409,{message:'This vehicle already has an active booking.'});
    /* A successful booking immediately reserves the vehicle for the trip. */
    const booking={_id:id('booking'),userId:u._id,userName:u.name,userPhone:u.phone||'',vehicleId:vehicle._id,vehicleNumber:vehicle.vehicleNumber,vehicleType:vehicle.type,purpose,bookingDate,bookingTime,notes:String(b.notes||'').trim(),status:'Approved',createdAt:now(),updatedAt:now()};
    db.bookings.push(booking);
    vehicle.status='On Trip';
    vehicle.updatedAt=now();
    db.notifications.push({_id:id('ntf'),user:u._id,title:'Vehicle booking confirmed',message:`Your booking for ${vehicle.vehicleNumber} is confirmed. The vehicle is now marked On Trip.`,type:'Fleet',isRead:false,createdAt:now()});
    writeDb(db);return send(res,201,booking);
  }
  m=pathname.match(/^\/api\/bookings\/([^/]+)$/);
  if(m && method==='PUT'){
    const u=authUser(req);adminOnly(u);const db=readDb();const booking=findById(db.bookings,m[1]);
    if(!booking)return send(res,404,{message:'Booking not found'});
    const b=await parseBody(req);const nextStatus=String(b.status||booking.status);
    if(!['Pending','Approved','Rejected','Completed','Cancelled'].includes(nextStatus))return send(res,400,{message:'Invalid booking status'});
    booking.status=nextStatus;booking.updatedAt=now();
    const vehicle=findById(db.vehicles,booking.vehicleId);
    if(vehicle){
      const otherActive=db.bookings.some(x=>x._id!==booking._id && String(x.vehicleId)===String(vehicle._id) && ['Pending','Approved'].includes(x.status));
      vehicle.status=['Pending','Approved'].includes(nextStatus)?'On Trip':(otherActive?'On Trip':'Available');
      vehicle.updatedAt=now();
    }
    db.notifications.push({_id:id('ntf'),user:booking.userId,title:`Vehicle booking ${nextStatus}`,message:`Your booking for ${booking.vehicleNumber} is now ${nextStatus}.`,type:'Fleet',isRead:false,createdAt:now()});
    writeDb(db);return send(res,200,booking);
  }

  /* generic content */
  for(const [name,[collection,fields]] of Object.entries(crudMap)){
    const base=`/api/${name}`;
    if(pathname===base && method==='GET')return send(res,200,contentList(readDb(),collection,parsed.searchParams,fields));
    m=pathname.match(new RegExp(`^${base.replace('/','\\/')}\\/([^/]+)$`));
    if(m){
      if(method==='GET'){const item=findById(readDb()[collection],m[1]);return item?send(res,200,item):send(res,404,{message:'Not found'});}
      const u=authUser(req);adminOnly(u);const db=readDb(),item=findById(db[collection],m[1]);
      if(method==='PUT'){if(!item)return send(res,404,{message:'Not found'});Object.assign(item,await parseBody(req),{updatedAt:now()});writeDb(db);return send(res,200,item);}
      if(method==='DELETE'){if(!item)return send(res,404,{message:'Not found'});db[collection]=db[collection].filter(x=>x._id!==item._id);writeDb(db);return send(res,200,{message:'Deleted'});}
    }
    if(pathname===base&&method==='POST'){const u=authUser(req);adminOnly(u);const db=readDb(),item={_id:id(name.slice(0,-1)),...(await parseBody(req)),createdAt:now(),updatedAt:now()};db[collection].push(item);writeDb(db);return send(res,201,item);}
  }

  /* complaints */
  if(pathname==='/api/complaints'&&method==='POST'){
    const u=authUser(req),b=await parseBody(req);if(!String(b.title||'').trim()||!String(b.description||'').trim())return send(res,400,{message:'Title and description are required'});
    const db=readDb(),c={_id:id('cmp'),user:u._id,title:String(b.title).trim(),category:String(b.category||'General').trim(),description:String(b.description).trim(),location:String(b.location||'').trim(),imageUrl:String(b.imageUrl||''),status:'Submitted',adminNotes:'',createdAt:now()};
    db.complaints.push(c);writeDb(db);return send(res,201,{...c,user:publicUser(u)});
  }
  if(pathname==='/api/complaints'&&method==='GET'){
    const u=authUser(req),db=readDb();let items=[...db.complaints];
    if(req.url.includes('mine=true')||u.role!=='admin')items=items.filter(c=>String(c.user)===String(u._id));
    if(parsed.searchParams.get('status'))items=items.filter(c=>c.status===parsed.searchParams.get('status'));
    if(parsed.searchParams.get('category'))items=items.filter(c=>c.category===parsed.searchParams.get('category'));
    if(parsed.searchParams.get('location'))items=items.filter(c=>includesCI(c.location,parsed.searchParams.get('location')));
    items.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));return send(res,200,items.map(c=>({...c,user:publicUser(findById(db.users,c.user))})));
  }
  m=pathname.match(/^\/api\/complaints\/([^/]+)$/);
  if(m&&method==='GET'){const u=authUser(req),db=readDb(),c=findById(db.complaints,m[1]);if(!c)return send(res,404,{message:'Complaint not found'});if(u.role!=='admin'&&String(c.user)!==String(u._id))return send(res,403,{message:'Not authorized'});return send(res,200,{...c,user:publicUser(findById(db.users,c.user))});}
  m=pathname.match(/^\/api\/complaints\/([^/]+)\/status$/);
  if(m&&method==='PUT'){const u=authUser(req);adminOnly(u);const b=await parseBody(req),db=readDb(),c=findById(db.complaints,m[1]);if(!c)return send(res,404,{message:'Complaint not found'});if(b.status)c.status=String(b.status);if(b.adminNotes!==undefined)c.adminNotes=String(b.adminNotes);if(c.status==='Resolved')c.resolvedAt=now();db.notifications.push({_id:id('ntf'),user:c.user,title:'Complaint Status Updated',message:`Your complaint "${c.title}" status is now: ${c.status}`,type:'Complaint update',relatedComplaintId:c._id,isRead:false,createdAt:now()});writeDb(db);return send(res,200,{...c,user:publicUser(findById(db.users,c.user))});}
  m=pathname.match(/^\/api\/complaints\/([^/]+)$/);
  if(m&&method==='DELETE'){const u=authUser(req);adminOnly(u);const db=readDb(),before=db.complaints.length;db.complaints=db.complaints.filter(c=>c._id!==m[1]);if(db.complaints.length===before)return send(res,404,{message:'Complaint not found'});writeDb(db);return send(res,200,{message:'Deleted'});}

  /* notifications */
  if(pathname==='/api/notifications'&&method==='GET'){const u=authUser(req),db=readDb();let ns=db.notifications.filter(n=>String(n.user)===String(u._id));if(parsed.searchParams.get('unread')==='true')ns=ns.filter(n=>!n.isRead);ns.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));return send(res,200,ns);}
  m=pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if(m&&method==='PUT'){const u=authUser(req),db=readDb(),n=findById(db.notifications,m[1]);if(!n||String(n.user)!==String(u._id))return send(res,404,{message:'Notification not found'});n.isRead=true;writeDb(db);return send(res,200,{message:'Notification marked as read'});}
  if(pathname==='/api/notifications/read-all'&&method==='PUT'){const u=authUser(req),db=readDb();db.notifications.filter(n=>String(n.user)===String(u._id)).forEach(n=>n.isRead=true);writeDb(db);return send(res,200,{message:'All notifications marked as read'});}

  /* analytics */
  if(pathname==='/api/analytics/overview'){const u=authUser(req);adminOnly(u);const db=readDb();return send(res,200,{totalUsers:db.users.length,totalComplaints:db.complaints.length,totalSchemes:db.schemes.length,totalAlerts:db.alerts.length,totalAnnouncements:db.announcements.length,totalVehicles:db.vehicles.length,availableVehicles:db.vehicles.filter(v=>v.status==='Available').length,onTripVehicles:db.vehicles.filter(v=>v.status==='On Trip').length,maintenanceVehicles:db.vehicles.filter(v=>v.status==='Maintenance').length,totalDrivers:db.drivers.length,activeTrips:db.trips.filter(t=>t.status==='Active').length});}
  if(pathname==='/api/analytics/complaints-by-category'){const u=authUser(req);adminOnly(u);const map={};readDb().complaints.forEach(c=>map[c.category]=(map[c.category]||0)+1);return send(res,200,Object.entries(map).map(([category,count])=>({category,count})));}
  if(pathname==='/api/analytics/complaints-over-time'){const u=authUser(req);adminOnly(u);const map={};readDb().complaints.forEach(c=>{const d=c.createdAt.slice(0,10);map[d]=(map[d]||0)+1});return send(res,200,Object.entries(map).sort().map(([date,count])=>({date,count})));}
  if(pathname==='/api/analytics/users-by-village'){const u=authUser(req);adminOnly(u);const map={};readDb().users.forEach(x=>{const v=x.village||'Not specified';map[v]=(map[v]||0)+1});return send(res,200,Object.entries(map).map(([village,count])=>({village,count})));}

  /* multilingual rural AI chatbot */
  if(pathname==='/api/chat' && method==='POST'){
    const b=await parseBody(req);
    const message=String(b.message||'').trim();
    const language=['en','mr','hi'].includes(String(b.language)) ? String(b.language) : 'en';
    if(!message) return send(res,400,{message:'Please enter a message.'});
    const db=readDb();

    // Use the existing Rural Connect database as grounded context.
    const compact=(arr, fields, max=8)=>arr.slice(0,max).map(x=>fields.map(f=>`${f}: ${Array.isArray(x[f])?x[f].join(', '):x[f]||''}`).join(' | ')).join('\n');
    const context = [
      'GOVERNMENT SCHEMES:\n'+compact(db.schemes,['name','description','benefits','eligibility','applicationProcess','targetCategory']),
      'AGRICULTURE:\n'+compact(db.agriculture,['title','crop','season','content','category']),
      'MARKET:\n'+compact(db.market,['crop','market','price','unit','location','date']),
      'OPPORTUNITIES:\n'+compact(db.opportunities,['title','type','description','organization','location','eligibility']),
      'ANNOUNCEMENTS:\n'+compact(db.announcements,['title','message','location']),
      'ALERTS:\n'+compact(db.alerts,['title','message','location','severity','type'])
    ].join('\n\n');

    const langName={en:'English',mr:'Marathi',hi:'Hindi'}[language];
    const system=`You are Rural Connect AI, a helpful assistant for rural citizens in India. Answer in ${langName}. Use the supplied Rural Connect data first. Do not invent scheme eligibility, benefits, amounts, deadlines, or official links. If the data does not contain an answer, clearly say that and suggest checking the official government department/portal. You can explain how to use Rural Connect, schemes, agriculture, market information, weather, complaints, and opportunities. Keep answers simple and practical for rural users.\n\nRURAL CONNECT DATA:\n${context}`;

    // Optional AI layer. No API key is required for the grounded demo fallback below.
    if(OPENAI_API_KEY){
      try{
        const payload={model:OPENAI_MODEL,input:[
          {role:'system',content:system},
          {role:'user',content:message}
        ],max_output_tokens:450};
        const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${OPENAI_API_KEY}`},body:JSON.stringify(payload)});
        const data=await r.json();
        if(r.ok){
          const answer=String(data.output_text||'').trim();
          if(answer) return send(res,200,{answer,language,source:'ai'});
        }
      }catch(e){ /* fall through to local grounded assistant */ }
    }

    const lower=message.toLowerCase();
    const schemeHits=db.schemes.filter(x=>[x.name,x.description,x.benefits,x.eligibility,...(x.targetCategory||[])].join(' ').toLowerCase().split(/\s+/).some(w=>w.length>3 && lower.includes(w))).slice(0,3);
    const agriHits=db.agriculture.filter(x=>[x.title,x.crop,x.season,x.content,x.category].join(' ').toLowerCase().split(/\s+/).some(w=>w.length>3 && lower.includes(w))).slice(0,3);
    const wantsSchemes=/scheme|yojana|शासकीय|सरकारी|योजना|benefit|लाभ|सहाय्य|सहायता/.test(lower);
    const wantsAgri=/agri|farmer|farm|crop|wheat|शेती|शेतकरी|पीक|कृषि|किसान|फसल/.test(lower);
    const wantsMarket=/market|mandi|price|भाव|बाजार|मंडी|दर/.test(lower);
    let answer='';
    if(schemeHits.length || wantsSchemes){
      if(language==='mr') answer=schemeHits.length?'उपलब्ध माहितीनुसार या योजना संबंधित आहेत:\n'+schemeHits.map(x=>`• ${x.name}: ${x.description}`).join('\n'):'रुरल कनेक्टमध्ये उपलब्ध शासकीय योजनांची माहिती मी दाखवू शकतो. कृपया योजनेचे नाव किंवा तुमची गरज सांगा.';
      else if(language==='hi') answer=schemeHits.length?'उपलब्ध जानकारी के अनुसार ये योजनाएँ संबंधित हैं:\n'+schemeHits.map(x=>`• ${x.name}: ${x.description}`).join('\n'):'मैं Rural Connect में उपलब्ध सरकारी योजनाओं की जानकारी दे सकता हूँ। योजना का नाम या अपनी आवश्यकता बताइए।';
      else answer=schemeHits.length?'Based on Rural Connect data, these schemes may be relevant:\n'+schemeHits.map(x=>`• ${x.name}: ${x.description}`).join('\n'):'I can help you find government schemes available in Rural Connect. Tell me the scheme name or your requirement.';
    } else if(agriHits.length || wantsAgri){
      if(language==='mr') answer=agriHits.length?'कृषी माहितीनुसार:\n'+agriHits.map(x=>`• ${x.title}: ${x.content}`).join('\n'):'कृपया पीक किंवा शेतीचा प्रश्न सांगा. मी Rural Connect मधील कृषी माहितीनुसार मदत करेन.';
      else if(language==='hi') answer=agriHits.length?'कृषि जानकारी के अनुसार:\n'+agriHits.map(x=>`• ${x.title}: ${x.content}`).join('\n'):'कृपया फसल या खेती से जुड़ा प्रश्न पूछें। मैं Rural Connect की कृषि जानकारी के आधार पर मदद करूँगा।';
      else answer=agriHits.length?'From Rural Connect agriculture data:\n'+agriHits.map(x=>`• ${x.title}: ${x.content}`).join('\n'):'Ask me about a crop, season, or farming practice and I will use the agriculture information in Rural Connect.';
    } else if(wantsMarket){
      const m=db.market.slice(0,5);
      const lines=m.map(x=>`• ${x.crop} — ${x.market}: ${x.price} ${x.unit}`).join('\n');
      answer=language==='mr'?`Rural Connect मधील बाजार माहिती:\n${lines}`:language==='hi'?`Rural Connect की बाजार जानकारी:\n${lines}`:`Rural Connect market information:\n${lines}`;
    } else {
      const generic={
        en:'Hello! I am Rural Connect AI. I can help with government schemes, agriculture, market information, Rural Connect services, complaints, and opportunities. What would you like to know?',
        mr:'नमस्कार! मी Rural Connect AI आहे. मी शासकीय योजना, शेती, बाजारभाव, तक्रारी आणि संधींबद्दल मदत करू शकतो. तुम्हाला काय जाणून घ्यायचे आहे?',
        hi:'नमस्ते! मैं Rural Connect AI हूँ। मैं सरकारी योजनाओं, कृषि, बाजार जानकारी, शिकायतों और अवसरों के बारे में मदद कर सकता हूँ। आप क्या जानना चाहते हैं?'
      }; answer=generic[language];
    }
    return send(res,200,{answer,language,source:'rural-connect-data'});
  }

  /* weather */
  if(pathname==='/api/weather'&&method==='GET'){
    const location=String(parsed.searchParams.get('location')||'').trim();if(!location)return send(res,400,{message:'Location is required'});
    if(process.env.OPENWEATHER_API_KEY){
      try{const r=await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${encodeURIComponent(process.env.OPENWEATHER_API_KEY)}&units=metric`);
        if(r.ok){const d=await r.json();return send(res,200,{location:d.name,temperature:d.main.temp,condition:d.weather?.[0]?.description||'Unknown',humidity:d.main.humidity,windSpeed:d.wind?.speed||0,forecast:[]});}
      }catch{}
    }
    return send(res,200,{location,temperature:28,condition:'Weather data unavailable — local demo reading',humidity:62,windSpeed:3.4,forecast:[]});
  }

  /* static frontend */
  let filePath=pathname==='/'?path.join(FRONTEND_DIR,'index.html'):path.join(FRONTEND_DIR,pathname.replace(/^\/+/,''));
  if(!filePath.startsWith(FRONTEND_DIR))return send(res,403,'Forbidden');
  if(fs.existsSync(filePath)&&fs.statSync(filePath).isFile()){
    const ext=path.extname(filePath).toLowerCase(), types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'};
    const data=fs.readFileSync(filePath);res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Content-Length':data.length,'Access-Control-Allow-Origin':'*'});return res.end(data);
  }
  if(!pathname.startsWith('/api/')){const data=fs.readFileSync(path.join(FRONTEND_DIR,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':data.length,'Access-Control-Allow-Origin':'*'});return res.end(data);}
  return send(res,404,{message:'API endpoint not found'});
}

const server=http.createServer(async(req,res)=>{
  try{await route(req,res);}catch(e){console.error(e);send(res,e.status||500,{message:e.message||'Internal server error'});}
});
ensureDb();
server.listen(PORT,()=>console.log(`Rural Connect running at http://localhost:${PORT}`));
