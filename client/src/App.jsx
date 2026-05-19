import React, { useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import AppRoutes from './routes';
import { socket } from './socket';

function App() {
  useEffect(() => {
    // Connect socket on initial load to receive global meeting status
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;
