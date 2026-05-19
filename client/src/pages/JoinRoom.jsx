import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Button, 
  Container, 
  Heading, 
  Input, 
  Stack, 
  Text, 
  VStack,
  useToast,
  HStack,
  Divider
} from '@chakra-ui/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { socket } from '../socket';

const JoinRoom = () => {
  const [searchParams] = useSearchParams();
  const urlRoomCode = searchParams.get('code');
  const [roomCodeInput, setRoomCodeInput] = useState(urlRoomCode || '');
  const { user, dispatch } = useAppContext();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (urlRoomCode && user && !socket.connected) {
      handleJoin();
    }
  }, [urlRoomCode, user]);

  useEffect(() => {
    socket.on('room-joined', ({ roomCode }) => {
      navigate(`/classroom/${roomCode}`);
    });

    socket.on('error', ({ message }) => {
      toast({
        title: "Error",
        description: message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    });

    return () => {
      socket.off('room-joined');
      socket.off('error');
    };
  }, [navigate, setRoom, toast]);

  const handleJoin = () => {
    if (!roomCodeInput) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    socket.connect();
    socket.emit('join-room', { 
      roomCode: roomCodeInput.toUpperCase(), 
      studentName: user.name 
    });
  };

  return (
    <Container maxW="container.sm" py={20}>
      <VStack spacing={8} textAlign="center">
        <Heading 
          size="xl" 
          bgGradient="linear(to-r, blue.400, purple.400)" 
          bgClip="text"
        >
          Join a Classroom
        </Heading>
        
        <Box 
          w="full" 
          p={8} 
          borderRadius="2xl" 
          bg="rgba(255, 255, 255, 0.05)" 
          backdropFilter="blur(10px)"
          border="1px solid rgba(255, 255, 255, 0.1)"
        >
          <Stack spacing={6}>
            <VStack align="start" spacing={2}>
              <Text fontWeight="bold">Enter Room Code</Text>
              <Input 
                placeholder="E.g. X1Y2Z3" 
                size="lg" 
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                textAlign="center"
                fontSize="2xl"
                letterSpacing="4px"
              />
            </VStack>

            <Button 
              size="lg" 
              colorScheme="blue" 
              w="full" 
              onClick={handleJoin}
              isDisabled={!roomCodeInput}
            >
              Join Room
            </Button>
            
            <Button variant="ghost" color="gray.400" onClick={() => navigate('/')}>
              Back to Home
            </Button>
          </Stack>
        </Box>
      </VStack>
    </Container>
  );
};

export default JoinRoom;
