export const initialState = {
  room: null,
  roomCode: null,
  students: [],
  activePuzzle: null,
  messages: [],
  leaderboard: [],
  loading: false,
  error: null,
  connected: false,
  activeRoom: null, // Track globally if a meeting is live
  coachOnline: false,
};

export const roomReducer = (state, action) => {
  switch (action.type) {
    case 'SET_ACTIVE_ROOM':
      return { ...state, activeRoom: action.payload };
    case 'SET_COACH_STATUS':
      return { ...state, coachOnline: action.payload };
    case 'SET_CONNECTION':
      return { ...state, connected: action.payload };
    case 'SET_ROOM':
      return { 
        ...state, 
        room: action.payload.roomId, 
        roomCode: action.payload.roomCode,
        loading: false 
      };
    case 'SET_INITIAL_DATA':
      return {
        ...state,
        room: action.payload.roomId,
        roomCode: action.payload.roomCode,
        activePuzzle: action.payload.roomData.activePuzzle,
        messages: action.payload.roomData.messages || [],
        students: action.payload.roomData.students || [],
        leaderboard: action.payload.roomData.students || [],
      };
    case 'STUDENT_JOINED':
      return {
        ...state,
        students: action.payload.students,
        leaderboard: action.payload.students,
      };
    case 'STUDENT_LEFT':
      return {
        ...state,
        students: action.payload.students,
        leaderboard: action.payload.students,
      };
    case 'PUZZLE_STARTED':
      return {
        ...state,
        activePuzzle: action.payload,
      };
    case 'PUZZLE_ENDED':
      return {
        ...state,
        activePuzzle: null,
      };
    case 'LEADERBOARD_UPDATE':
      return {
        ...state,
        leaderboard: action.payload,
      };
    case 'RECEIVE_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
      };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'RESET_ROOM':
      return initialState;
    default:
      return state;
  }
};
