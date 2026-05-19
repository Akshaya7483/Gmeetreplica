import React, { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { 
  Box, 
  Grid, 
  GridItem, 
  Flex, 
  Heading, 
  Text, 
  Button, 
  VStack, 
  useToast,
  HStack,
  Input,
  FormControl,
  FormLabel,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Badge,
  IconButton,
  Tooltip,
  Avatar,
  Divider,
  Center,
  Icon
} from '@chakra-ui/react';
import { FaCopy, FaLink, FaSignOutAlt, FaStopCircle, FaPlayCircle } from 'react-icons/fa';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import WebRTCVideoRoom from '../components/video/WebRTCVideoRoom';
import Chat from '../components/chat/Chat';
import Leaderboard from '../components/leaderboard/Leaderboard';
import { socket } from '../socket';

const TeacherDashboard = () => {
  const { roomId: urlRoomCode } = useParams();
  const navigate = useNavigate();
  const { user, students, activePuzzle, dispatch, connected, logout, activeRoom } = useAppContext();
  
  // Use global activeRoom if available, otherwise use URL or generate new
  const roomCode = activeRoom || urlRoomCode || Math.random().toString(36).substring(2, 8).toUpperCase();
  
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const toast = useToast();

  const handleCreateMeeting = useCallback(() => {
    socket.connect();
    socket.emit('create-room', { roomCode, teacherName: user.name });
    navigate(`/coach/dashboard`); // Stay on dashboard
  }, [roomCode, user.name, navigate]);

  const handleEndMeeting = useCallback(() => {
    socket.emit('end-meeting', { roomCode });
    toast({
      title: "Meeting Ended",
      status: "info",
    });
  }, [roomCode, toast]);

  // Sync submissions if active puzzle already has them (reconnect recovery)
  useEffect(() => {
    if (activePuzzle && activePuzzle.submissions) {
      setSubmissions(activePuzzle.submissions);
    }
  }, [activePuzzle]);

  const copyRoomLink = useCallback(() => {
    const link = `${window.location.origin}/join?code=${roomCode}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Link Copied!",
      description: "Share this link with your students.",
      status: "success",
      duration: 3000,
    });
  }, [roomCode, toast]);

  const handleSubmissionReceived = useCallback((submission) => {
    setSubmissions(prev => [...prev, submission]);
  }, []);

  useEffect(() => {
    socket.on('submission-received', handleSubmissionReceived);
    return () => {
      socket.off('submission-received', handleSubmissionReceived);
    };
  }, [handleSubmissionReceived]);

  const handleStartPuzzle = useCallback(() => {
    if (!question || options.some(opt => !opt) || !correctAnswer) {
      toast({
        title: "Missing fields",
        description: "Please fill in the question, all options, and select the correct answer.",
        status: "warning",
      });
      return;
    }

    const puzzleData = {
      question,
      options,
      correctAnswer,
      duration: 30
    };

    socket.emit('start-puzzle', { roomCode, puzzleData });
    dispatch({ type: 'PUZZLE_STARTED', payload: puzzleData });
    setSubmissions([]);
    toast({
      title: "Puzzle Started!",
      status: "success",
    });
  }, [question, options, correctAnswer, roomCode, dispatch, toast]);

  const handleEndPuzzle = useCallback(() => {
    socket.emit('end-puzzle', { roomCode });
    dispatch({ type: 'PUZZLE_ENDED' });
    toast({
      title: "Puzzle Ended",
      status: "info",
    });
  }, [roomCode, dispatch, toast]);

  // Memoize static parts of UI to prevent rerender of video component
  const videoComponent = React.useMemo(() => (
    <WebRTCVideoRoom roomCode={roomCode} userName={user.name} isTeacher={true} />
  ), [roomCode, user.name]);

  return (
    <Box h="100vh" p={4} bg="gray.900">
      <Grid
        templateAreas={{
          base: `"header" "video" "controls" "sidebar"`,
          lg: `"header header" "video controls" "video sidebar"`
        }}
        gridTemplateRows={{
          base: 'auto auto auto auto',
          lg: '60px 1fr 1fr'
        }}
        gridTemplateColumns={{
          base: '1fr',
          lg: '1fr 400px'
        }}
        h="full"
        gap={4}
        overflowY={{ base: "auto", lg: "hidden" }}
      >
        <GridItem area={'header'} as={Flex} align="center" justify="space-between" bg="whiteAlpha.50" p={4} borderRadius="xl" border="1px solid" borderColor="whiteAlpha.100">
          <HStack spacing={4}>
            <Heading size="md" bgGradient="linear(to-r, purple.400, blue.400)" bgClip="text">
              Coach Dashboard
            </Heading>
            {activeRoom && (
              <Tooltip label="Copy invite link">
                <IconButton 
                  icon={<FaLink />} 
                  aria-label="Copy Link"
                  size="sm" 
                  onClick={copyRoomLink} 
                  colorScheme="purple" 
                  variant="ghost" 
                />
              </Tooltip>
            )}
          </HStack>
          <HStack spacing={6}>
            <Badge colorScheme={connected ? "green" : "red"} variant="outline">
              {connected ? "CONNECTED" : "DISCONNECTED"}
            </Badge>
            <HStack spacing={2}>
              <Avatar size="sm" name={user.name} />
              <VStack align="start" spacing={0}>
                <Text fontSize="sm" fontWeight="bold">{user.name}</Text>
                <Text fontSize="xs" color="gray.400">Coach</Text>
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
        </GridItem>

        <GridItem area={'video'} borderRadius="xl" overflow="hidden">
          {activeRoom ? videoComponent : (
            <Center h="full" bg="blackAlpha.400" borderRadius="xl" border="2px dashed" borderColor="whiteAlpha.200">
              <VStack spacing={4}>
                <Icon as={FaPlayCircle} boxSize={16} color="purple.500" />
                <Heading size="md">Start a Meeting to Activate Video</Heading>
                <Button colorScheme="purple" onClick={handleCreateMeeting}>
                  Start Meeting Now
                </Button>
              </VStack>
            </Center>
          )}
        </GridItem>

        <GridItem 
          area={'controls'} 
          p={6} 
          borderRadius="xl" 
          bg="whiteAlpha.50" 
          border="1px solid" 
          borderColor="whiteAlpha.100"
          overflowY="auto"
        >
          <VStack spacing={6} align="stretch">
            <Heading size="sm">Create Live Puzzle</Heading>
            
            <FormControl>
              <FormLabel>Question</FormLabel>
              <Input 
                placeholder="Enter question" 
                value={question} 
                onChange={(e) => setQuestion(e.target.value)}
              />
            </FormControl>

            <SimpleGrid columns={2} spacing={4}>
              {options.map((opt, i) => (
                <FormControl key={i}>
                  <FormLabel fontSize="xs">Option {i + 1}</FormLabel>
                  <Input 
                    placeholder={`Option ${i + 1}`} 
                    value={opt} 
                    onChange={(e) => {
                      const newOpts = [...options];
                      newOpts[i] = e.target.value;
                      setOptions(newOpts);
                    }}
                  />
                </FormControl>
              ))}
            </SimpleGrid>

            <FormControl>
              <FormLabel>Correct Answer</FormLabel>
              <Input 
                placeholder="Must match one of the options" 
                value={correctAnswer} 
                onChange={(e) => setCorrectAnswer(e.target.value)}
              />
            </FormControl>

            <HStack w="full">
              {!activeRoom ? (
                <Button colorScheme="purple" w="full" leftIcon={<FaPlayCircle />} onClick={handleCreateMeeting}>
                  Start Meeting
                </Button>
              ) : !activePuzzle ? (
                <VStack w="full" spacing={4}>
                  <Button colorScheme="purple" w="full" onClick={handleStartPuzzle}>
                    Start Live Puzzle
                  </Button>
                  <Button colorScheme="red" variant="outline" w="full" leftIcon={<FaStopCircle />} onClick={handleEndMeeting}>
                    End Meeting
                  </Button>
                </VStack>
              ) : (
                <Button colorScheme="red" w="full" onClick={handleEndPuzzle}>
                  End Active Puzzle
                </Button>
              )}
            </HStack>

            {activePuzzle && (
              <Box p={4} bg="whiteAlpha.100" borderRadius="md">
                <Text fontWeight="bold" mb={2}>Live Stats:</Text>
                <SimpleGrid columns={2} spacing={4}>
                  <Stat>
                    <StatLabel>Submissions</StatLabel>
                    <StatNumber>{submissions.length}</StatNumber>
                    <StatHelpText>Total</StatHelpText>
                  </Stat>
                  <Stat>
                    <StatLabel>Correct</StatLabel>
                    <StatNumber color="green.400">{submissions.filter(s => s.isCorrect).length}</StatNumber>
                    <StatHelpText>Correct Answers</StatHelpText>
                  </Stat>
                </SimpleGrid>
              </Box>
            )}
          </VStack>
        </GridItem>

        <GridItem area={'sidebar'} as={VStack} spacing={4} align="stretch">
          <Box flex={1} overflowY="auto">
            <Leaderboard />
          </Box>
          <Box h="300px">
            <Chat roomId={roomCode} />
          </Box>
        </GridItem>
      </Grid>
    </Box>
  );
};

export default memo(TeacherDashboard);
