import React, { useEffect, useRef, useState, useCallback, memo, useMemo } from 'react';
import { 
  Box, 
  Grid, 
  IconButton, 
  Text, 
  Flex, 
  Center, 
  Spinner,
  Avatar,
  VStack,
  HStack,
  useToast,
  Button,
  Tooltip,
  Badge,
  SimpleGrid
} from '@chakra-ui/react';
import { 
  FaMicrophone, 
  FaMicrophoneSlash, 
  FaVideo, 
  FaVideoSlash, 
  FaDesktop, 
  FaStopCircle,
  FaUserFriends
} from 'react-icons/fa';
import { socket } from '../../socket';
import { useAppContext } from '../../context/AppContext';

const WebRTCVideoRoom = memo(({ roomCode, userId, userName, isTeacher }) => {
  const { students } = useAppContext();
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [remoteParticipants, setRemoteParticipants] = useState({}); // { socketId: { stream, name, isTeacher } }
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const pcs = useRef({}); // Map of socketId -> RTCPeerConnection
  const iceQueues = useRef({}); // Map of socketId -> [RTCIceCandidate]
  const streamInitializedRef = useRef(false);
  const toast = useToast();

  const peerConfiguration = {
    iceServers: [
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.l.google.com:19302' },
    ],
  };

  // 1. Initialize Local Stream
  useEffect(() => {
    const initLocalStream = async () => {
      if (streamInitializedRef.current) return;
      try {
        console.log('[WEBRTC] Requesting media devices...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 360 },
          audio: true,
        });
        setLocalStream(stream);
        streamInitializedRef.current = true;
        setIsLoading(false);
      } catch (err) {
        console.error('Error accessing media devices:', err);
        toast({
          title: "Media Error",
          description: "Could not access camera or microphone.",
          status: "error",
          duration: 5000,
        });
        setIsLoading(false);
      }
    };

    initLocalStream();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      streamInitializedRef.current = false;
    };
  }, []);

  // 2. Peer Connection Logic
  const createPeerConnection = useCallback((remoteSocketId, remoteName, isInitiator, remoteIsTeacher = false) => {
    if (pcs.current[remoteSocketId]) {
      console.log(`[WEBRTC] PC already exists for ${remoteSocketId}`);
      return pcs.current[remoteSocketId];
    }

    console.log(`[WEBRTC] Creating PC for ${remoteName}. Initiator: ${isInitiator}`);
    const pc = new RTCPeerConnection(peerConfiguration);
    pcs.current[remoteSocketId] = pc;
    iceQueues.current[remoteSocketId] = [];

    // Add local tracks to PC
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    if (screenStream) {
      screenStream.getTracks().forEach(track => {
        pc.addTrack(track, screenStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-signal', {
          to: remoteSocketId,
          signal: { type: 'ice-candidate', candidate: event.candidate }
        });
      }
    };

    // Track Handling: Use event.streams[0]
    pc.ontrack = (event) => {
      console.log(`[WEBRTC] Remote track received from ${remoteSocketId} (${remoteName})`);
      const remoteStream = event.streams[0];
      console.log(`[WEBRTC] Remote stream tracks for ${remoteSocketId}:`, remoteStream.getTracks());
      
      setRemoteParticipants(prev => ({
        ...prev,
        [remoteSocketId]: { 
          stream: remoteStream, 
          name: remoteName,
          isTeacher: remoteIsTeacher
        }
      }));
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WEBRTC] ICE state for ${remoteSocketId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        removePeer(remoteSocketId);
      }
    };

    pc.onnegotiationneeded = async () => {
      if (!isInitiator) return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-signal', {
          to: remoteSocketId,
          signal: { 
            type: 'offer', 
            sdp: pc.localDescription, 
            fromName: userName, 
            fromIsTeacher: isTeacher 
          }
        });
      } catch (err) {
        console.error('[WEBRTC] Negotiation error:', err);
      }
    };

    return pc;
  }, [localStream, screenStream, userName, isTeacher]);

  const removePeer = (socketId) => {
    if (pcs.current[socketId]) {
      pcs.current[socketId].close();
      delete pcs.current[socketId];
    }
    delete iceQueues.current[socketId];
    setRemoteParticipants(prev => {
      const newState = { ...prev };
      delete newState[socketId];
      return newState;
    });
  };

  // 3. Signaling Listeners
  useEffect(() => {
    if (!localStream) return;

    const shouldInitiate = (remoteId) => socket.id > remoteId;

    const handleStudentJoined = ({ student }) => {
      if (student.id !== socket.id) {
        createPeerConnection(student.id, student.name, shouldInitiate(student.id), false);
      }
    };

    const syncExistingPeers = () => {
      students.forEach(p => {
        if (p.id !== socket.id) {
          createPeerConnection(p.id, p.name, shouldInitiate(p.id), p.role === 'coach' || p.role === 'teacher');
        }
      });
    };

    syncExistingPeers();

    const handleWebRTCSignal = async ({ from, fromName, fromIsTeacher, signal }) => {
      let pc = pcs.current[from];

      if (signal.type === 'offer') {
        if (!pc) pc = createPeerConnection(from, fromName || 'Remote User', false, fromIsTeacher);
        
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          socket.emit('webrtc-signal', {
            to: from,
            signal: { type: 'answer', sdp: pc.localDescription }
          });

          const queue = iceQueues.current[from] || [];
          while (queue.length > 0) {
            await pc.addIceCandidate(new RTCIceCandidate(queue.shift()));
          }
        } catch (err) {
          console.error('[WEBRTC] Signal handling error:', err);
        }
      } 
      else if (signal.type === 'answer') {
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      } 
      else if (signal.type === 'ice-candidate') {
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else if (pc) {
          if (!iceQueues.current[from]) iceQueues.current[from] = [];
          iceQueues.current[from].push(signal.candidate);
        }
      }
    };

    const handlePeerLeft = ({ id }) => removePeer(id);

    socket.on('student-joined', handleStudentJoined);
    socket.on('webrtc-signal', handleWebRTCSignal);
    socket.on('peer-left', handlePeerLeft);

    return () => {
      socket.off('student-joined', handleStudentJoined);
      socket.off('webrtc-signal', handleWebRTCSignal);
      socket.off('peer-left', handlePeerLeft);
      Object.values(pcs.current).forEach(pc => pc.close());
      pcs.current = {};
    };
  }, [localStream, createPeerConnection, students]);

  // 4. Media Controls
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = !track.enabled);
      setIsVideoOff(!isVideoOff);
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(stream);
        setIsScreenSharing(true);
        Object.values(pcs.current).forEach(pc => {
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
        });
        stream.getVideoTracks()[0].onended = () => stopScreenShare();
      } catch (err) {
        console.error('[WEBRTC] Screen share error:', err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
      setIsScreenSharing(false);
    }
  };

  if (isLoading) {
    return (
      <Center h="full" bg="gray.900" borderRadius="xl">
        <VStack spacing={4}>
          <Spinner size="xl" color="purple.500" thickness="4px" />
          <Text color="white" fontWeight="bold">Initializing video...</Text>
        </VStack>
      </Center>
    );
  }

  // 5. Grid Logic
  const localParticipant = { id: 'local', stream: localStream, name: `${userName} (You)`, isTeacher, isLocal: true };
  const allPeers = [localParticipant, ...Object.entries(remoteParticipants).map(([id, data]) => ({ id, ...data, isLocal: false }))];
  
  const teacherPeer = allPeers.find(p => p.isTeacher);
  const studentPeers = allPeers.filter(p => !p.isTeacher);

  return (
    <Box h="full" w="full" bg="gray.900" borderRadius="xl" overflow="hidden" position="relative">
      <Flex h="full" direction="column" p={2} gap={2}>
        {/* Main Section: Teacher or Active Speaker */}
        {teacherPeer && (
          <Box flex={2} position="relative" borderRadius="2xl" overflow="hidden" boxShadow="2xl" border="1px solid" borderColor="whiteAlpha.200">
            <VideoTile participant={teacherPeer} isLocal={teacherPeer.isLocal} isLarge />
          </Box>
        )}

        {/* Bottom Section: Students Grid */}
        <Box flex={1} overflowY="auto" css={{ '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.1)', borderRadius: '10px' } }}>
          <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} spacing={2}>
            {studentPeers.map(p => (
              <Box key={p.id} h="160px" borderRadius="xl" overflow="hidden" border="1px solid" borderColor="whiteAlpha.100">
                <VideoTile participant={p} isLocal={p.isLocal} />
              </Box>
            ))}
          </SimpleGrid>
        </Box>
      </Flex>

      {/* Control Bar */}
      <Flex 
        position="absolute" bottom={6} left="50%" transform="translateX(-50%)" 
        bg="rgba(15, 15, 20, 0.9)" px={6} py={3} borderRadius="2xl" backdropFilter="blur(20px)" 
        border="1px solid" borderColor="whiteAlpha.200" gap={6} boxShadow="dark-lg" zIndex={100}
      >
        <IconButton
          icon={isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
          onClick={toggleMute} colorScheme={isMuted ? "red" : "whiteAlpha"} variant={isMuted ? "solid" : "ghost"} rounded="full"
        />
        <IconButton
          icon={isVideoOff ? <FaVideoSlash /> : <FaVideo />}
          onClick={toggleVideo} colorScheme={isVideoOff ? "red" : "whiteAlpha"} variant={isVideoOff ? "solid" : "ghost"} rounded="full"
        />
        <IconButton
          icon={isScreenSharing ? <FaStopCircle /> : <FaDesktop />}
          onClick={toggleScreenShare} colorScheme={isScreenSharing ? "green" : "whiteAlpha"} variant={isScreenSharing ? "solid" : "ghost"} rounded="full"
        />
        <Box borderLeft="1px solid" borderColor="whiteAlpha.300" mx={1} h="40px" />
        <HStack spacing={2}>
          <FaUserFriends color="white" />
          <Badge colorScheme="purple" borderRadius="full" px={2}>{allPeers.length}</Badge>
        </HStack>
      </Flex>
    </Box>
  );
});

const VideoTile = ({ participant, isLocal, isLarge }) => {
  const videoRef = useRef(null);
  const [playError, setPlayError] = useState(false);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
      videoRef.current.play().catch(e => {
        console.warn("[WEBRTC] Autoplay blocked", e);
        setPlayError(true);
      });
    }
  }, [participant.stream]);

  return (
    <Box position="relative" h="full" w="full" bg="gray.800">
      <video
        ref={videoRef} autoPlay playsInline muted={isLocal}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {playError && !isLocal && (
        <Center position="absolute" inset={0} bg="blackAlpha.800" zIndex={10}>
          <Button size="sm" colorScheme="purple" onClick={() => videoRef.current.play()}>Resume Stream</Button>
        </Center>
      )}
      <Box position="absolute" bottom={isLarge ? 6 : 2} left={isLarge ? 6 : 2} bg="blackAlpha.700" px={3} py={1} borderRadius="lg" backdropFilter="blur(5px)">
        <Text color="white" fontSize={isLarge ? "md" : "xs"} fontWeight="bold">
          {participant.name} {participant.isTeacher && "(Coach)"}
        </Text>
      </Box>
    </Box>
  );
};

export default WebRTCVideoRoom;
