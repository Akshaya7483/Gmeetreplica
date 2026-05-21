const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const setupSocket = require('./socket');

dotenv.config();

const app = express();
const server = http.createServer(app);

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
  }
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    
    const normalizedOrigin = origin.replace(/\/$/, "");
    const isAllowed = allowedOrigins.some(o => normalizedOrigin === o) || 
                      origin.includes('ngrok-free.app') || 
                      origin.includes('onrender.com');
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.send('Realtime Classroom Server is running...');
});

// Setup Socket.io
setupSocket(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
