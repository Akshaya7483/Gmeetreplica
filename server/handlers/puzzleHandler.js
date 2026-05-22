const { rooms } = require('./roomHandler');

const puzzleHandler = (io, socket) => {
  // Start Puzzle
  socket.on('start-puzzle', ({ roomCode, puzzleData }) => {
    try {
      const room = rooms.get(roomCode);
      if (!room) return;

      const puzzleId = Date.now().toString();
      room.activePuzzle = {
        ...puzzleData,
        id: puzzleId,
        startTime: Date.now(),
        endTime: Date.now() + (puzzleData.duration * 1000),
        submissions: []
      };
      
      // Initialize puzzle history if not exists
      if (!room.puzzleHistory) room.puzzleHistory = [];
      
      io.to(roomCode).emit('puzzle-started', room.activePuzzle);
      console.log(`[PUZZLE] Started in ${roomCode}: ${puzzleData.question}`);
    } catch (error) {
      console.error('Start puzzle error:', error);
    }
  });

  // Submit Answer
  socket.on('submit-answer', ({ roomCode, answer }) => {
    try {
      const room = rooms.get(roomCode);
      if (!room || !room.activePuzzle) return;

      const student = room.students.find(s => s.id === socket.id);
      if (!student) return;

      // Prevent duplicate submissions
      const alreadySubmitted = room.activePuzzle.submissions.some(s => s.studentId === socket.id);
      if (alreadySubmitted) return;

      const isCorrect = answer === room.activePuzzle.correctAnswer;
      if (isCorrect) {
        student.score = (student.score || 0) + 10;
      }

      const submission = {
        studentId: socket.id,
        studentName: student.name,
        answer,
        isCorrect,
        timestamp: new Date()
      };

      room.activePuzzle.submissions.push(submission);

      // Emit to everyone for real-time stats
      io.to(roomCode).emit('submission-received', submission);
      
      // Update leaderboard
      const leaderboard = [...room.students].sort((a, b) => (b.score || 0) - (a.score || 0));
      io.to(roomCode).emit('leaderboard-update', leaderboard);
      
      // Sync students list in room data
      room.students = leaderboard;
    } catch (error) {
      console.error('Submit answer error:', error);
    }
  });

  // End Puzzle - PERSIST RESULTS
  socket.on('end-puzzle', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.activePuzzle) return;

    // Save to history before clearing active
    const finalResults = {
      puzzleId: room.activePuzzle.id,
      question: room.activePuzzle.question,
      submissions: room.activePuzzle.submissions,
      endedAt: new Date(),
      stats: {
        total: room.activePuzzle.submissions.length,
        correct: room.activePuzzle.submissions.filter(s => s.isCorrect).length
      }
    };

    if (!room.puzzleHistory) room.puzzleHistory = [];
    room.puzzleHistory.push(finalResults);

    // Keep activePuzzle as null but send final results in the end event
    room.activePuzzle = null;
    io.to(roomCode).emit('puzzle-ended', { finalResults });
    console.log(`[PUZZLE] Ended in ${roomCode}. Results persisted.`);
  });
};

module.exports = puzzleHandler;
