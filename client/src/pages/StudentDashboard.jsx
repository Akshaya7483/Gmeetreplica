import React, { useCallback, memo } from 'react';
import {
  Box,
  Container,
  VStack,
  Heading,
  Text,
  Button,
  HStack,
  Badge,
  Flex,
  Icon,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  SimpleGrid,
  useToast,
  Avatar,
  Divider,
  Center
} from '@chakra-ui/react';
import { FaPlay, FaUserGraduate, FaSignOutAlt, FaCircle } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { socket } from '../socket';
import Leaderboard from '../components/leaderboard/Leaderboard';
import Chat from '../components/chat/Chat';

const StudentDashboard = () => {
  const { user, logout, activeRoom, coachOnline, connected, students } = useAppContext();
  const navigate = useNavigate();
  const toast = useToast();

  const handleJoinMeeting = useCallback(() => {
    if (!activeRoom) {
      toast({
        title: "No Active Meeting",
        description: "Please wait for the coach to start a meeting.",
        status: "warning",
      });
      return;
    }

    socket.connect();
    socket.emit('join-room', {
      roomCode: activeRoom,
      studentName: user.name
    });
    
    navigate(`/classroom/${activeRoom}`);
  }, [activeRoom, user.name, navigate, toast]);

  return (
    <Box minH="100vh" bg="gray.900" color="white" p={4}>
      <Container maxW="container.xl" h="calc(100vh - 32px)">
        <Flex direction="column" h="full" gap={6}>
          {/* Header */}
          <Flex justify="space-between" align="center" bg="whiteAlpha.50" p={4} borderRadius="xl" border="1px solid" borderColor="whiteAlpha.100">
            <HStack spacing={4}>
              <Heading size="md" bgGradient="linear(to-r, blue.400, purple.400)" bgClip="text">
                Student Dashboard
              </Heading>
              <Badge colorScheme={connected ? "green" : "red"} variant="outline">
                {connected ? "CONNECTED" : "DISCONNECTED"}
              </Badge>
            </HStack>
            <HStack spacing={6}>
              <HStack spacing={2}>
                <Avatar size="sm" name={user.name} />
                <VStack align="start" spacing={0}>
                  <Text fontSize="sm" fontWeight="bold">{user.name}</Text>
                  <Text fontSize="xs" color="gray.400">Student</Text>
                </VStack>
              </HStack>
              <Button 
                variant="ghost" 
                colorScheme="red" 
                size="sm" 
                leftIcon={<FaSignOutAlt />} 
                onClick={logout}
              >
                Logout
              </Button>
            </HStack>
          </Flex>

          {/* Main Content */}
          <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={6} flex={1} overflow="hidden">
            {/* Left Column: Meeting Status */}
            <VStack spacing={6} align="stretch">
              <Box 
                p={8} 
                borderRadius="2xl" 
                bg="whiteAlpha.50" 
                border="1px solid" 
                borderColor="whiteAlpha.100"
                textAlign="center"
              >
                <VStack spacing={6}>
                  <Icon 
                    as={FaUserGraduate} 
                    boxSize={12} 
                    color={activeRoom ? "blue.400" : "gray.600"} 
                  />
                  <VStack spacing={1}>
                    <Heading size="md">
                      {activeRoom ? "Meeting in Progress" : "No Active Meeting"}
                    </Heading>
                    <HStack spacing={2}>
                      <Icon 
                        as={FaCircle} 
                        boxSize={2} 
                        color={coachOnline ? "green.400" : "red.400"} 
                      />
                      <Text fontSize="sm" color="gray.400">
                        Coach is {coachOnline ? "Online" : "Offline"}
                      </Text>
                    </HStack>
                  </VStack>
                  
                  {activeRoom ? (
                    <VStack w="full" spacing={4}>
                      <Badge colorScheme="blue" fontSize="md" p={2} borderRadius="md">
                        Room Code: {activeRoom}
                      </Badge>
                      <Button 
                        colorScheme="blue" 
                        size="lg" 
                        w="full" 
                        leftIcon={<FaPlay />}
                        onClick={handleJoinMeeting}
                        animation="pulse 2s infinite"
                      >
                        Join Meeting Now
                      </Button>
                    </VStack>
                  ) : (
                    <Text color="gray.500" fontSize="sm">
                      The "Join Meeting" button will appear here once the coach starts a session.
                    </Text>
                  )}
                </VStack>
              </Box>

              <SimpleGrid columns={1} spacing={4}>
                <Stat bg="whiteAlpha.50" p={4} borderRadius="xl" border="1px solid" borderColor="whiteAlpha.100">
                  <StatLabel color="gray.400">Classmates Online</StatLabel>
                  <StatNumber>{students.length}</StatNumber>
                  <StatHelpText>Active in room</StatHelpText>
                </Stat>
              </SimpleGrid>
            </VStack>

            {/* Middle Column: Leaderboard */}
            <Box h="full" overflow="hidden">
              <Leaderboard />
            </Box>

            {/* Right Column: Chat */}
            <Box h="full" overflow="hidden">
              <Chat roomId={activeRoom || "global"} />
            </Box>
          </SimpleGrid>
        </Flex>
      </Container>
    </Box>
  );
};

export default memo(StudentDashboard);
