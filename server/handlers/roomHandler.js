// In-memory store for testing phase
const rooms = new Map();
let activeMeetingRoom = null; // Track the current coach-created room
let coachSocketId = null;

const roomHandler = (io, socket) => {
  // Broadcast initial status on connect
  socket.emit('meeting-status', activeMeetingRoom);
  socket.emit('coach-status', !!coachSocketId);

  // Create Room
  socket.on('create-room', ({ roomCode, teacherName }) => {
    try {
      console.log(`[SOCKET] create-room received for ${roomCode}`);
      
      activeMeetingRoom = roomCode;
      coachSocketId = socket.id;
      io.emit('meeting-status', activeMeetingRoom);
      io.emit('coach-status', true);

      let room;
      if (rooms.has(roomCode)) {
        room = rooms.get(roomCode);
        // If teacher is reconnecting, update their socket ID
        room.teacher = { id: socket.id, name: teacherName };
      } else {
        // In-memory room creation
        room = {
          id: Math.random().toString(36).substring(7),
          code: roomCode,
          teacher: { id: socket.id, name: teacherName },
          students: [],
          activePuzzle: null,
          messages: [],
          createdAt: new Date()
        };
        rooms.set(roomCode, room);
      }
      
      socket.data.userId = socket.id;
      socket.data.userName = teacherName;
      socket.data.role = 'teacher';
      socket.data.roomId = room.id;
      socket.data.roomCode = roomCode;

      socket.join(roomCode);
      
      // Send initial data to teacher for recovery
      socket.emit('room-joined', { 
        roomId: room.id,
        roomCode,
        userData: { id: socket.id, name: teacherName, role: 'teacher' },
        roomData: {
          activePuzzle: room.activePuzzle ? {
            ...room.activePuzzle,
            timeLeft: Math.max(0, Math.floor((room.activePuzzle.endTime - Date.now()) / 1000))
          } : null,
          messages: room.messages,
          students: room.students
        }
      });

      socket.emit('room-created', { roomId: room.id, roomCode });
      console.log(`[TEST MODE] Room ${rooms.has(roomCode) ? 'recovered' : 'created'}: ${roomCode} by ${teacherName}`);
    } catch (error) {
      console.error('Create room error:', error);
      socket.emit('error', { message: 'Failed to create room' });
    }
  });

  // Teacher Control: Lock Room
  socket.on('lock-room', ({ roomCode, lock }) => {
    if (socket.id !== coachSocketId) return;
    const room = rooms.get(roomCode);
    if (room) {
      room.locked = lock;
      io.to(roomCode).emit('room-locked', lock);
      console.log(`[ROOM] ${roomCode} ${lock ? 'Locked' : 'Unlocked'}`);
    }
  });

  // Teacher Control: Kick Student
  socket.on('kick-student', ({ roomCode, studentId }) => {
    if (socket.id !== coachSocketId) return;
    const room = rooms.get(roomCode);
    if (room) {
      io.to(studentId).emit('kicked');
      const kickedSocket = io.sockets.sockets.get(studentId);
      if (kickedSocket) kickedSocket.leave(roomCode);
      
      room.students = room.students.filter(s => s.id !== studentId);
      io.to(roomCode).emit('leaderboard-update', room.students);
      console.log(`[ROOM] Student ${studentId} kicked from ${roomCode}`);
    }
  });

  // Join Room with Security Checks
  socket.on('join-room', ({ roomCode, userName }) => {
    // 1. Sanitize inputs
    const cleanRoomCode = roomCode?.toString().toUpperCase().trim();
    const cleanUserName = userName?.toString().trim().substring(0, 25);

    if (!cleanRoomCode || !cleanUserName) {
      return socket.emit('error', 'Invalid room code or name');
    }

    const room = rooms.get(cleanRoomCode);
    if (!room) {
      return socket.emit('error', 'Room not found');
    }

    // 2. Check if room is locked
    if (room.locked) {
      return socket.emit('error', 'Room is locked by the teacher');
    }

    // 3. Prevent duplicate names in same room
    const nameExists = room.students.some(s => s.name === cleanUserName);
    if (nameExists) {
      return socket.emit('error', 'Name already taken in this room');
    }

    const studentData = {
      id: socket.id,
      name: cleanUserName,
      role: 'student',
      score: 0,
      joinedAt: new Date()
    };

    socket.join(cleanRoomCode);
    socket.data = { roomCode: cleanRoomCode, userName: cleanUserName, role: 'student' };
    room.students.push(studentData);

    // Acknowledge join with full room state (Persistence)
    socket.emit('room-joined', {
      roomId: room.id,
      roomCode: cleanRoomCode,
      userData: studentData,
      roomData: {
        activePuzzle: room.activePuzzle,
        messages: room.messages,
        students: room.students,
        teacher: room.teacher,
        puzzleHistory: room.puzzleHistory || [],
        locked: room.locked
      }
    });

    socket.to(cleanRoomCode).emit('student-joined', { student: studentData });
    console.log(`[ROOM] ${cleanUserName} joined ${cleanRoomCode}`);
  });

  // Chat message
  socket.on('send-message', ({ roomCode, message }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const msgData = { 
      id: Date.now().toString(), 
      text: message, 
      sender: socket.data.userName, 
      timestamp: new Date().toLocaleTimeString() 
    };
    
    room.messages.push(msgData);
    io.to(roomCode).emit('receive-message', msgData);
  });

  // End Meeting
  socket.on('end-meeting', ({ roomCode }) => {
    if (socket.id === coachSocketId) {
      activeMeetingRoom = null;
      io.emit('meeting-status', null);
      io.to(roomCode).emit('puzzle-ended'); // Close any active puzzles
      console.log(`[TEST MODE] Meeting ended by coach in ${roomCode}`);
    }
  });

  // WebRTC Signaling Relay
  socket.on('webrtc-signal', ({ to, signal }) => {
    // console.log(`[WEBRTC] Signal from ${socket.id} to ${to}`);
    io.to(to).emit('webrtc-signal', {
      from: socket.id,
      fromName: socket.data.userName, // Include the sender's name
      signal
    });
  });

  // Teacher Controls: Mute All
  socket.on('mute-all', ({ roomCode }) => {
    if (socket.id === coachSocketId) {
      io.to(roomCode).emit('teacher-command', { type: 'MUTE_ALL' });
      console.log(`[COMMAND] Mute All issued in ${roomCode}`);
    }
  });

  // Student Action: Raise Hand
  socket.on('raise-hand', ({ roomCode }) => {
    const { userName } = socket.data;
    io.to(roomCode).emit('student-action', { 
      type: 'RAISE_HAND', 
      studentId: socket.id, 
      studentName: userName 
    });
    console.log(`[ACTION] ${userName} raised hand in ${roomCode}`);
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    const { roomCode, userName, role } = socket.data;

    if (socket.id === coachSocketId) {
      coachSocketId = null;
      io.emit('coach-status', false);
    }

    if (roomCode && rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      
      // Notify other peers in the room that this user has left
      socket.to(roomCode).emit('peer-left', { id: socket.id });

      if (role === 'student') {
        console.log(`[TEST MODE] Student ${userName} disconnected from ${roomCode}`);
      } else {
        console.log(`[TEST MODE] Teacher ${userName} disconnected from ${roomCode}`);
      }
    }
  });
};

module.exports = roomHandler;
module.exports.rooms = rooms; // Export for puzzleHandler
