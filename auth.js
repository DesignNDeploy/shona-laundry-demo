/**
 * Shona Laundry – Auth + Real-Time Module v3.0
 * ─────────────────────────────────────────────
 * • Connects to real Node.js + Socket.io server
 * • JWT stored in localStorage
 * • Real-time: NEW_BOOKING fires on manager+admin dashboards
 * • Falls back to demo mode if server offline
 * ─────────────────────────────────────────────
 * Usage:
 *   Root   : <script src="auth.js"></script>
 *   SubDir : <script src="../auth.js"></script>
 */

(function () {
  'use strict';

  /* ── Config ─────────────────────────── */
  const API_URL     = 'http://localhost:3001/api';
  const SOCKET_URL  = 'http://localhost:3001';
  const TOKEN_KEY   = 'shona_token';
  const USER_KEY    = 'shona_user';
  const POPUP_DELAY = 4000;

  /* ── Demo credentials fallback ───────── */
  const DEMO = [
    { email:'admin@shona.com',   phone:'9999999999', pass:'admin123', role:'admin',   name:'Admin Shona',  id:'1' },
    { email:'manager@shona.com', phone:'9812345678', pass:'mgr123',   role:'manager', name:'Ravi Manager', id:'2' },
    { email:'user@shona.com',    phone:'9876543210', pass:'user123',  role:'user',    name:'Priya Sharma', id:'3' },
  ];
  const ROLE_PATHS = { admin:'admin/index.html', manager:'manager/index.html', user:'user/index.html' };

  /* ── Session ─────────────────────────── */
  function saveSession(token, user) { localStorage.setItem(TOKEN_KEY,token); localStorage.setItem(USER_KEY,JSON.stringify(user)); }
  function clearSession()           { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
  function getToken()   { return localStorage.getItem(TOKEN_KEY); }
  function getUser()    { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
  function isLoggedIn() { return !!(getToken() && getUser() && !isExpired(getToken())); }
  function isExpired(t) {
    try { const p=JSON.parse(atob(t.split('.')[1])); return Date.now()>=p.exp*1000; }
    catch { return true; }
  }

  /* ── Base path ───────────────────────── */
  function base() {
    const parts = window.location.pathname.replace(/\/$/,'').split('/').filter(Boolean);
    const d     = parts.length>0 && parts[parts.length-1].includes('.') ? parts.length-1 : parts.length;
    return d>0 ? '../'.repeat(d) : '';
  }

  /* ── Real API login ──────────────────── */
  async function apiLogin(email, password) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const r = await fetch(API_URL+'/auth/login', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email: email.trim(), password }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await r.json();
      // Server responded successfully → use it
      if (data.success) return data;
      // Server said error BUT demo credentials match → use demo
      const demo = demoLogin(email.trim(), password);
      if (demo.success) return demo;
      // Return the real error message
      return data;
    } catch (err) {
      // Network error / server offline / timeout → fall back to demo
      console.log('Server unavailable, using demo mode:', err.message);
      return demoLogin(email.trim(), password);
    }
  }

  /* ── Demo fallback ───────────────────── */
  function demoLogin(email, pass) {
    const u = DEMO.find(d=>(d.email===email.toLowerCase()||d.phone===email)&&d.pass===pass);
    if (!u) return { success:false, message:'Wrong email/phone or password. Try the demo credentials below.' };
    const pl  = btoa(JSON.stringify({ id:u.id, email:u.email, name:u.name, role:u.role, exp:Math.floor(Date.now()/1000)+86400 }));
    const tok = `demo.${pl}.sig`;
    return { success:true, message:`Welcome back, ${u.name}!`, token:tok, user:{ id:u.id, name:u.name, email:u.email, role:u.role }, redirect:ROLE_PATHS[u.role] };
  }

  /* ══════════════════════════════════════
     SOCKET.IO — REAL-TIME ENGINE
  ══════════════════════════════════════ */
  let _socket = null;

  function loadSocketIO(callback) {
    if (window.io) { callback(); return; }
    const script = document.createElement('script');
    script.src   = SOCKET_URL + '/socket.io/socket.io.js';
    script.onload  = callback;
    script.onerror = () => console.log('⚠️ Socket.io not available (server offline)');
    document.head.appendChild(script);
  }

  function connectSocket(user) {
    if (!user || _socket) return;
    loadSocketIO(() => {
      if (!window.io) return;
      _socket = window.io(SOCKET_URL, { transports:['websocket','polling'] });

      _socket.on('connect', () => {
        console.log('⚡ Socket connected:', _socket.id);
        _socket.emit('register', { userId: user.id, role: user.role });
      });

      _socket.on('registered', (data) => {
        console.log('✅ Registered as', data.role);
      });

      // ── NEW BOOKING event (fires on Manager + Admin dashboards) ──
      _socket.on('NEW_BOOKING', (data) => {
        console.log('🆕 NEW_BOOKING received:', data);
        ShonaAuth._onNewBooking(data);
      });

      // ── ORDER STATUS UPDATED (fires on User dashboard) ──
      _socket.on('ORDER_STATUS_UPDATED', (data) => {
        console.log('📦 STATUS_UPDATE received:', data);
        ShonaAuth._onStatusUpdate(data);
      });

      // ── BOOKING CONFIRMED (fires on User after they book) ──
      _socket.on('BOOKING_CONFIRMED', (data) => {
        console.log('✅ BOOKING_CONFIRMED:', data);
        ShonaAuth._onBookingConfirmed(data);
      });

      _socket.on('disconnect', () => console.log('❌ Socket disconnected'));
      _socket.on('connect_error', (e) => console.log('⚠️ Socket error:', e.message));
    });
  }

  /* ── Notification sound ──────────────── */
  function playSound() {
    try {
      const ctx    = new (window.AudioContext || window.webkitAudioContext)();
      const osc    = ctx.createOscillator();
      const gain   = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(800, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch(e) {}
  }

  /* ── Toast notification ──────────────── */
  function showNotifToast(title, message, type='info') {
    const existing = document.getElementById('sla-rt-toast');
    if (existing) existing.remove();

    const colors = {
      new_booking:   { bg:'#f0fdf4', border:'#86efac', icon:'🆕', accent:'#16a34a' },
      status_update: { bg:'#eff6ff', border:'#bfdbfe', icon:'📦', accent:'#2563eb' },
      confirmed:     { bg:'#f0fdf4', border:'#86efac', icon:'✅', accent:'#16a34a' },
      info:          { bg:'#f8fafc', border:'#e2e8f0', icon:'ℹ️', accent:'#64748b' },
    };
    const c = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.id = 'sla-rt-toast';
    toast.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:.75rem;">
        <span style="font-size:1.4rem;flex-shrink:0;">${c.icon}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:.85rem;font-weight:700;color:#0f172a;margin-bottom:.2rem;">${title}</div>
          <div style="font-size:.78rem;color:#334155;line-height:1.5;">${message}</div>
        </div>
        <button onclick="this.closest('#sla-rt-toast').remove()"
          style="background:none;border:none;cursor:pointer;font-size:.9rem;color:#94a3b8;flex-shrink:0;padding:0;">✕</button>
      </div>
    `;
    toast.style.cssText = `
      position:fixed;top:80px;right:1.5rem;z-index:99999;
      background:${c.bg};border:2px solid ${c.border};
      border-left:4px solid ${c.accent};
      border-radius:14px;padding:1rem 1.1rem;
      min-width:300px;max-width:380px;
      box-shadow:0 8px 32px rgba(0,0,0,.15);
      font-family:'Poppins',sans-serif;
      animation:rtToastIn .35s cubic-bezier(.34,1.56,.64,1);
    `;
    document.body.appendChild(toast);

    // Auto remove after 7 seconds
    setTimeout(() => {
      toast.style.animation = 'rtToastOut .3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 7000);
  }

  // CSS animations for toast
  const toastStyle = document.createElement('style');
  toastStyle.textContent = `
    @keyframes rtToastIn  { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:translateX(0)} }
    @keyframes rtToastOut { from{opacity:1;transform:translateX(0)} to{opacity:0;transform:translateX(40px)} }
    @keyframes slaDropIn  { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
  `;
  document.head.appendChild(toastStyle);

  /* ── Notification bell updater ───────── */
  function updateBell(count) {
    const bell = document.getElementById('notif-bell-count');
    if (!bell) return;
    bell.textContent = count > 99 ? '99+' : count;
    bell.style.display = count > 0 ? 'flex' : 'none';
  }

  /* ── Add notification to panel ───────── */
  function addToPanel(data) {
    const panel = document.getElementById('notif-panel-list');
    if (!panel) return;

    const item = document.createElement('div');
    item.className = 'notif-item-new';
    item.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:.6rem;padding:.75rem 1rem;border-bottom:1px solid #f1f5f9;background:#f0fdf4;animation:rtToastIn .3s ease;">
        <span style="font-size:1.1rem;">🆕</span>
        <div>
          <div style="font-size:.82rem;font-weight:600;color:#0f172a;">${data.customerName || 'New Customer'}</div>
          <div style="font-size:.76rem;color:#64748b;">${data.serviceType} — ${data.orderId}</div>
          <div style="font-size:.72rem;color:#94a3b8;margin-top:.15rem;">Just now</div>
        </div>
      </div>
    `;
    panel.prepend(item);

    // Update unread counter
    const counter = parseInt(panel.dataset.unread||'0') + 1;
    panel.dataset.unread = counter;
    updateBell(counter);
  }

  /* ════════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════════ */
  window.ShonaAuth = {

    /* Real-time event handlers — overridable by each dashboard */
    _onNewBooking(data) {
      playSound();
      showNotifToast(
        '🆕 New Booking Received!',
        `${data.customerName} booked ${data.serviceType}\nOrder: ${data.orderId} — ₹${data.totalAmount}`,
        'new_booking'
      );
      addToPanel(data);
      // Dispatch custom event so dashboards can refresh tables
      window.dispatchEvent(new CustomEvent('sla:newBooking', { detail: data }));
    },

    _onStatusUpdate(data) {
      playSound();
      const labels = {
        booked:'📋 Booked', pickup_scheduled:'📅 Pickup Scheduled',
        picked_up:'🚗 Picked Up', washing:'🫧 Washing', ironing:'👔 Ironing',
        ready:'✅ Ready for Delivery', out_for_delivery:'🚚 Out for Delivery',
        delivered:'🏠 Delivered!', cancelled:'❌ Cancelled'
      };
      showNotifToast(
        'Order Update',
        `Order ${data.orderId}: ${labels[data.newStatus] || data.newStatus}`,
        'status_update'
      );
      window.dispatchEvent(new CustomEvent('sla:statusUpdate', { detail: data }));
    },

    _onBookingConfirmed(data) {
      showNotifToast('Booking Confirmed!', `Order ${data.orderId} — ${data.message}`, 'confirmed');
      window.dispatchEvent(new CustomEvent('sla:bookingConfirmed', { detail: data }));
    },

    /* Open the login modal */
    openModal() {
      if (!document.getElementById('sla-overlay')) {
        const logo = base()+'logo.jpeg';
        document.body.insertAdjacentHTML('beforeend', buildModal(logo));
      }
      const ov = document.getElementById('sla-overlay');
      ov.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(()=>requestAnimationFrame(()=>ov.classList.add('sla-in')));
      setTimeout(()=>document.getElementById('sla-email')?.focus(), 400);
    },

    closeModal() {
      const ov = document.getElementById('sla-overlay');
      if (!ov) return;
      ov.classList.remove('sla-in');
      document.body.style.overflow = '';
      setTimeout(()=>{ ov.style.display='none'; }, 330);
    },

    togglePass() {
      const i=document.getElementById('sla-pass'), b=document.getElementById('sla-eye');
      if (!i) return;
      i.type = i.type==='password'?'text':'password';
      b.textContent = i.type==='password'?'👁️':'🙈';
    },

    fillDemo(email, pass) {
      const e=document.getElementById('sla-email'), p=document.getElementById('sla-pass');
      if (e) e.value=email; if (p) p.value=pass;
      ['sla-err','sla-ok','sla-err-email','sla-err-pass'].forEach(id=>{
        const el=document.getElementById(id); if(el)el.style.display='none';
      });
    },

    async submitLogin() {
      ['sla-err','sla-ok','sla-err-email','sla-err-pass'].forEach(id=>{
        const el=document.getElementById(id); if(el)el.style.display='none';
      });
      const emailEl=document.getElementById('sla-email');
      const passEl =document.getElementById('sla-pass');
      if (!emailEl||!passEl) return;

      const em=emailEl.value.trim(), pw=passEl.value;
      let ok=true;
      if (!em){document.getElementById('sla-err-email').style.display='block';emailEl.style.borderColor='#ef4444';ok=false;}
      if (!pw){document.getElementById('sla-err-pass').style.display='block';passEl.style.borderColor='#ef4444';ok=false;}
      if (!ok) return;

      const btn=document.getElementById('sla-btn'), spinner=document.getElementById('sla-spin'), btnTxt=document.getElementById('sla-btn-txt');
      spinner.style.display='block'; btnTxt.textContent='Signing in…'; btn.disabled=true; btn.style.opacity='.75';

      const result = await apiLogin(em, pw);

      spinner.style.display='none'; btn.disabled=false; btn.style.opacity='1';

      if (result.success) {
        saveSession(result.token, result.user);
        ShonaAuth.updateNavbar(result.user);
        // Connect socket after login
        connectSocket(result.user);

        const okEl=document.getElementById('sla-ok');
        okEl.style.display='flex';
        okEl.textContent=`✅ ${result.message} Redirecting to ${result.user.role} dashboard…`;
        btnTxt.textContent='Redirecting…';
        setTimeout(()=>{ window.location.href=base()+result.redirect; }, 1300);
      } else {
        const errEl=document.getElementById('sla-err');
        errEl.style.display='flex';
        errEl.textContent=`❌ ${result.message}`;
        btnTxt.textContent='Sign In';
      }
    },

    updateNavbar(user) {
      const lb=document.getElementById('navLoginBtn'), ub=document.getElementById('navUserBtn');
      if (lb) { lb.style.display='none'; lb.onclick=e=>{e.preventDefault();ShonaAuth.openModal();}; }
      if (ub) { ub.style.display='inline-flex'; ub.textContent=`👤 ${user.name.split(' ')[0]}`; ub.title=`${user.name} · ${user.role}`; ub.onclick=e=>{e.preventDefault();ShonaAuth.showDropdown(user);}; }
    },

    showDropdown(user) {
      const ex=document.getElementById('sla-dropdown');
      if (ex){ex.remove();return;}
      const icons={admin:'🔴',manager:'👷',user:'👤'};
      const m=document.createElement('div');
      m.id='sla-dropdown';
      m.innerHTML=`
        <div style="padding:.6rem 1rem .4rem;border-bottom:1px solid #e2e8f0;">
          <div style="font-size:.84rem;font-weight:700;color:#0f172a;">${icons[user.role]||'👤'} ${user.name}</div>
          <div style="font-size:.71rem;color:#64748b;">${user.email}</div>
        </div>
        <a href="#" onclick="ShonaAuth.goDash(event)" style="display:flex;align-items:center;gap:.5rem;padding:.52rem 1rem;font-size:.82rem;color:#2563eb;font-weight:600;text-decoration:none;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='none'">📊 My Dashboard</a>
        <a href="#" onclick="ShonaAuth.logout(event)" style="display:flex;align-items:center;gap:.5rem;padding:.52rem 1rem;font-size:.82rem;color:#dc2626;font-weight:600;text-decoration:none;border-top:1px solid #e2e8f0;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'">🚪 Logout</a>
      `;
      m.style.cssText='position:fixed;top:70px;right:1.5rem;z-index:9998;background:#fff;border-radius:14px;min-width:210px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.18);border:1.5px solid #e2e8f0;animation:slaDropIn .18s ease;';
      document.body.appendChild(m);
      setTimeout(()=>{
        function h(e){if(!m.contains(e.target)){m.remove();document.removeEventListener('click',h);}}
        document.addEventListener('click',h);
      },50);
    },

    goDash(e) {
      if(e)e.preventDefault();
      const u=getUser();
      if(!u){ShonaAuth.openModal();return;}
      window.location.href=base()+ROLE_PATHS[u.role];
    },

    logout(e) {
      if(e)e.preventDefault();
      if (_socket){ _socket.disconnect(); _socket=null; }
      clearSession();
      document.getElementById('sla-dropdown')?.remove();
      const lb=document.getElementById('navLoginBtn'), ub=document.getElementById('navUserBtn');
      if(lb){lb.style.display='inline-flex';lb.textContent='Login';}
      if(ub)ub.style.display='none';
    },

    /* ── Guard for dashboard pages ──────── */
    guard(role) {
      const tok=getToken(), usr=getUser();
      if (!tok||!usr||isExpired(tok)){
        clearSession();
        window.location.href=base()+'index.html';
        return null;
      }
      if (role&&usr.role!==role){
        window.location.href=base()+ROLE_PATHS[usr.role];
        return null;
      }
      // Connect socket for real-time
      connectSocket(usr);
      return usr;
    },

    /* ── Make API call with auth token ─── */
    async api(path, options={}) {
      const tok = getToken();
      const headers = { 'Content-Type':'application/json', ...(tok?{Authorization:`Bearer ${tok}`}:{}) };
      try {
        const res  = await fetch(API_URL + path, { ...options, headers:{ ...headers, ...(options.headers||{}) } });
        return await res.json();
      } catch (err) {
        console.error('API error:', path, err);
        return { success:false, message:'Server offline.' };
      }
    },

    /* ── Init on home page (index.html) ─── */
    initHome() {
      const lb=document.getElementById('navLoginBtn');
      if(lb) lb.addEventListener('click',e=>{e.preventDefault();ShonaAuth.openModal();});

      if (isLoggedIn()) {
        ShonaAuth.updateNavbar(getUser());
        connectSocket(getUser());
      } else {
        clearSession();
        setTimeout(()=>{ if(!isLoggedIn()) ShonaAuth.openModal(); }, POPUP_DELAY);
      }
    },

    /* Expose for dashboards */
    getUser, getToken, isLoggedIn,
    connectSocket: (u) => connectSocket(u || getUser()),
  };

  /* ══════════════════════════════════════
     LOGIN MODAL HTML
  ══════════════════════════════════════ */
  function buildModal(logoSrc) {
    return `
<div id="sla-overlay" style="position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.68);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:1rem;opacity:0;transition:opacity .3s ease;" onclick="if(event.target===this)ShonaAuth.closeModal()">
<div id="sla-box" style="width:100%;max-width:430px;background:#fff;border-radius:24px;box-shadow:0 32px 90px rgba(0,0,0,.5);overflow:hidden;transform:translateY(30px) scale(.96);opacity:0;transition:transform .38s cubic-bezier(.34,1.56,.64,1),opacity .32s ease;">
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 55%,#2563eb 100%);padding:1.35rem 1.6rem;display:flex;align-items:center;justify-content:space-between;">
    <div style="display:flex;align-items:center;gap:.75rem;">
      <div style="display:flex;align-items:center;gap:.6rem;">
        <div style="width:42px;height:42px;border-radius:9px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
          <img src="${logoSrc}" style="width:38px;height:38px;object-fit:contain;" onerror="this.style.display='none'"/>
        </div>
        <div>
          <div style="font-size:1rem;font-weight:800;color:#fff;letter-spacing:-.01em;">Shona<span style="color:#93c5fd;">Laundry</span></div>
          <div style="font-size:.68rem;color:rgba(255,255,255,.6);">Sign in to your account</div>
        </div>
      </div>
    </div>
    <button onclick="ShonaAuth.closeModal()" style="background:rgba(255,255,255,.12);border:none;cursor:pointer;color:#fff;width:30px;height:30px;border-radius:50%;font-size:.95rem;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.background='rgba(255,255,255,.25)'" onmouseout="this.style.background='rgba(255,255,255,.12)'">✕</button>
  </div>
  <div style="padding:1.6rem 1.75rem 1.9rem;">
    <div id="sla-err" style="display:none;align-items:center;gap:.5rem;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:9px;padding:.6rem .9rem;font-size:.8rem;margin-bottom:.9rem;font-weight:500;"></div>
    <div id="sla-ok"  style="display:none;align-items:center;gap:.5rem;background:#f0fdf4;border:1px solid #86efac;color:#16a34a;border-radius:9px;padding:.6rem .9rem;font-size:.8rem;margin-bottom:.9rem;font-weight:500;"></div>
    <div style="margin-bottom:.95rem;">
      <label style="display:block;font-size:.78rem;font-weight:600;color:#334155;margin-bottom:.3rem;">Email or Phone Number</label>
      <div style="position:relative;"><span style="position:absolute;left:.82rem;top:50%;transform:translateY(-50%);pointer-events:none;font-size:.9rem;">📧</span>
        <input id="sla-email" type="text" placeholder="email@example.com or 9XXXXXXXXX" autocomplete="username" onkeydown="if(event.key==='Enter')ShonaAuth.submitLogin()"
          style="width:100%;padding:.72rem .82rem .72rem 2.3rem;border:1.5px solid #e2e8f0;border-radius:10px;font-size:.86rem;font-family:'Poppins',sans-serif;color:#0f172a;background:#f1f5f9;outline:none;transition:.2s;box-sizing:border-box;"
          onfocus="this.style.borderColor='#2563eb';this.style.background='#fff';this.style.boxShadow='0 0 0 3px rgba(37,99,235,.1)'" onblur="this.style.borderColor='#e2e8f0';this.style.background='#f1f5f9';this.style.boxShadow='none'"/>
      </div>
      <div id="sla-err-email" style="font-size:.72rem;color:#dc2626;margin-top:.22rem;display:none;">Please enter your email or phone number.</div>
    </div>
    <div style="margin-bottom:.8rem;">
      <label style="display:block;font-size:.78rem;font-weight:600;color:#334155;margin-bottom:.3rem;">Password</label>
      <div style="position:relative;"><span style="position:absolute;left:.82rem;top:50%;transform:translateY(-50%);pointer-events:none;font-size:.9rem;">🔒</span>
        <input id="sla-pass" type="password" placeholder="Enter your password" autocomplete="current-password" onkeydown="if(event.key==='Enter')ShonaAuth.submitLogin()"
          style="width:100%;padding:.72rem 2.6rem .72rem 2.3rem;border:1.5px solid #e2e8f0;border-radius:10px;font-size:.86rem;font-family:'Poppins',sans-serif;color:#0f172a;background:#f1f5f9;outline:none;transition:.2s;box-sizing:border-box;"
          onfocus="this.style.borderColor='#2563eb';this.style.background='#fff';this.style.boxShadow='0 0 0 3px rgba(37,99,235,.1)'" onblur="this.style.borderColor='#e2e8f0';this.style.background='#f1f5f9';this.style.boxShadow='none'"/>
        <button type="button" id="sla-eye" onclick="ShonaAuth.togglePass()" style="position:absolute;right:.82rem;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:.85rem;color:#64748b;">👁️</button>
      </div>
      <div id="sla-err-pass" style="font-size:.72rem;color:#dc2626;margin-top:.22rem;display:none;">Please enter your password.</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.1rem;">
      <a href="register.html" style="font-size:.75rem;color:#16a34a;font-weight:600;text-decoration:none;">✨ Create Account</a>
      <a href="#" style="font-size:.75rem;color:#2563eb;font-weight:500;text-decoration:none;">Forgot password?</a>
    </div>
    <button id="sla-btn" onclick="ShonaAuth.submitLogin()" style="width:100%;padding:.85rem;border:none;border-radius:12px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-size:.92rem;font-weight:700;font-family:'Poppins',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.5rem;transition:.25s;box-shadow:0 4px 16px rgba(37,99,235,.35);">
      <div id="sla-spin" style="width:15px;height:15px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:slaSpin .65s linear infinite;display:none;flex-shrink:0;"></div>
      <span id="sla-btn-txt">Sign In</span>
    </button>
    <div style="display:flex;align-items:center;gap:.65rem;margin:.9rem 0;color:#94a3b8;font-size:.73rem;"><div style="flex:1;height:1px;background:#e2e8f0;"></div>or<div style="flex:1;height:1px;background:#e2e8f0;"></div></div>
    <button onclick="window.open('https://wa.me/919106666146?text=Hello%20Shona%20Laundry!%20I%20want%20to%20login.','_blank')" style="width:100%;padding:.75rem;border:none;border-radius:11px;background:linear-gradient(135deg,#128C7E,#25d366);color:#fff;font-size:.84rem;font-weight:600;font-family:'Poppins',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.5rem;transition:.2s;" onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      Continue with WhatsApp
    </button>
    <div style="background:#f8fafc;border:1.5px dashed #e2e8f0;border-radius:11px;padding:.85rem .95rem;margin-top:.95rem;">
      <div style="font-size:.68rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.07em;margin-bottom:.45rem;">🔑 Demo Credentials — Click to fill</div>
      <div style="display:flex;flex-direction:column;gap:.22rem;">
        <button onclick="ShonaAuth.fillDemo('user@shona.com','user123')" style="display:flex;justify-content:space-between;align-items:center;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:.35rem .7rem;cursor:pointer;font-family:'Poppins',sans-serif;transition:.15s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'"><span style="font-size:.73rem;color:#1e40af;font-weight:700;">👤 User</span><span style="font-size:.69rem;color:#3b82f6;">user@shona.com / user123</span></button>
        <button onclick="ShonaAuth.fillDemo('manager@shona.com','mgr123')" style="display:flex;justify-content:space-between;align-items:center;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:.35rem .7rem;cursor:pointer;font-family:'Poppins',sans-serif;transition:.15s;" onmouseover="this.style.background='#ccfbf1'" onmouseout="this.style.background='#f0fdfa'"><span style="font-size:.73rem;color:#134e4a;font-weight:700;">👷 Manager</span><span style="font-size:.69rem;color:#0f766e;">manager@shona.com / mgr123</span></button>
        <button onclick="ShonaAuth.fillDemo('admin@shona.com','admin123')" style="display:flex;justify-content:space-between;align-items:center;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:.35rem .7rem;cursor:pointer;font-family:'Poppins',sans-serif;transition:.15s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'"><span style="font-size:.73rem;color:#7f1d1d;font-weight:700;">🔴 Admin</span><span style="font-size:.69rem;color:#dc2626;">admin@shona.com / admin123</span></button>
      </div>
    </div>
  </div>
</div>
</div>
<style>@keyframes slaSpin{to{transform:rotate(360deg)}}#sla-overlay.sla-in{opacity:1!important}#sla-overlay.sla-in #sla-box{transform:translateY(0) scale(1)!important;opacity:1!important}</style>`;
  }

})();
