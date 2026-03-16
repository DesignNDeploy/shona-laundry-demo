/**
 * Shona Laundry – Main Website Script
 * Handles: navbar, mobile menu, scroll reveal, pricing tabs, booking form, scroll-top
 */

const WA_NUMBER = '919106666146';

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initMobileMenu();
  initScrollReveal();
  initPriceTabs();
  initBookingForm();
  initScrollTop();
  initSmoothScroll();
  setMinDate();
  initActiveNav();

  // ── Auth: init home page popup & navbar ──
  if (window.ShonaAuth) ShonaAuth.initHome();
});

/* ── Sticky Navbar ─────────────────────────── */
function initNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ── Mobile Menu ────────────────────────────── */
function initMobileMenu() {
  const btn   = document.getElementById('hamburger');
  const links = document.getElementById('navLinks');
  if (!btn || !links) return;

  btn.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    btn.classList.toggle('active', open);
    btn.setAttribute('aria-expanded', open);
  });

  // Close on any link click
  links.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => closeMenu(btn, links))
  );

  // Close on outside click
  document.addEventListener('click', e => {
    if (!btn.contains(e.target) && !links.contains(e.target))
      closeMenu(btn, links);
  });
}
function closeMenu(btn, links) {
  links.classList.remove('open');
  btn.classList.remove('active');
  btn.setAttribute('aria-expanded', 'false');
}

/* ── Scroll Reveal ──────────────────────────── */
function initScrollReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  // Hero elements visible immediately
  document.querySelectorAll('.hero .reveal').forEach(el => el.classList.add('visible'));

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  els.forEach(el => {
    if (!el.classList.contains('visible')) observer.observe(el);
  });
}

/* ── Pricing Tabs ───────────────────────────── */
function initPriceTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById('tab-' + target);
      if (panel) panel.classList.add('active');
    });
  });
}

/* ── Booking Form ───────────────────────────── */
function initBookingForm() {
  const form = document.getElementById('bookingForm');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    clearFormErrors(form);

    const name    = form.querySelector('#bname').value.trim();
    const phone   = form.querySelector('#bphone').value.trim();
    const address = form.querySelector('#baddress').value.trim();
    const service = form.querySelector('#bservice').value;
    const date    = form.querySelector('#bdate').value;
    const time    = form.querySelector('#btime').value;
    const notes   = form.querySelector('#bnotes').value.trim();

    let valid = true;
    if (!name)                          { showFieldErr(form, 'bname',    'Please enter your full name.');         valid = false; }
    if (!phone || !validPhone(phone))   { showFieldErr(form, 'bphone',   'Enter a valid 10-digit phone number.'); valid = false; }
    if (!address)                       { showFieldErr(form, 'baddress', 'Please enter your pickup address.');    valid = false; }
    if (!service)                       { showFieldErr(form, 'bservice', 'Please select a service.');             valid = false; }
    if (!date)                          { showFieldErr(form, 'bdate',    'Please select a pickup date.');         valid = false; }
    if (!time)                          { showFieldErr(form, 'btime',    'Please select a time slot.');           valid = false; }
    if (!valid) return;

    const msg =
      `Hello *Shona Laundry!* I want to book a laundry pickup.\n\n` +
      `*---- Booking Details ----*\n\n` +
      `*Name:* ${name}\n` +
      `*Phone:* ${phone}\n` +
      `*Service:* ${service}\n` +
      `*Pickup Address:* ${address}\n` +
      `*Pickup Date:* ${fmtDate(date)}\n` +
      `*Pickup Time:* ${time}\n` +
      `*Notes:* ${notes || 'None'}\n\n` +
      `*------------------------*\n\n` +
      `Please confirm my booking.\nThank you!`;

    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    showToast('Booking sent! Opening WhatsApp…');
    form.reset();
  });
}

function validPhone(p) {
  return /^(\+91|91|0)?[6-9]\d{9}$/.test(p.replace(/[\s\-()]/g, ''));
}
function fmtDate(s) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
}
function showFieldErr(form, id, msg) {
  const el = form.querySelector('#' + id);
  if (!el) return;
  el.style.borderColor = '#ef4444';
  el.style.background  = '#fff5f5';
  const err = document.createElement('span');
  err.className = 'field-err';
  err.textContent = msg;
  err.style.cssText = 'color:#ef4444;font-size:.73rem;margin-top:.2rem;display:block;';
  el.parentElement.appendChild(err);
  el.addEventListener('input', () => {
    el.style.borderColor = '';
    el.style.background  = '';
    el.parentElement.querySelector('.field-err')?.remove();
  }, { once: true });
}
function clearFormErrors(form) {
  form.querySelectorAll('.field-err').forEach(e => e.remove());
  form.querySelectorAll('input,select,textarea').forEach(el => {
    el.style.borderColor = '';
    el.style.background  = '';
  });
}
function showToast(msg) {
  document.querySelector('.sl-toast')?.remove();
  const t = document.createElement('div');
  t.className = 'sl-toast';
  t.textContent = '✅ ' + msg;
  t.style.cssText = `
    position:fixed;bottom:5rem;left:50%;transform:translateX(-50%) translateY(16px);
    background:#fff;border:1.5px solid #22c55e;border-radius:12px;
    padding:.75rem 1.35rem;font-family:'Poppins',sans-serif;font-size:.84rem;
    font-weight:600;color:#166534;box-shadow:0 12px 40px rgba(0,0,0,.15);
    z-index:9999;opacity:0;transition:opacity .3s ease,transform .3s ease;
  `;
  document.body.appendChild(t);
  requestAnimationFrame(() => {
    t.style.opacity   = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    t.style.opacity   = '0';
    t.style.transform = 'translateX(-50%) translateY(16px)';
    setTimeout(() => t.remove(), 350);
  }, 3500);
}

/* ── Scroll To Top ──────────────────────────── */
function initScrollTop() {
  const btn = document.getElementById('scrollTop');
  if (!btn) return;
  window.addEventListener('scroll', () => btn.classList.toggle('visible', window.scrollY > 400), { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ── Smooth Scroll ──────────────────────────── */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const offset = document.getElementById('navbar')?.offsetHeight ?? 68;
      window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - offset, behavior: 'smooth' });
    });
  });
}

/* ── Min Pickup Date ────────────────────────── */
function setMinDate() {
  const input = document.getElementById('bdate');
  if (!input) return;
  const d = new Date();
  d.setDate(d.getDate() + 1);
  input.min = d.toISOString().split('T')[0];
}

/* ── Active Nav Links ───────────────────────── */
function initActiveNav() {
  const sections = document.querySelectorAll('section[id]');
  const links    = document.querySelectorAll('.nav-links a[href^="#"]:not(.btn-nav):not(.btn-login):not(.btn-user)');

  new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const link = document.querySelector(`.nav-links a[href="#${entry.target.id}"]`);
      if (!link) return;
      if (entry.isIntersecting) {
        links.forEach(l => l.style.color = '');
        link.style.color = '#2563eb';
      } else {
        link.style.color = '';
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' })
    .observe
    ? sections.forEach(s =>
        new IntersectionObserver(entries => {
          entries.forEach(entry => {
            const link = document.querySelector(`.nav-links a[href="#${entry.target.id}"]`);
            if (!link) return;
            if (entry.isIntersecting) {
              links.forEach(l => l.style.color = '');
              link.style.color = '#2563eb';
            } else { link.style.color = ''; }
          });
        }, { rootMargin: '-40% 0px -55% 0px' }).observe(s)
      )
    : null;
}
