-- Realtime Classroom Supabase Schema

-- 1. Users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    role TEXT CHECK (role IN ('teacher', 'student')) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    teacher_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status TEXT CHECK (status IN ('active', 'closed')) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Participants table (links users to rooms)
CREATE TABLE IF NOT EXISTS public.participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    is_online BOOLEAN DEFAULT true,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);

-- 4. Puzzles table
CREATE TABLE IF NOT EXISTS public.puzzles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB NOT NULL, -- Array of strings
    correct_answer TEXT NOT NULL,
    duration INTEGER DEFAULT 30, -- in seconds
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Answers table
CREATE TABLE IF NOT EXISTS public.answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    puzzle_id UUID REFERENCES public.puzzles(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE,
    answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Basic policies (Simplified for this app - allows authenticated/anon access for demo)
CREATE POLICY "Public read users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Public insert users" ON public.users FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read rooms" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Public insert rooms" ON public.rooms FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read participants" ON public.participants FOR SELECT USING (true);
CREATE POLICY "Public insert/update participants" ON public.participants FOR ALL USING (true);

CREATE POLICY "Public read puzzles" ON public.puzzles FOR SELECT USING (true);
CREATE POLICY "Public insert puzzles" ON public.puzzles FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read answers" ON public.answers FOR SELECT USING (true);
CREATE POLICY "Public insert answers" ON public.answers FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read chat_messages" ON public.chat_messages FOR SELECT USING (true);
CREATE POLICY "Public insert chat_messages" ON public.chat_messages FOR INSERT WITH CHECK (true);

-- Functions
CREATE OR REPLACE FUNCTION increment_score(p_participant_id UUID, p_amount INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE public.participants
  SET score = score + p_amount
  WHERE id = p_participant_id;
END;
$$ LANGUAGE plpgsql;
