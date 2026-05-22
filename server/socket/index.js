const roomHandler = require('../handlers/roomHandler');
const puzzleHandler = require('../handlers/puzzleHandler');
const signalingHandler = require('../handlers/signalingHandler');
const rateLimiter = require('../middleware/rateLimiter');

const setupSocket = (io) => {
  // Socket middleware
  io.use(rateLimiter);

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Register Handlers
    roomHandler(io, socket);
    puzzleHandler(io, socket);
    signalingHandler(io, socket);

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });
};

module.exports = setupSocket;
