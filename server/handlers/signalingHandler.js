/**
 * signalingHandler.js
 * Handles WebRTC signaling relay between peers.
 * Using a simple relay methodology to allow P2P mesh connectivity.
 */

const signalingHandler = (io, socket) => {
  // Relay WebRTC signaling data (offer, answer, ice-candidate)
  socket.on('webrtc-signal', ({ to, signal }) => {
    // We include the sender's info so the receiver knows who is connecting
    io.to(to).emit('webrtc-signal', {
      from: socket.id,
      fromName: socket.data.userName,
      signal
    });
  });

  // Notify others when a user explicitly leaves or disconnects
  // This is handled in roomHandler but can be augmented here if needed
};

module.exports = signalingHandler;
