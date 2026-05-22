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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  RadioGroup,
  Radio,
  Stack,
  Progress,
  HStack,
  Badge
} from '@chakra-ui/react';
import { useParams } from 'react-router-dom';
import { FaHandPaper } from 'react-icons/fa';
import { useAppContext } from '../context/AppContext';
import WebRTCVideoRoom from '../components/video/WebRTCVideoRoom';
import Chat from '../components/chat/Chat';
import Leaderboard from '../components/leaderboard/Leaderboard';
import { socket } from '../socket';

const Classroom = () => {
  const { roomId: urlRoomCode } = useParams();
  const { user, activePuzzle, dispatch, connected, activeRoom } = useAppContext();
  const roomCode = activeRoom || urlRoomCode;
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  const handleRaiseHand = useCallback(() => {
    socket.emit('raise-hand', { roomCode });
    toast({ title: "Hand Raised", status: "info", duration: 2000 });
  }, [roomCode, toast]);

  const handleSubmit = useCallback(() => {
    if (hasSubmitted) return;
    
    socket.emit('submit-answer', {
      roomCode,
      answer: selectedAnswer
    });
    
    setHasSubmitted(true);
    toast({
      title: "Answer Submitted",
      status: "success",
      duration: 2000,
    });

    // Close the modal after a short delay to let the user see the "Submitted" state
    setTimeout(() => {
      onClose();
      dispatch({ type: 'PUZZLE_ENDED' }); // Clear local state to return to video
    }, 1500);
  }, [hasSubmitted, roomCode, selectedAnswer, toast, onClose, dispatch]);

  // Memoize heavy components
  const videoComponent = useMemo(() => {
    if (!user) return null;
    return <WebRTCVideoRoom roomCode={roomCode} userName={user.name} isTeacher={false} />;
  }, [roomCode, user]);

  const sidebarComponent = useMemo(() => (
    <VStack spacing={4} align="stretch" h="full">
      <Box flex={1} overflowY="auto">
        <Leaderboard />
      </Box>
      <Box h="300px">
        <Chat roomId={roomCode} />
      </Box>
    </VStack>
  ), [roomCode]);

  useEffect(() => {
    const handleTeacherCommand = (e) => {
      if (e.detail.type === 'MUTE_ALL') {
        toast({
          title: "Teacher muted everyone",
          status: "warning",
          duration: 3000,
        });
        // The actual muting happens in WebRTCVideoRoom via listener or state
      }
    };
    window.addEventListener('teacher-command', handleTeacherCommand);
    return () => window.removeEventListener('teacher-command', handleTeacherCommand);
  }, [toast]);

  useEffect(() => {
    if (activePuzzle) {
      onOpen();
      setHasSubmitted(activePuzzle.hasSubmitted || false);
      setSelectedAnswer('');
      // If it's a late join, it might have timeLeft from backend
      setTimeLeft(activePuzzle.timeLeft || activePuzzle.duration || 30);
    } else {
      onClose();
    }
  }, [activePuzzle, onOpen, onClose]);

  useEffect(() => {
    if (timeLeft > 0 && isOpen && !hasSubmitted) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && isOpen && !hasSubmitted) {
      handleSubmit();
    }
  }, [timeLeft, isOpen, hasSubmitted, handleSubmit]);

  if (!user) return null;

  return (
    <Box h="100vh" p={4} bg="gray.900">
      <Grid
        templateAreas={{
          base: `"header" "video" "sidebar"`,
          lg: `"header header" "video sidebar" "video sidebar"`
        }}
        gridTemplateRows={{
          base: 'auto 400px auto',
          lg: '60px 1fr 1fr'
        }}
        gridTemplateColumns={{
          base: '1fr',
          lg: '1fr 350px'
        }}
        h="full"
        gap={4}
        overflowY={{ base: "auto", lg: "hidden" }}
      >
        <GridItem area={'header'} as={Flex} align="center" justify="space-between">
          <Heading size="md" bgGradient="linear(to-r, purple.400, blue.400)" bgClip="text">
            Classroom: {roomCode}
          </Heading>
          <HStack spacing={4}>
            <Badge colorScheme={connected ? "green" : "red"} p={1} variant="outline">
              {connected ? "CONNECTED" : "DISCONNECTED"}
            </Badge>
            <Text fontWeight="bold">{user.name}</Text>
          </HStack>
        </GridItem>

        <GridItem area={'video'}>
          <VStack align="stretch" h="full" spacing={4}>
            <HStack>
              <Button 
                leftIcon={<FaHandPaper />} 
                colorScheme="yellow" 
                onClick={handleRaiseHand}
              >
                Raise Hand
              </Button>
            </HStack>
            <Box flex={1} borderRadius="xl" overflow="hidden">
              {videoComponent}
            </Box>
          </VStack>
        </GridItem>

        <GridItem area={'sidebar'}>
          {sidebarComponent}
        </GridItem>
      </Grid>

      {/* Puzzle Modal */}
      <Modal isOpen={isOpen} onClose={() => {}} closeOnOverlayClick={false}>
        <ModalOverlay backdropFilter="blur(5px)" />
        <ModalContent bg="gray.800" color="white">
          <ModalHeader>{activePuzzle?.question}</ModalHeader>
          <ModalBody>
            <VStack align="stretch" spacing={4}>
              <Progress 
                value={(timeLeft / (activePuzzle?.duration || 30)) * 100} 
                colorScheme="purple" 
                borderRadius="full"
              />
              <Text textAlign="right">{timeLeft}s remaining</Text>
              
              <RadioGroup onChange={setSelectedAnswer} value={selectedAnswer} isDisabled={hasSubmitted}>
                <Stack spacing={4}>
                  {activePuzzle?.options?.map((opt, i) => (
                    <Box 
                      key={i} 
                      p={4} 
                      borderRadius="lg" 
                      border="1px solid" 
                      borderColor={selectedAnswer === opt ? "purple.400" : "whiteAlpha.200"}
                      bg={selectedAnswer === opt ? "whiteAlpha.100" : "transparent"}
                      onClick={() => !hasSubmitted && setSelectedAnswer(opt)}
                      cursor={hasSubmitted ? "default" : "pointer"}
                    >
                      <Radio value={opt} colorScheme="purple" isDisabled={hasSubmitted}>{opt}</Radio>
                    </Box>
                  ))}
                </Stack>
              </RadioGroup>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button 
              colorScheme="purple" 
              onClick={handleSubmit} 
              isDisabled={hasSubmitted || !selectedAnswer}
              w="full"
            >
              {hasSubmitted ? "Submitted" : "Submit Answer"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default memo(Classroom);
