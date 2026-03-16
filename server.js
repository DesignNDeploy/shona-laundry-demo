/**
 * Shona Laundry – Real-Time Full Stack Server v2.0
 * ─────────────────────────────────────────────────
 * Stack : Node.js + Express + Socket.io + MongoDB + JWT + bcrypt
 * Port  : 3001
 * Run   : node server.js
 *
 * REAL-TIME FLOW:
 * User books → Socket.io fires → Manager + Admin dashboards
 *              update INSTANTLY with popup + sound alert
 */

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');

const app        = express();
const httpServer = http.createServer(app);

/* ══════════════════════════════════════════
   SOCKET.IO SETUP
══════════════════════════════════════════ */
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET','POST','PATCH','DELETE'] }
});

// Map: userId (string) → socketId
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  // Client registers with their userId + role after login
  socket.on('register', ({ userId, role }) => {
    if (!userId) return;
    connectedUsers.set(String(userId), socket.id);
    socket.join(role);                    // room: 'admin', 'manager', 'user'
    socket.join('user_' + userId);        // personal room
    console.log(`✅ ${role} [${userId}] registered socket ${socket.id}`);

    // Tell client they are connected
    socket.emit('registered', { ok: true, role });
  });

  socket.on('disconnect', () => {
    connectedUsers.forEach((sid, uid) => {
      if (sid === socket.id) {
        connectedUsers.delete(uid);
        console.log('❌ Disconnected:', socket.id);
      }
    });
  });
});

// Helper: emit to a specific role room
function emitToRole(role, event, data) {
  io.to(role).emit(event, data);
  console.log(`📡 Emitted ${event} to all ${role}s`);
}

// Helper: emit to a specific user
function emitToUser(userId, event, data) {
  io.to('user_' + String(userId)).emit(event, data);
}

/* ══════════════════════════════════════════
   MONGODB CONNECTION
══════════════════════════════════════════ */
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/shona_laundry';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected:', MONGO_URI))
  .catch(err => {
    console.log('⚠️  MongoDB not available. Using in-memory store.');
    console.log('   To use MongoDB: set MONGO_URI in .env file');
  });

/* ══════════════════════════════════════════
   MONGOOSE MODELS
══════════════════════════════════════════ */

// ── User Model ──
const UserSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:        { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true },
  role:         { type: String, enum: ['user','manager','admin'], default: 'user' },
  address:      { type: String, default: '' },
  active:       { type: Boolean, default: true },
  membership: {
    active:         { type: Boolean, default: false },
    cashbackEarned: { type: Number, default: 0 },
    startDate:      { type: Date, default: null },
  },
  addedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt:    { type: Date, default: Date.now },
}, { timestamps: true });

// ── Booking Model ──
const BookingSchema = new mongoose.Schema({
  orderId:      { type: String, unique: true },
  customer:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerName: { type: String },
  customerPhone:{ type: String },
  manager:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  serviceType:  { type: String, required: true },
  items:        [{ name: String, quantity: Number, price: Number }],
  totalAmount:  { type: Number, required: true },
  pickupAddress:{ type: String, required: true },
  pickupDate:   { type: Date, required: true },
  pickupTimeSlot:{ type: String, required: true },
  notes:        { type: String, default: '' },
  status: {
    type: String,
    enum: ['booked','pickup_scheduled','picked_up','washing','ironing','ready','out_for_delivery','delivered','cancelled'],
    default: 'booked'
  },
  statusHistory: [{
    status:    String,
    note:      String,
    updatedBy: String,
    time:      { type: Date, default: Date.now }
  }],
  paymentStatus: { type: String, enum: ['pending','paid'], default: 'pending' },
  paymentMethod: { type: String, default: 'cash' },
  rating:       { type: Number, default: null },
}, { timestamps: true });

// Auto-generate orderId before save
BookingSchema.pre('save', async function(next) {
  if (!this.orderId) {
    const count = await mongoose.model('Booking').countDocuments();
    this.orderId = 'SL-' + new Date().getFullYear() + '-' + String(count + 1).padStart(4,'0');
  }
  next();
});

// ── Notification Model ──
const NotificationSchema = new mongoose.Schema({
  recipient:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  recipientRole:{ type: String }, // 'user','manager','admin' — for broadcast
  type:         { type: String, default: 'new_booking' },
  title:        { type: String, required: true },
  message:      { type: String, required: true },
  data:         { type: Object, default: {} },
  isRead:       { type: Boolean, default: false },
  createdAt:    { type: Date, default: Date.now },
});

const User         = mongoose.model('User', UserSchema);
const Booking      = mongoose.model('Booking', BookingSchema);
const Notification = mongoose.model('Notification', NotificationSchema);

/* ══════════════════════════════════════════
   IN-MEMORY FALLBACK (when MongoDB is offline)
══════════════════════════════════════════ */
const SALT = 10;
const JWT_SECRET  = process.env.JWT_SECRET  || 'shona_laundry_secret_2026';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

// Fallback memory store
let memUsers = [
  { _id:'1', name:'Admin Shona',  email:'admin@shona.com',   phone:'9999999999', passwordHash: bcrypt.hashSync('admin123',SALT), role:'admin',   active:true, createdAt: new Date('2026-01-01'), address:'Teen Batti, Ujjain' },
  { _id:'2', name:'Ravi Manager', email:'manager@shona.com', phone:'9812345678', passwordHash: bcrypt.hashSync('mgr123',SALT),   role:'manager', active:true, createdAt: new Date('2026-01-10'), address:'Freeganj, Ujjain' },
  { _id:'3', name:'Priya Sharma', email:'user@shona.com',    phone:'9876543210', passwordHash: bcrypt.hashSync('user123',SALT),  role:'user',    active:true, createdAt: new Date('2026-02-01'), address:'Mahakal Road, Ujjain' },
];
let memBookings      = [];
let memNotifications = [];
let memIdCounter     = 100;

function isMongoDB() { return mongoose.connection.readyState === 1; }

/* ══════════════════════════════════════════
   MIDDLEWARE
══════════════════════════════════════════ */
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Auth Middleware ──
function verifyToken(req, res, next) {
  const auth  = req.headers['authorization'];
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ success:false, message:'No token provided.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ success:false, message:'Invalid or expired token.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ success:false, message:`Access denied. Required: ${roles.join(' or ')}.` });
    next();
  };
}

/* ══════════════════════════════════════════
   ROUTES
══════════════════════════════════════════ */

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Shona Laundry Real-Time API v2.0 🫧',
    mongodb: isMongoDB() ? 'connected' : 'offline (using memory)',
    sockets: connectedUsers.size + ' users online',
    time: new Date()
  });
});

/* ─────────────────────────────
   AUTH ROUTES
───────────────────────────── */

// ── REGISTER ──
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password, address } = req.body;

    if (!name || !email || !phone || !password)
      return res.status(400).json({ success:false, message:'All fields are required.' });

    if (password.length < 6)
      return res.status(400).json({ success:false, message:'Password must be at least 6 characters.' });

    if (!/^[6-9]\d{9}$/.test(phone.replace(/[\s+\-()]/g,'')))
      return res.status(400).json({ success:false, message:'Enter a valid 10-digit Indian phone number.' });

    const passwordHash = await bcrypt.hash(password, SALT);

    if (isMongoDB()) {
      const exists = await User.findOne({ $or: [{ email:email.toLowerCase() }, { phone }] });
      if (exists) return res.status(400).json({ success:false, message:'Account with this email or phone already exists.' });

      const user = await User.create({ name:name.trim(), email:email.toLowerCase().trim(), phone:phone.trim(), passwordHash, address:address||'' });
      return res.status(201).json({ success:true, message:'Registration successful! Please login.', userId: user._id });
    }

    // Memory fallback
    const exists = memUsers.find(u => u.email === email.toLowerCase() || u.phone === phone);
    if (exists) return res.status(400).json({ success:false, message:'Account with this email or phone already exists.' });

    const newUser = {
      _id: String(++memIdCounter), name:name.trim(), email:email.toLowerCase().trim(),
      phone:phone.trim(), passwordHash, role:'user', active:true,
      address: address||'', createdAt: new Date(),
      membership:{ active:false, cashbackEarned:0 }
    };
    memUsers.push(newUser);
    res.status(201).json({ success:true, message:'Registration successful! Please login.' });

  } catch (err) {
    console.error('Register error:', err);
    if (err.code === 11000) return res.status(400).json({ success:false, message:'Email or phone already registered.' });
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

// ── LOGIN ──
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success:false, message:'Email and password required.' });

    let user;
    if (isMongoDB()) {
      user = await User.findOne({ $or: [{ email:email.toLowerCase().trim() }, { phone:email.trim() }], active:true }).lean();
    } else {
      user = memUsers.find(u => (u.email === email.toLowerCase().trim() || u.phone === email.trim()) && u.active);
    }

    if (!user) return res.status(401).json({ success:false, message:'No account found with this email or phone.' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ success:false, message:'Incorrect password. Please try again.' });

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET, { expiresIn: JWT_EXPIRES }
    );

    const redirects = { admin:'admin/index.html', manager:'manager/index.html', user:'user/index.html' };

    res.json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      token,
      user: { id:user._id, name:user.name, email:user.email, phone:user.phone, role:user.role, address:user.address||'' },
      redirect: redirects[user.role],
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

// ── VERIFY TOKEN ──
app.get('/api/auth/verify', verifyToken, async (req, res) => {
  try {
    let user;
    if (isMongoDB()) {
      user = await User.findById(req.user.id).select('-passwordHash').lean();
    } else {
      user = memUsers.find(u => String(u._id) === String(req.user.id));
    }
    if (!user) return res.status(401).json({ success:false, message:'User not found.' });
    res.json({ success:true, user: { id:user._id, name:user.name, email:user.email, phone:user.phone, role:user.role } });
  } catch {
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

/* ─────────────────────────────
   BOOKING ROUTES
───────────────────────────── */

// ── CREATE BOOKING (User) — REAL-TIME TRIGGER ──
app.post('/api/bookings', verifyToken, requireRole('user'), async (req, res) => {
  try {
    const { serviceType, items, totalAmount, pickupAddress, pickupDate, pickupTimeSlot, notes, paymentMethod } = req.body;

    if (!serviceType || !totalAmount || !pickupAddress || !pickupDate || !pickupTimeSlot)
      return res.status(400).json({ success:false, message:'Missing required booking fields.' });

    let booking;

    if (isMongoDB()) {
      const customer = await User.findById(req.user.id).lean();
      booking = await Booking.create({
        customer:      req.user.id,
        customerName:  customer.name,
        customerPhone: customer.phone,
        serviceType, items, totalAmount,
        pickupAddress, pickupDate, pickupTimeSlot,
        notes: notes||'',
        paymentMethod: paymentMethod||'cash',
        statusHistory: [{ status:'booked', note:'Booking created', updatedBy: customer.name, time: new Date() }],
      });
      booking = await Booking.findById(booking._id).populate('customer','name email phone').lean();
    } else {
      // Memory fallback
      const customer = memUsers.find(u => String(u._id) === String(req.user.id));
      const count = memBookings.length;
      booking = {
        _id: String(++memIdCounter),
        orderId: 'SL-' + new Date().getFullYear() + '-' + String(count+1).padStart(4,'0'),
        customer: { _id: customer._id, name: customer.name, email: customer.email, phone: customer.phone },
        customerName: customer.name,
        customerPhone: customer.phone,
        serviceType, items, totalAmount,
        pickupAddress, pickupDate, pickupTimeSlot,
        notes: notes||'',
        paymentMethod: paymentMethod||'cash',
        status: 'booked',
        statusHistory: [{ status:'booked', note:'Booking created', updatedBy:customer.name, time:new Date() }],
        paymentStatus: 'pending',
        createdAt: new Date(),
      };
      memBookings.push(booking);
    }

    // ══ REAL-TIME MAGIC: Fire socket events to ALL managers and admins ══
    const notificationPayload = {
      type:        'NEW_BOOKING',
      orderId:     booking.orderId,
      bookingId:   booking._id,
      customerName: booking.customerName,
      customerPhone:booking.customerPhone,
      serviceType:  booking.serviceType,
      pickupAddress:booking.pickupAddress,
      pickupDate:   booking.pickupDate,
      pickupTimeSlot:booking.pickupTimeSlot,
      totalAmount:  booking.totalAmount,
      timestamp:    new Date(),
    };

    // Instant notification to EVERY connected manager
    emitToRole('manager', 'NEW_BOOKING', notificationPayload);

    // Instant notification to EVERY connected admin
    emitToRole('admin', 'NEW_BOOKING', notificationPayload);

    // Confirmation back to the user
    emitToUser(req.user.id, 'BOOKING_CONFIRMED', {
      orderId:  booking.orderId,
      status:   'booked',
      message:  'Your booking is confirmed! We will contact you shortly.',
    });

    // Save notification records (if MongoDB available)
    if (isMongoDB()) {
      const managers = await User.find({ role:'manager', active:true }).select('_id').lean();
      const admins   = await User.find({ role:'admin',   active:true }).select('_id').lean();
      const notifDocs = [...managers, ...admins].map(u => ({
        recipient:     u._id,
        recipientRole: 'manager_admin',
        type:          'new_booking',
        title:         '🆕 New Booking Received!',
        message:       `${booking.customerName} booked ${booking.serviceType} — Order ${booking.orderId}`,
        data:          notificationPayload,
        isRead:        false,
      }));
      await Notification.insertMany(notifDocs).catch(()=>{});
    }

    res.status(201).json({ success:true, message:'Booking created successfully!', booking });

  } catch (err) {
    console.error('Create booking error:', err);
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

// ── GET USER'S BOOKINGS ──
app.get('/api/bookings/my', verifyToken, requireRole('user'), async (req, res) => {
  try {
    let bookings;
    if (isMongoDB()) {
      bookings = await Booking.find({ customer: req.user.id }).sort({ createdAt:-1 }).lean();
    } else {
      bookings = memBookings.filter(b => String(b.customer?._id||b.customer) === String(req.user.id)).reverse();
    }
    res.json({ success:true, bookings });
  } catch {
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

// ── GET ALL BOOKINGS (Manager / Admin) ──
app.get('/api/bookings', verifyToken, requireRole('manager','admin'), async (req, res) => {
  try {
    let bookings;
    if (isMongoDB()) {
      bookings = await Booking.find().sort({ createdAt:-1 })
        .populate('customer','name email phone').lean();
    } else {
      bookings = [...memBookings].reverse();
    }
    res.json({ success:true, bookings });
  } catch {
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

// ── UPDATE BOOKING STATUS (Manager / Admin) — REAL-TIME ──
app.patch('/api/bookings/:id/status', verifyToken, requireRole('manager','admin'), async (req, res) => {
  try {
    const { status, note } = req.body;
    const validStatuses = ['booked','pickup_scheduled','picked_up','washing','ironing','ready','out_for_delivery','delivered','cancelled'];
    if (!validStatuses.includes(status))
      return res.status(400).json({ success:false, message:'Invalid status.' });

    let booking;
    if (isMongoDB()) {
      booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ success:false, message:'Booking not found.' });
      booking.status = status;
      booking.statusHistory.push({ status, note:note||'', updatedBy: req.user.name, time:new Date() });
      await booking.save();
    } else {
      booking = memBookings.find(b => b._id === req.params.id || b.orderId === req.params.id);
      if (!booking) return res.status(404).json({ success:false, message:'Booking not found.' });
      booking.status = status;
      booking.statusHistory.push({ status, note:note||'', updatedBy:req.user.name, time:new Date() });
    }

    // ══ REAL-TIME: Notify the customer their order status changed ══
    const statusPayload = {
      type:      'STATUS_UPDATE',
      orderId:   booking.orderId,
      bookingId: booking._id,
      newStatus: status,
      note:      note||'',
      updatedBy: req.user.name,
      timestamp: new Date(),
    };

    const customerId = booking.customer?._id || booking.customer;
    emitToUser(customerId, 'ORDER_STATUS_UPDATED', statusPayload);
    // Also update admin
    emitToRole('admin', 'ORDER_STATUS_UPDATED', statusPayload);

    res.json({ success:true, message:'Status updated!', booking });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

/* ─────────────────────────────
   NOTIFICATION ROUTES
───────────────────────────── */

// ── GET NOTIFICATIONS for logged-in user ──
app.get('/api/notifications', verifyToken, async (req, res) => {
  try {
    let notifications;
    if (isMongoDB()) {
      notifications = await Notification.find({ recipient: req.user.id }).sort({ createdAt:-1 }).limit(50).lean();
    } else {
      notifications = memNotifications.filter(n => n.recipient === String(req.user.id)).reverse().slice(0,50);
    }
    const unread = notifications.filter(n => !n.isRead).length;
    res.json({ success:true, notifications, unread });
  } catch {
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

// ── MARK NOTIFICATION AS READ ──
app.patch('/api/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    if (isMongoDB()) {
      await Notification.findByIdAndUpdate(req.params.id, { isRead:true });
    } else {
      const n = memNotifications.find(n => n._id === req.params.id);
      if (n) n.isRead = true;
    }
    res.json({ success:true });
  } catch {
    res.status(500).json({ success:false });
  }
});

// ── MARK ALL READ ──
app.patch('/api/notifications/read-all', verifyToken, async (req, res) => {
  try {
    if (isMongoDB()) {
      await Notification.updateMany({ recipient: req.user.id }, { isRead:true });
    } else {
      memNotifications.filter(n => n.recipient === String(req.user.id)).forEach(n => n.isRead = true);
    }
    res.json({ success:true });
  } catch {
    res.status(500).json({ success:false });
  }
});

/* ─────────────────────────────
   ADMIN ROUTES
───────────────────────────── */

// ── GET ALL USERS ──
app.get('/api/admin/users', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    let users;
    if (isMongoDB()) {
      users = await User.find().select('-passwordHash').sort({ createdAt:-1 }).lean();
    } else {
      users = memUsers.map(u => ({ ...u, passwordHash: undefined }));
    }
    res.json({ success:true, users });
  } catch {
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

// ── GET ALL MANAGERS ──
app.get('/api/admin/managers', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    let managers;
    if (isMongoDB()) {
      managers = await User.find({ role:'manager' }).select('-passwordHash').lean();
    } else {
      managers = memUsers.filter(u => u.role === 'manager').map(u => ({ ...u, passwordHash:undefined }));
    }
    res.json({ success:true, managers });
  } catch {
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

// ── ADD MANAGER ──
app.post('/api/admin/managers', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name||!email||!phone||!password)
      return res.status(400).json({ success:false, message:'All fields required.' });
    if (password.length < 6)
      return res.status(400).json({ success:false, message:'Password must be at least 6 characters.' });

    const passwordHash = await bcrypt.hash(password, SALT);

    if (isMongoDB()) {
      const exists = await User.findOne({ $or:[{ email:email.toLowerCase() },{ phone }] });
      if (exists) return res.status(400).json({ success:false, message:'Email or phone already exists.' });
      const mgr = await User.create({ name, email:email.toLowerCase(), phone, passwordHash, role:'manager', addedBy:req.user.id });
      return res.status(201).json({ success:true, message:`Manager "${name}" added!`, manager:{ id:mgr._id, name:mgr.name, email:mgr.email } });
    }

    const exists = memUsers.find(u => u.email===email.toLowerCase()||u.phone===phone);
    if (exists) return res.status(400).json({ success:false, message:'Email or phone already exists.' });
    const mgr = { _id:String(++memIdCounter), name, email:email.toLowerCase(), phone, passwordHash, role:'manager', active:true, createdAt:new Date(), address:'' };
    memUsers.push(mgr);
    res.status(201).json({ success:true, message:`Manager "${name}" added!`, manager:{ id:mgr._id, name:mgr.name, email:mgr.email } });
  } catch(err) {
    if (err.code===11000) return res.status(400).json({ success:false, message:'Email or phone already exists.' });
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

// ── REMOVE MANAGER ──
app.delete('/api/admin/managers/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    if (isMongoDB()) {
      const mgr = await User.findOneAndUpdate({ _id:req.params.id, role:'manager' }, { active:false });
      if (!mgr) return res.status(404).json({ success:false, message:'Manager not found.' });
      return res.json({ success:true, message:`Manager "${mgr.name}" deactivated.` });
    }
    const mgr = memUsers.find(u => u._id===req.params.id && u.role==='manager');
    if (!mgr) return res.status(404).json({ success:false, message:'Manager not found.' });
    mgr.active = false;
    res.json({ success:true, message:`Manager "${mgr.name}" deactivated.` });
  } catch {
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

// ── ANALYTICS ──
app.get('/api/admin/analytics', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    if (isMongoDB()) {
      const [totalBookings, totalRevenue, totalUsers, totalManagers] = await Promise.all([
        Booking.countDocuments(),
        Booking.aggregate([{ $group:{ _id:null, total:{ $sum:'$totalAmount' } } }]),
        User.countDocuments({ role:'user' }),
        User.countDocuments({ role:'manager' }),
      ]);
      return res.json({ success:true, data:{ totalBookings, totalRevenue:totalRevenue[0]?.total||0, totalUsers, totalManagers } });
    }
    res.json({ success:true, data:{ totalBookings:memBookings.length, totalRevenue: memBookings.reduce((s,b)=>s+(b.totalAmount||0),0), totalUsers: memUsers.filter(u=>u.role==='user').length, totalManagers: memUsers.filter(u=>u.role==='manager').length } });
  } catch {
    res.status(500).json({ success:false, message:'Server error.' });
  }
});

/* ══════════════════════════════════════════
   START SERVER
══════════════════════════════════════════ */
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   Shona Laundry Real-Time Server v2.0 🫧     ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\n🌐 HTTP  : http://localhost:${PORT}`);
  console.log(`⚡ Socket: ws://localhost:${PORT}`);
  console.log(`🗄️  DB    : ${isMongoDB()?'MongoDB':'In-Memory (MongoDB offline)'}`);
  console.log('\n📋 REST Endpoints:');
  console.log('   POST /api/auth/register');
  console.log('   POST /api/auth/login');
  console.log('   GET  /api/auth/verify');
  console.log('   POST /api/bookings         ← triggers real-time notification');
  console.log('   GET  /api/bookings');
  console.log('   PATCH /api/bookings/:id/status');
  console.log('   GET  /api/notifications');
  console.log('   GET  /api/admin/managers');
  console.log('   POST /api/admin/managers');
  console.log('\n⚡ Socket Events:');
  console.log('   NEW_BOOKING         → manager + admin rooms');
  console.log('   ORDER_STATUS_UPDATED → user + admin rooms');
  console.log('   BOOKING_CONFIRMED   → user personal room');
  console.log('\n🔐 Demo Credentials:');
  console.log('   Admin  : admin@shona.com   / admin123');
  console.log('   Manager: manager@shona.com / mgr123');
  console.log('   User   : user@shona.com    / user123');
  console.log('\n✅ Server ready!\n');
});
