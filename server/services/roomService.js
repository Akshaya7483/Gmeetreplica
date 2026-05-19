const supabase = require('../config/supabase');

const roomService = {
  async getOrCreateUser(name, role) {
    // For simplicity in this demo, we'll try to find by name or create
    // In a real app, you'd use auth.uid()
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('name', name)
      .eq('role', role)
      .single();

    if (error && error.code === 'PGRST116') { // Not found
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{ name, role }])
        .select()
        .single();
      
      if (createError) throw createError;
      return newUser;
    }

    if (error) throw error;
    return user;
  },

  async createRoom(roomCode, teacherId) {
    const { data, error } = await supabase
      .from('rooms')
      .insert([{ code: roomCode, teacher_id: teacherId }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async getRoomByCode(code) {
    const { data, error } = await supabase
      .from('rooms')
      .select('*, teacher:teacher_id(*)')
      .eq('code', code)
      .eq('status', 'active')
      .single();
    
    if (error) return null;
    return data;
  },

  async joinRoom(roomId, userId) {
    const { data, error } = await supabase
      .from('participants')
      .upsert([{ room_id: roomId, user_id: userId, is_online: true, last_seen_at: new Date() }], {
        onConflict: 'room_id,user_id'
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async leaveRoom(roomId, userId) {
    const { error } = await supabase
      .from('participants')
      .update({ is_online: false, last_seen_at: new Date() })
      .match({ room_id: roomId, user_id: userId });
    
    if (error) console.error('Error leaving room:', error);
  },

  async getParticipants(roomId) {
    const { data, error } = await supabase
      .from('participants')
      .select('*, user:user_id(name)')
      .eq('room_id', roomId)
      .eq('is_online', true);
    
    if (error) throw error;
    return data.map(p => ({
      id: p.user_id,
      name: p.user.name,
      score: p.score
    }));
  },

  async saveMessage(roomId, userId, text) {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([{ room_id: roomId, user_id: userId, text }])
      .select('*, user:user_id(name)')
      .single();
    
    if (error) throw error;
    return data;
  },

  async getMessages(roomId, limit = 50) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*, user:user_id(name)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(limit);
    
    if (error) throw error;
    return data.map(m => ({
      id: m.id,
      text: m.text,
      sender: m.user.name,
      timestamp: new Date(m.created_at).toLocaleTimeString()
    }));
  }
};

module.exports = roomService;
