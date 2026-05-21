const { rooms } = require('./roomHandler');

const puzzleHandler = (io, socket) => {
  // Start Puzzle
  socket.on('start-puzzle', ({ roomCode, puzzleData }) => {
    try {
      console.log(`[SOCKET] start-puzzle received for ${roomCode}`);
      const room = rooms.get(roomCode);
      if (!room) return;

      room.activePuzzle = {
        ...puzzleData,
        id: Date.now().toString(),
        startTime: Date.now(),
        endTime: Date.now() + (puzzleData.duration * 1000),
        submissions: []
      };
      
      io.to(roomCode).emit('puzzle-started', room.activePuzzle);
      console.log(`[TEST MODE] Puzzle started in ${roomCode}`);
    } catch (error) {
      console.error('Start puzzle error:', error);
    }
  });

  // Submit Answer
  socket.on('submit-answer', ({ roomCode, answer }) => {
    try {
      console.log(`[SOCKET] submit-answer received for ${roomCode}`);
      const room = rooms.get(roomCode);
      if (!room || !room.activePuzzle) return;

      const student = room.students.find(s => s.id === socket.id);
      if (!student) return;

      // Prevent duplicate submissions for the same puzzle
      const existingSubmission = room.activePuzzle.submissions.find(s => s.studentName === student.name);
      if (existingSubmission) {
        console.log(`[SOCKET] Duplicate submission ignored for ${student.name}`);
        return;
      }

      const isCorrect = answer === room.activePuzzle.correctAnswer;
      if (isCorrect) {
        student.score += 10;
      }

      const submission = {
        studentId: socket.id,
        studentName: student.name,
        answer,
        isCorrect
      };

      room.activePuzzle.submissions.push(submission);

      // Notify everyone about submission (status update)
      io.to(roomCode).emit('submission-received', submission);
      
      // Update leaderboard (broadcasting to everyone in the room)
      const leaderboard = [...room.students].sort((a, b) => b.score - a.score);
      io.to(roomCode).emit('leaderboard-update', leaderboard);
      
      console.log(`[TEST MODE] Answer from ${student.name}: ${isCorrect ? 'Correct' : 'Incorrect'}`);
    } catch (error) {
      console.error('Submit answer error:', error);
    }
  });

  // End Puzzle
  socket.on('end-puzzle', ({ roomCode }) => {
    console.log(`[SOCKET] end-puzzle received for ${roomCode}`);
    const room = rooms.get(roomCode);
    if (room) room.activePuzzle = null;
    io.to(roomCode).emit('puzzle-ended');
  });
};

module.exports = puzzleHandler;
