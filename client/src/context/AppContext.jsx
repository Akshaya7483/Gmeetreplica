import React, { createContext, useContext, useState, useEffect, useReducer, useCallback, useRef } from 'react';
import { socket, connectSocket, disconnectSocket } from '../socket';
import { roomReducer, initialState } from './roomReducer';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  
  const [state, dispatch] = useReducer(roomReducer, initialState);
  const listenersAttachedRef = useRef(false);
  const roomCodeRef = useRef(null);

  // Keep ref in sync for socket recovery without re-attaching listeners
  useEffect(() => {
    roomCodeRef.current = state.roomCode;
  }, [state.roomCode]);

  // Persistence for user
  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
      connectSocket();
    } else {
      localStorage.removeItem('user');
      disconnectSocket();
    }
  }, [user]);

  // Socket event handlers memoized
  const handleStudentJoined = useCallback((data) => {
    console.log('[SOCKET] student-joined received');
    dispatch({ type: 'STUDENT_JOINED', payload: data });
  }, []);

  const handleStudentLeft = useCallback((data) => {
    console.log('[SOCKET] student-left received');
    dispatch({ type: 'STUDENT_LEFT', payload: data });
  }, []);

  const handlePuzzleStarted = useCallback((puzzle) => {
    console.log('[SOCKET] puzzle-started received');
    dispatch({ type: 'PUZZLE_STARTED', payload: puzzle });
  }, []);

  const handlePuzzleEnded = useCallback(() => {
    console.log('[SOCKET] puzzle-ended received');
    dispatch({ type: 'PUZZLE_ENDED' });
  }, []);

  const handleLeaderboardUpdate = useCallback((newLeaderboard) => {
    console.log('[SOCKET] leaderboard-update received');
    dispatch({ type: 'LEADERBOARD_UPDATE', payload: newLeaderboard });
  }, []);

  const handleReceiveMessage = useCallback((message) => {
    console.log('[SOCKET] receive-message received');
    dispatch({ type: 'RECEIVE_MESSAGE', payload: message });
  }, []);

  const handleRoomJoined = useCallback((data) => {
    console.log('[SOCKET] room-joined received');
    dispatch({ type: 'SET_INITIAL_DATA', payload: data });
    // Don't overwrite role-based user data with basic socket data
  }, []);

  const handleMeetingStatus = useCallback((roomCode) => {
    console.log('[SOCKET] meeting-status received:', roomCode);
    dispatch({ type: 'SET_ACTIVE_ROOM', payload: roomCode });
  }, []);

  const handleCoachStatus = useCallback((isOnline) => {
    console.log('[SOCKET] coach-status received:', isOnline);
    dispatch({ type: 'SET_COACH_STATUS', payload: isOnline });
  }, []);

  const handleError = useCallback((error) => {
    console.error('[SOCKET] error received:', error.message);
    dispatch({ type: 'SET_ERROR', payload: error.message });
  }, []);

  const handleConnect = useCallback(() => {
    console.log('[SOCKET] Connected to server');
    dispatch({ type: 'SET_CONNECTION', payload: true });
    
    // Recovery logic using refs to avoid stale state in the effect
    const savedRoom = roomCodeRef.current;
    if (savedRoom && user) {
      console.log('[SOCKET] Attempting reconnection recovery for room:', savedRoom);
      if (user.role === 'teacher') {
        socket.emit('create-room', { roomCode: savedRoom, teacherName: user.name });
      } else {
        socket.emit('join-room', { roomCode: savedRoom, studentName: user.name });
      }
    }
  }, [user]);

  const handleDisconnect = useCallback(() => {
    console.log('[SOCKET] Disconnected from server');
    dispatch({ type: 'SET_CONNECTION', payload: false });
  }, []);

  useEffect(() => {
    if (listenersAttachedRef.current) return;
    
    console.log('[SOCKET] Attaching listeners');
    listenersAttachedRef.current = true;

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('student-joined', handleStudentJoined);
    socket.on('student-left', handleStudentLeft);
    socket.on('puzzle-started', handlePuzzleStarted);
    socket.on('puzzle-ended', handlePuzzleEnded);
    socket.on('leaderboard-update', handleLeaderboardUpdate);
    socket.on('receive-message', handleReceiveMessage);
    socket.on('room-joined', handleRoomJoined);
    socket.on('meeting-status', handleMeetingStatus);
    socket.on('coach-status', handleCoachStatus);
    socket.on('error', handleError);

    return () => {
      console.log('[SOCKET] Detaching listeners');
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('student-joined', handleStudentJoined);
      socket.off('student-left', handleStudentLeft);
      socket.off('puzzle-started', handlePuzzleStarted);
      socket.off('puzzle-ended', handlePuzzleEnded);
      socket.off('leaderboard-update', handleLeaderboardUpdate);
      socket.off('receive-message', handleReceiveMessage);
      socket.off('room-joined', handleRoomJoined);
      socket.off('meeting-status', handleMeetingStatus);
      socket.off('coach-status', handleCoachStatus);
      socket.off('error', handleError);
      listenersAttachedRef.current = false;
    };
  }, [
    handleConnect,
    handleDisconnect,
    handleStudentJoined, 
    handleStudentLeft, 
    handlePuzzleStarted, 
    handlePuzzleEnded, 
    handleLeaderboardUpdate, 
    handleReceiveMessage, 
    handleRoomJoined, 
    handleError
  ]);

  const login = useCallback((userData) => setUser(userData), []);
  
  const logout = useCallback(() => {
    setUser(null);
    dispatch({ type: 'RESET_ROOM' });
    disconnectSocket();
  }, []);

  const value = React.useMemo(() => ({
    user,
    setUser: login,
    logout,
    ...state,
    dispatch
  }), [user, login, logout, state]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
