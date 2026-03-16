# Shona Laundry — How to Run the Real-Time System

## Step 1 — Install dependencies
```bash
cd shona-laundry
npm install
```

## Step 2 — (Optional) Set up MongoDB
- Free cloud DB: https://mongodb.com/atlas
- Create cluster → get connection string
- Create `.env` file from `.env.example`
- Set MONGO_URI to your connection string
- **Without MongoDB**: Server still works using in-memory storage

## Step 3 — Start the server
```bash
node server.js
```
You will see:
```
╔══════════════════════════════════════════════╗
║   Shona Laundry Real-Time Server v2.0 🫧     ║
╚══════════════════════════════════════════════╝
🌐 HTTP  : http://localhost:3001
⚡ Socket: ws://localhost:3001
```

## Step 4 — Open website in Live Server (VS Code)
Right-click `index.html` → Open with Live Server
```
http://127.0.0.1:5500/index.html
```

## Step 5 — Test Real-Time Flow

### Open 3 browser windows:
```
Window 1: 127.0.0.1:5500/index.html          ← Home (login as user)
Window 2: 127.0.0.1:5500/manager/index.html  ← Manager Dashboard
Window 3: 127.0.0.1:5500/admin/index.html    ← Admin Dashboard
```

### The Real-Time Flow:
1. Open Window 2 → Login as manager@shona.com / mgr123
2. Open Window 3 → Login as admin@shona.com / admin123
3. Open Window 1 → Visit website
4. After 4 seconds → Login popup appears
5. Click "Create Account" → Register a new account
6. After registration → Redirected to login
7. Login with your new account
8. Redirected to User Dashboard
9. Go to "Book Pickup" → Fill form → Submit

### INSTANTLY (without page refresh):
- ✅ Window 2 (Manager) shows notification popup + sound
- ✅ Window 2 navigates to Pickups page with new booking row
- ✅ Window 3 (Admin) shows notification popup + sound
- ✅ Window 3 navigates to Bookings page with new booking row

## Demo Credentials
| Role    | Email               | Password  |
|---------|---------------------|-----------|
| User    | user@shona.com      | user123   |
| Manager | manager@shona.com   | mgr123    |
| Admin   | admin@shona.com     | admin123  |

## File Structure
```
shona-laundry/
├── index.html          ← Main website (auto login popup 4s)
├── register.html       ← New user registration
├── login.html          ← Login page
├── auth.js             ← JWT + Socket.io client module
├── script.js           ← Website JS
├── style.css           ← Styles
├── server.js           ← Node.js + Express + Socket.io + MongoDB
├── package.json        ← Dependencies
├── .env.example        ← Environment variables template
├── logo.jpeg           ← Client logo
├── admin/
│   └── index.html      ← Admin Dashboard (real-time)
├── manager/
│   └── index.html      ← Manager Dashboard (real-time)
└── user/
    └── index.html      ← User Dashboard (real-time booking)
```
