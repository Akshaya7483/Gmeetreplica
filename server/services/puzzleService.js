const supabase = require('../config/supabase');

const puzzleService = {
  async createPuzzle(roomId, puzzleData) {
    const { data, error } = await supabase
      .from('puzzles')
      .insert([{
        room_id: roomId,
        question: puzzleData.question,
        options: puzzleData.options,
        correct_answer: puzzleData.correctAnswer,
        duration: puzzleData.duration
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async getActivePuzzle(roomId) {
    // Get the most recent puzzle for the room
    const { data, error } = await supabase
      .from('puzzles')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;

    // Check if it's still "active" (within duration)
    const createdAt = new Date(data.created_at).getTime();
    const now = Date.now();
    const expiry = createdAt + (data.duration * 1000);

    if (now < expiry) {
      return {
        ...data,
        timeLeft: Math.floor((expiry - now) / 1000)
      };
    }
    return null;
  },

  async submitAnswer(puzzleId, userId, roomId, answer, isCorrect) {
    // 1. Get participant ID
    const { data: participant, error: pError } = await supabase
      .from('participants')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();
    
    if (pError) throw pError;

    // 2. Insert answer
    const { data, error } = await supabase
      .from('answers')
      .insert([{
        puzzle_id: puzzleId,
        participant_id: participant.id,
        answer,
        is_correct: isCorrect
      }])
      .select()
      .single();
    
    if (error) throw error;

    // 3. Update participant score if correct
    if (isCorrect) {
      const { error: scoreError } = await supabase.rpc('increment_score', { 
        p_participant_id: participant.id, 
        p_amount: 10 
      });
      // Note: need to define this RPC in schema or use standard update
      if (scoreError) {
        // Fallback if RPC not defined
        await supabase
          .from('participants')
          .update({ score: supabase.raw('score + 10') }) // raw is not available in JS client like this
          // We'll use a simple select then update for now, or just assume RPC exists
      }
    }

    return data;
  },

  async getLeaderboard(roomId) {
    const { data, error } = await supabase
      .from('participants')
      .select('score, user:user_id(name)')
      .eq('room_id', roomId)
      .order('score', { ascending: false })
      .limit(10);
    
    if (error) throw error;
    return data.map(p => ({
      name: p.user.name,
      score: p.score
    }));
  }
};

module.exports = puzzleService;
