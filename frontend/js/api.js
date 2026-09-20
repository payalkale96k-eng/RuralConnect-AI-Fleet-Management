async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getToken();
  const headers = {
    Accept: 'application/json',
    ...(options.body ? {'Content-Type':'application/json'} : {}),
    ...(token ? {Authorization:`Bearer ${token}`} : {}),
    ...(options.headers || {})
  };
  let response;
  try {
    response = await fetch(url, {...options, headers});
  } catch {
    throw new Error(`Cannot connect to Rural Connect API at ${API_BASE_URL}. Start the backend with "npm start" in the project root.`);
  }
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {message:text || 'Unexpected server response'}; }
  if (!response.ok) {
    if (response.status === 401 && token) removeToken();
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
}

async function registerUser(payload){ return apiRequest('/auth/register',{method:'POST',body:JSON.stringify(payload)}); }
async function loginUser(payload){
  const data=await apiRequest('/auth/login',{method:'POST',body:JSON.stringify(payload)});
  if(data.token){ setToken(data.token); setUser({_id:data._id,name:data.name,email:data.email,role:data.role,phone:data.phone,village:data.village,district:data.district,state:data.state}); }
  return data;
}
async function logoutUser(){
  try { if(getToken()) await apiRequest('/auth/logout',{method:'POST'}); } catch {}
  removeToken();
}
async function fetchSchemes(params={}){ return apiRequest(`/schemes?${new URLSearchParams(params)}`); }
async function fetchSchemeById(id){ return apiRequest(`/schemes/${encodeURIComponent(id)}`); }
async function submitComplaint(formData){ return apiRequest('/complaints',{method:'POST',body:JSON.stringify(formData)}); }
async function fetchMyComplaints(){ return apiRequest('/complaints?mine=true'); }
async function fetchComplaintById(id){ return apiRequest(`/complaints/${encodeURIComponent(id)}`); }
async function fetchAnnouncements(params={}){ return apiRequest(`/announcements?${new URLSearchParams(params)}`); }
async function fetchAlerts(params={}){ return apiRequest(`/alerts?${new URLSearchParams(params)}`); }
async function fetchAgriculture(params={}){ return apiRequest(`/agriculture?${new URLSearchParams(params)}`); }
async function fetchMarket(params={}){ return apiRequest(`/market?${new URLSearchParams(params)}`); }
async function fetchOpportunities(params={}){ return apiRequest(`/opportunities?${new URLSearchParams(params)}`); }
async function fetchWeather(location){ return apiRequest(`/weather?location=${encodeURIComponent(location)}`); }
async function fetchNotifications(params={}){ return apiRequest(`/notifications?${new URLSearchParams(params)}`); }
async function markNotificationRead(id){ return apiRequest(`/notifications/${encodeURIComponent(id)}/read`,{method:'PUT'}); }
async function updateNotificationsReadAll(){ return apiRequest('/notifications/read-all',{method:'PUT'}); }
async function fetchProfile(){ return apiRequest('/users/me'); }
async function updateProfile(payload){ const u=await apiRequest('/users/me',{method:'PUT',body:JSON.stringify(payload)}); setUser(u); return u; }

function escapeHtml(str){
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function truncateText(str,len){ const s=String(str??''); return s.length<=len?s:s.slice(0,len)+'...'; }

async function sendChatMessage(message, language='en'){ return apiRequest('/chat',{method:'POST',body:JSON.stringify({message,language})}); }


// Fleet Management
async function fetchVehicles(params={}){ return apiRequest(`/vehicles?${new URLSearchParams(params)}`); }
async function fetchVehicleById(id){ return apiRequest(`/vehicles/${encodeURIComponent(id)}`); }
async function addVehicle(payload){ return apiRequest('/vehicles',{method:'POST',body:JSON.stringify(payload)}); }
async function updateVehicle(id,payload){ return apiRequest(`/vehicles/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(payload)}); }
async function deleteVehicle(id){ return apiRequest(`/vehicles/${encodeURIComponent(id)}`,{method:'DELETE'}); }
async function fetchDrivers(params={}){ return apiRequest(`/drivers?${new URLSearchParams(params)}`); }
async function addDriver(payload){ return apiRequest('/drivers',{method:'POST',body:JSON.stringify(payload)}); }
async function updateDriver(id,payload){ return apiRequest(`/drivers/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(payload)}); }
async function deleteDriver(id){ return apiRequest(`/drivers/${encodeURIComponent(id)}`,{method:'DELETE'}); }
async function fetchTrips(params={}){ return apiRequest(`/trips?${new URLSearchParams(params)}`); }
async function addTrip(payload){ return apiRequest('/trips',{method:'POST',body:JSON.stringify(payload)}); }
async function updateTrip(id,payload){ return apiRequest(`/trips/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(payload)}); }
async function fetchMaintenance(params={}){ return apiRequest(`/maintenance?${new URLSearchParams(params)}`); }
async function addMaintenance(payload){ return apiRequest('/maintenance',{method:'POST',body:JSON.stringify(payload)}); }
async function updateMaintenance(id,payload){ return apiRequest(`/maintenance/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(payload)}); }
async function fetchFuelRecords(params={}){ return apiRequest(`/fuelRecords?${new URLSearchParams(params)}`); }
async function addFuelRecord(payload){ return apiRequest('/fuelRecords',{method:'POST',body:JSON.stringify(payload)}); }

async function fetchBookings(params={}){ return apiRequest(`/bookings?${new URLSearchParams(params)}`); }
async function createVehicleBooking(payload){ return apiRequest('/bookings',{method:'POST',body:JSON.stringify(payload)}); }
async function updateBookingStatus(id,status){ return apiRequest(`/bookings/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({status})}); }
