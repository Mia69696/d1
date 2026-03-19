require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { Strategy } = require('passport-discord');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const logger = require('../src/utils/logger');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Trust Railway's proxy — THIS is what fixes the session on https
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'd1z-secret-fallback',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,   // required for https on Railway
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

app.use('/api/', rateLimit({ windowMs: 60000, max: 120 }));

passport.use(new Strategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_REDIRECT_URI,
  scope: ['identify', 'guilds'],
}, (accessToken, refreshToken, profile, done) => {
  profile.accessToken = accessToken;
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.use(passport.initialize());
app.use(passport.session());

const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
};

app.use('/auth', require('./routes/auth'));
app.use('/api', require('./routes/api'));
app.use('/', require('./routes/pages')(isAuthenticated));

io.on('connection', socket => {
  socket.on('join-guild', guildId => socket.join(`guild-${guildId}`));
});
global.io = io;

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'login.html')));
app.use((err, req, res, next) => { logger.error('Dashboard error:', err); res.status(500).json({ error: 'Internal server error' }); });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => logger.info(`🌐 Dashboard running on port ${PORT}`));
module.exports = { app, io };
