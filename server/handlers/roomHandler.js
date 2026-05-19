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

  // Join Room
  socket.on('join-room', ({ roomCode, studentName }) => {
    try {
      console.log(`[SOCKET] join-room received for ${roomCode} by ${studentName}`);
      const room = rooms.get(roomCode);
      if (!room) {
        return socket.emit('error', { message: 'Room not found. Check the code.' });
      }

      // Check if student already in room (handle reconnect)
      let student = room.students.find(s => s.name === studentName);
      if (student) {
        student.id = socket.id; // Update ID for new socket
      } else {
        student = { id: socket.id, name: studentName, score: 0 };
        room.students.push(student);
      }

      socket.data.userId = socket.id;
      socket.data.userName = studentName;
      socket.data.role = 'student';
      socket.data.roomId = room.id;
      socket.data.roomCode = roomCode;

      socket.join(roomCode);

      // Fetch current state for late joiners
      const activePuzzle = room.activePuzzle ? {
        ...room.activePuzzle,
        timeLeft: Math.max(0, Math.floor((room.activePuzzle.endTime - Date.now()) / 1000)),
        hasSubmitted: room.activePuzzle.submissions.some(s => s.studentName === studentName)
      } : null;

      socket.emit('room-joined', { 
        roomId: room.id,
        roomCode,
        userData: { id: socket.id, name: studentName, role: 'student' },
        roomData: {
          activePuzzle,
          messages: room.messages,
          students: room.students,
          teacher: room.teacher // Include teacher info
        }
      });

      io.to(roomCode).emit('student-joined', { 
        student, 
        students: room.students 
      });
      
      console.log(`[TEST MODE] ${studentName} joined: ${roomCode}`);
    } catch (error) {
      console.error('Join room error:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
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
