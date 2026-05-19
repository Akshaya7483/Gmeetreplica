import React, { useState } from 'react';
import { 
  Box, 
  Button, 
  Container, 
  Flex, 
  Heading, 
  Input, 
  Stack, 
  Text, 
  VStack, 
  HStack,
  Icon,
  useToast
} from '@chakra-ui/react';
import { FaChalkboardTeacher, FaUserGraduate } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { socket } from '../socket';

const LandingPage = () => {
  const [name, setName] = useState('');
  const [role, setRole] = useState(null);
  const { setUser, dispatch } = useAppContext();
  const navigate = useNavigate();
  const toast = useToast();

  const handleStart = () => {
    if (!name || !role) {
      toast({
        title: "Missing Information",
        description: "Please enter your name and select a role.",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const userData = { name, role };
    setUser(userData);

    if (role === 'teacher') {
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      dispatch({ type: 'SET_LOADING', payload: true });
      socket.connect();
      socket.emit('create-room', { roomCode, teacherName: name });
      
      toast({
        title: "Room Created!",
        description: `Your room code is ${roomCode}. Sharing link generated.`,
        status: "success",
        duration: 5000,
      });
      
      navigate(`/teacher/${roomCode}`);
    } else {
      navigate('/join');
    }
  };

  return (
    <Container maxW="container.md" py={20}>
      <VStack spacing={8} textAlign="center">
        <Heading 
          size="2xl" 
          bgGradient="linear(to-r, purple.400, blue.400)" 
          bgClip="text"
        >
          Realtime Classroom
        </Heading>
        <Text fontSize="xl" color="gray.400">
          Google Meet + Kahoot + Classroom in one place.
        </Text>

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
              <Text fontWeight="bold">What's your name?</Text>
              <Input 
                placeholder="Enter your name" 
                size="lg" 
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </VStack>

            <VStack align="start" spacing={4}>
              <Text fontWeight="bold">I am a...</Text>
              <HStack w="full" spacing={4}>
                <Button 
                  flex={1} 
                  height="100px" 
                  variant={role === 'teacher' ? 'solid' : 'outline'}
                  colorScheme="purple"
                  onClick={() => setRole('teacher')}
                  leftIcon={<Icon as={FaChalkboardTeacher} boxSize={6} />}
                >
                  Teacher
                </Button>
                <Button 
                  flex={1} 
                  height="100px" 
                  variant={role === 'student' ? 'solid' : 'outline'}
                  colorScheme="blue"
                  onClick={() => setRole('student')}
                  leftIcon={<Icon as={FaUserGraduate} boxSize={6} />}
                >
                  Student
                </Button>
              </HStack>
            </VStack>

            <Button 
              size="lg" 
              colorScheme="brand" 
              w="full" 
              onClick={handleStart}
              isDisabled={!name || !role}
            >
              Get Started
            </Button>
          </Stack>
        </Box>
      </VStack>
    </Container>
  );
};

export default LandingPage;
