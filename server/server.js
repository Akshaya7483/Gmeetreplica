const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const setupSocket = require('./socket');

dotenv.config();

const app = express();
const server = http.createServer(app);

// Health Check Endpoint for Deployment Monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date(), uptime: process.uptime() });
});

// Dynamic CORS configuration
const allowedOrigins = [
  process.env.CLIENT_URL,
  'https://gmeetreplica-frontend.onrender.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
].filter(Boolean).map(url => url.replace(/\/$/, "")); // Remove trailing slashes

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      
      const normalizedOrigin = origin.replace(/\/$/, "");
      const isAllowed = allowedOrigins.some(o => normalizedOrigin === o) || 
                        origin.includes('ngrok-free.app') || 
                        origin.includes('onrender.com'); // Allow all onrender.com subdomains for safety
      
      if (isAllowed) {
        callback(null, true);
      } else {
        console.log(`[CORS] Blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000, // Increase ping timeout for stable mobile connections
  pingInterval: 25000
});

// Production Error Handling & Environment Validation
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  // Graceful shutdown could be added here
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Setup Socket logic
setupSocket(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`[SERVER] Production-hardened server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

// Graceful Shutdown Handling
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('[SERVER] Closed out remaining connections.');
    process.exit(0);
  });
});

// Setup Socket.io
setupSocket(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
