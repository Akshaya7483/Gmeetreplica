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
  'https://gmeetreplica-frontend.onrender.com', // Your actual frontend URL
  'http://localhost:5173',
  'http://127.0.0.1:5173'
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.some(o => origin.startsWith(o)) || origin.includes('ngrok-free.app')) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o)) || origin.includes('ngrok-free.app')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  }
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
