const fs=require('fs'), path=require('path'), crypto=require('crypto');
function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.pbkdf2Sync(password,salt,120000,32,'sha256').toString('hex');return `pbkdf2$120000$${salt}$${hash}`;}
const file=path.join(__dirname,'data','rural-connect.json');
const id=p=>`${p}_${crypto.randomUUID()}`, now=()=>new Date().toISOString();
const adminId=id('usr'), userId=id('usr');
const db={
 users:[
  {_id:adminId,name:'Admin User',email:'admin@ruralconnect.local',passwordHash:hashPassword('Admin@123'),role:'admin',phone:'',village:'',district:'',state:'',createdAt:now(),updatedAt:now()},
  {_id:userId,name:'Ramesh Kumar',email:'user@ruralconnect.local',passwordHash:hashPassword('User@123'),role:'user',phone:'9876543210',village:'Rampur',district:'Jaipur',state:'Rajasthan',createdAt:now(),updatedAt:now()}
 ],
 schemes:[
  {_id:id('scheme'),name:'Pradhan Mantri Kisan Samman Nidhi (PM-KISAN)',description:'Income support scheme for farmers providing Rs. 6,000 per year in three installments.',benefits:'Rs. 6,000 per year directly transferred to bank account',eligibility:'All landholding farmer families',requiredDocuments:['Aadhaar card','Land records','Bank account details'],applicationProcess:'Register through the local agriculture department or official online portal.',applicationLink:'https://pmkisan.gov.in/',targetCategory:['Farmers','Agriculture'],isActive:true},
  {_id:id('scheme'),name:'Mahatma Gandhi National Rural Employment Guarantee Act (MGNREGA)',description:'Guarantees up to 100 days of wage employment per year to rural households.',benefits:'Wage employment and village asset creation',eligibility:'Adult members of rural households willing to do unskilled manual work',requiredDocuments:['Aadhaar card','Job card'],applicationProcess:'Apply at the Gram Panchayat for a job card.',applicationLink:'https://nrega.nic.in/',targetCategory:['Employment','Farmers'],isActive:true},
  {_id:id('scheme'),name:'Pradhan Mantri Awas Yojana (PMAY) - Gramin',description:'Financial assistance for eligible rural households to construct pucca houses.',benefits:'Housing assistance for eligible rural families',eligibility:'Rural households living in kutcha or dilapidated houses',requiredDocuments:['Aadhaar card','BPL certificate','Bank account details'],applicationProcess:'Apply through the Gram Panchayat or official portal.',applicationLink:'https://pmayg.nic.in/',targetCategory:['Housing','Senior citizens'],isActive:true}
 ],
 announcements:[
  {_id:id('ann'),title:'Gram Sabha Meeting',message:'Gram Sabha meeting will be held on 15th September at 10 AM in the village panchayat office.',location:'Rampur',publishedBy:adminId,isActive:true,createdAt:now()},
  {_id:id('ann'),title:'Village Service Camp',message:'A public service help desk will be available at the Gram Panchayat office this week.',location:'All villages',publishedBy:adminId,isActive:true,createdAt:now()}
 ],
 alerts:[{_id:id('alert'),title:'Heavy Rainfall Warning',message:'Heavy rainfall is expected. Farmers should protect ready crops and follow local advisories.',location:'Jaipur',severity:'High',type:'Weather',isActive:true,createdAt:now()}],
 agriculture:[
  {_id:id('agri'),title:'Wheat Cultivation Guide - Rabi Season',crop:'Wheat',season:'Rabi',content:'Sowing is generally done in October-November. Use suitable soil, timely irrigation and recommended seed varieties.',category:'Crop info',isActive:true,createdAt:now()},
  {_id:id('agri'),title:'Pest Control in Cotton',crop:'Cotton',season:'Kharif',content:'Use integrated pest management and avoid unnecessary pesticide use. Monitor crops regularly.',category:'Pest/disease',isActive:true,createdAt:now()}
 ],
 opportunities:[
  {_id:id('opp'),title:'Agriculture Skill Development Program',type:'Training',description:'Free training on modern farming techniques and organic cultivation.',organization:'State Agriculture Department',location:'District Center',eligibility:'Farmers aged 18-45',isActive:true,createdAt:now()},
  {_id:id('opp'),title:'Rural Self Employment Training',type:'Skill development',description:'Training for setting up small businesses in rural areas with bank linkage.',organization:'NABARD',location:'District Center',eligibility:'Rural youth 18-35 years',isActive:true,createdAt:now()}
 ],
 market:[
  {_id:id('market'),crop:'Wheat',market:'Rampur Mandi',price:2100,unit:'Rs/quintal',location:'Jaipur',date:now(),source:'Local demo dataset'},
  {_id:id('market'),crop:'Rice',market:'Jaipur APMC',price:3200,unit:'Rs/quintal',location:'Jaipur',date:now(),source:'Local demo dataset'}
 ],
 complaints:[],
 vehicles:[
  {_id:id('veh'),vehicleNumber:'MH15AB1234',type:'Service Van',model:'Mahindra Bolero',driverName:'Ramesh Patil',location:'Nashik',status:'Available',createdAt:now(),updatedAt:now()},
  {_id:id('veh'),vehicleNumber:'MH15CD5678',type:'Agriculture Support',model:'Tata 407',driverName:'Suresh Pawar',location:'Dindori',status:'On Trip',createdAt:now(),updatedAt:now()},
  {_id:id('veh'),vehicleNumber:'MH15EF9012',type:'Water Tanker',model:'Ashok Leyland',driverName:'Vijay Shinde',location:'Nashik',status:'Maintenance',createdAt:now(),updatedAt:now()}
 ],
 drivers:[
  {_id:id('drv'),name:'Ramesh Patil',phone:'9876500001',licenseNumber:'MH15-2020-001',vehicleId:'',status:'Active',createdAt:now(),updatedAt:now()},
  {_id:id('drv'),name:'Suresh Pawar',phone:'9876500002',licenseNumber:'MH15-2021-002',vehicleId:'',status:'Active',createdAt:now(),updatedAt:now()},
  {_id:id('drv'),name:'Vijay Shinde',phone:'9876500003',licenseNumber:'MH15-2019-003',vehicleId:'',status:'Active',createdAt:now(),updatedAt:now()}
 ],
 trips:[{_id:id('trip'),vehicleNumber:'MH15CD5678',driverName:'Suresh Pawar',source:'Dindori',destination:'Nashik',purpose:'Agriculture service visit',status:'Active',createdAt:now(),updatedAt:now()}],
 maintenance:[{_id:id('mnt'),vehicleNumber:'MH15EF9012',maintenanceType:'Scheduled service',description:'Engine and brake inspection',status:'Open',createdAt:now(),updatedAt:now()}],
 fuelRecords:[{_id:id('fuel'),vehicleNumber:'MH15AB1234',fuelType:'Diesel',quantity:45,cost:4200,location:'Nashik',date:now(),createdAt:now(),updatedAt:now()}],
 notifications:[{_id:id('ntf'),user:userId,title:'Welcome to Rural Connect',message:'You can use this portal to explore schemes, report local issues and view rural opportunities.',type:'System',isRead:false,createdAt:now()}]
};
fs.mkdirSync(path.dirname(file),{recursive:true});
fs.writeFileSync(file,JSON.stringify(db,null,2));
console.log('Database initialized:',file);
console.log('Admin: admin@ruralconnect.local / Admin@123');
console.log('User: user@ruralconnect.local / User@123');
