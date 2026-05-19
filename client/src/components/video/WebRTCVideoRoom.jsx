import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
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
  useToast
} from '@chakra-ui/react';
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash } from 'react-icons/fa';
import { socket } from '../../socket';

const WebRTCVideoRoom = memo(({ roomCode, userId, userName, isTeacher }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // { socketId: { stream, name } }
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const pcs = useRef({}); // Map of socketId -> RTCPeerConnection
  const localVideoRef = useRef(null);
  const toast = useToast();

  const peerConfiguration = {
    iceServers: [
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  };

  // 1. Initialize Local Stream
  useEffect(() => {
    const initLocalStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
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
    };
  }, []);

  // 2. Peer Connection Logic
  const createPeerConnection = useCallback((remoteSocketId, remoteName, isInitiator) => {
    const pc = new RTCPeerConnection(peerConfiguration);
    pcs.current[remoteSocketId] = pc;

    // Add local tracks to PC
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
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

    pc.ontrack = (event) => {
      console.log(`[WEBRTC] Received remote track from ${remoteSocketId}`);
      setRemoteStreams(prev => ({
        ...prev,
        [remoteSocketId]: { 
          stream: event.streams[0], 
          name: remoteName 
        }
      }));
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WEBRTC] Connection state for ${remoteSocketId}: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(remoteSocketId);
      }
    };

    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('webrtc-signal', {
            to: remoteSocketId,
            signal: { type: 'offer', sdp: pc.localDescription }
          });
        });
    }

    return pc;
  }, [localStream]);

  const removePeer = (socketId) => {
    if (pcs.current[socketId]) {
      pcs.current[socketId].close();
      delete pcs.current[socketId];
    }
    setRemoteStreams(prev => {
      const newState = { ...prev };
      delete newState[socketId];
      return newState;
    });
  };

  // 3. Socket Event Listeners
  useEffect(() => {
    if (!localStream) return;

    // When a new student joins, the existing users (including teacher) will initiate a connection
    const handleStudentJoined = ({ student }) => {
      if (student.id !== socket.id) {
        console.log(`[WEBRTC] Student joined: ${student.name} (${student.id}), initiating connection`);
        createPeerConnection(student.id, student.name, true);
      }
    };

    const handleWebRTCSignal = async ({ from, fromName, signal }) => {
      let pc = pcs.current[from];

      if (signal.type === 'offer') {
        if (!pc) {
          // If we receive an offer and don't have a PC yet, we are the receiver
          pc = createPeerConnection(from, fromName || 'Remote User', false);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-signal', {
          to: from,
          signal: { type: 'answer', sdp: pc.localDescription }
        });
      } else if (signal.type === 'answer') {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        }
      } else if (signal.type === 'ice-candidate') {
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.error('Error adding ice candidate', e);
          }
        }
      }
    };

    const handlePeerLeft = ({ id }) => {
      console.log(`[WEBRTC] Peer left: ${id}`);
      removePeer(id);
    };

    socket.on('student-joined', handleStudentJoined);
    socket.on('webrtc-signal', handleWebRTCSignal);
    socket.on('peer-left', handlePeerLeft);

    return () => {
      socket.off('student-joined', handleStudentJoined);
      socket.off('webrtc-signal', handleWebRTCSignal);
      socket.off('peer-left', handlePeerLeft);
      
      // Cleanup all peer connections
      Object.values(pcs.current).forEach(pc => pc.close());
      pcs.current = {};
    };
  }, [localStream, createPeerConnection]);

  // 4. Media Controls
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  if (isLoading) {
    return (
      <Center h="full" bg="gray.900" borderRadius="xl">
        <VStack spacing={4}>
          <Spinner size="xl" color="purple.500" />
          <Text color="white">Initializing camera...</Text>
        </VStack>
      </Center>
    );
  }

  const allParticipants = [
    { id: 'local', stream: localStream, name: `${userName} (You)`, isLocal: true },
    ...Object.entries(remoteStreams).map(([id, data]) => ({
      id,
      stream: data.stream,
      name: data.name,
      isLocal: false
    }))
  ];

  return (
    <Box h="full" w="full" bg="gray.900" borderRadius="xl" overflow="hidden" position="relative">
      <Grid
        templateColumns={{ 
          base: "1fr", 
          md: allParticipants.length <= 1 ? "1fr" : allParticipants.length <= 2 ? "1fr 1fr" : "1fr 1fr" 
        }}
        templateRows={{
          base: `repeat(${allParticipants.length}, 1fr)`,
          md: allParticipants.length <= 2 ? "1fr" : "1fr 1fr"
        }}
        gap={2}
        p={2}
        h="full"
      >
        {allParticipants.map((participant) => (
          <VideoTile 
            key={participant.id} 
            participant={participant} 
            isLocal={participant.isLocal} 
          />
        ))}
      </Grid>

      {/* Controls */}
      <Flex 
        position="absolute" 
        bottom={4} 
        left="50%" 
        transform="translateX(-50%)" 
        bg="rgba(0,0,0,0.6)" 
        p={2} 
        borderRadius="full"
        backdropFilter="blur(10px)"
        gap={4}
      >
        <IconButton
          icon={isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
          onClick={toggleMute}
          colorScheme={isMuted ? "red" : "gray"}
          rounded="full"
          aria-label="Toggle Mute"
        />
        <IconButton
          icon={isVideoOff ? <FaVideoSlash /> : <FaVideo />}
          onClick={toggleVideo}
          colorScheme={isVideoOff ? "red" : "gray"}
          rounded="full"
          aria-label="Toggle Video"
        />
      </Flex>
    </Box>
  );
});

const VideoTile = ({ participant, isLocal }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  return (
    <Box 
      position="relative" 
      bg="gray.800" 
      borderRadius="lg" 
      overflow="hidden"
      boxShadow="lg"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal} // Always mute local video to prevent feedback
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <Box 
        position="absolute" 
        bottom={2} 
        left={2} 
        bg="rgba(0,0,0,0.5)" 
        px={2} 
        py={1} 
        borderRadius="md"
      >
        <Text color="white" fontSize="xs" fontWeight="bold">
          {participant.name}
        </Text>
      </Box>
    </Box>
  );
};

export default WebRTCVideoRoom;