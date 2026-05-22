import { io } from 'socket.io-client';

const getSocketURL = () => {
  const envUrl = import.meta.env.VITE_SOCKET_URL;
  
  // If we are in production (on Render), and the env says localhost, ignore it
  if (window.location.hostname !== 'localhost' && (!envUrl || envUrl.includes('localhost'))) {
    return 'https://gmeetreplica.onrender.com';
  }
  
  return envUrl || 'https://gmeetreplica.onrender.com';
};

const SOCKET_URL = getSocketURL();

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

export const connectSocket = () => {
  if (!socket.connected) {
    socket.connect();
  }
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};
