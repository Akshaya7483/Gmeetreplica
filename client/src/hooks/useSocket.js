import { useEffect } from 'react';
import { socket } from '../socket';

export const useSocket = (eventName, callback) => {
  useEffect(() => {
    socket.on(eventName, callback);

    return () => {
      socket.off(eventName, callback);
    };
  }, [eventName, callback]);

  const emit = (eventName, data) => {
    socket.emit(eventName, data);
  };

  return { emit };
};
