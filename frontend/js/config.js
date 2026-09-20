/* Central frontend configuration.
   The Node backend serves this frontend on port 5000.
   If you use VS Code Live Server on another port, requests go to localhost:5000.
   You can override this in the browser before loading the app with:
   window.RURAL_CONNECT_API_URL = "http://localhost:5000/api";
*/
const API_BASE_URL = window.RURAL_CONNECT_API_URL ||
  (window.location.protocol === 'http:' || window.location.protocol === 'https:'
    ? (window.location.port === '5000' ? '/api' : 'https://ruralconnect-ai-backend.onrender.com/api')
    : 'https://ruralconnect-ai-backend.onrender.com/api');

const STORAGE_KEYS = { TOKEN:'rc_token', USER:'rc_user' };

function getToken(){ return localStorage.getItem(STORAGE_KEYS.TOKEN); }
function setToken(token){ localStorage.setItem(STORAGE_KEYS.TOKEN, token); }
function removeToken(){ localStorage.removeItem(STORAGE_KEYS.TOKEN); localStorage.removeItem(STORAGE_KEYS.USER); }
function getUser(){ try { const s=localStorage.getItem(STORAGE_KEYS.USER); return s?JSON.parse(s):null; } catch { removeToken(); return null; } }
function setUser(user){ localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user)); }
function isLoggedIn(){ return !!getToken(); }
function isAdmin(){ const u=getUser(); return !!u && u.role==='admin'; }
function requireAuth(){ if(!isLoggedIn()){ window.location.href='../login.html'; return false; } return true; }
function requireAdmin(){ if(!isAdmin()){ window.location.href='../dashboard/user-dashboard.html'; return false; } return true; }

document.addEventListener('DOMContentLoaded',()=>{
  const authNav=document.getElementById('auth-nav-links');
  if(authNav){
    const user=getUser();
    if(user){
      authNav.innerHTML=(user.role==='admin'
        ? '<li class="nav-item"><a class="nav-link" href="/admin/admin-dashboard.html">Admin Dashboard</a></li>'
        : '<li class="nav-item"><a class="nav-link" href="/dashboard/user-dashboard.html">Dashboard</a></li>')+
        '<li class="nav-item"><a class="nav-link" href="/dashboard/profile.html">Profile</a></li>'+
        '<li class="nav-item"><a class="nav-link" href="#" data-logout>Logout</a></li>';
    } else {
      authNav.innerHTML='<li class="nav-item"><a class="nav-link" href="/login.html">Login</a></li><li class="nav-item"><a class="nav-link" href="/register.html">Register</a></li>';
    }
  }
  document.querySelectorAll('[data-logout]').forEach(link=>{
    link.addEventListener('click',async e=>{
      e.preventDefault(); logoutUser(); window.location.href='/index.html';
    });
  });
});
