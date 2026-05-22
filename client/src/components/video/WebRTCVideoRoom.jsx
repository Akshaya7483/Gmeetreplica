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
  useToast,
  Button,
  Tooltip,
  Badge
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
  const [remoteStreams, setRemoteStreams] = useState({}); // { socketId: { stream, name, isScreenShare } }
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const pcs = useRef({}); // Map of socketId -> RTCPeerConnection
  const iceQueues = useRef({}); // Map of socketId -> [RTCIceCandidate]
  const localVideoRef = useRef(null);
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
          video: true,
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

  // 2. Peer Connection Logic (Robust Mesh)
  const createPeerConnection = useCallback((remoteSocketId, remoteName, isInitiator) => {
    if (pcs.current[remoteSocketId]) {
      console.log(`[WEBRTC] Connection already exists for ${remoteSocketId}`);
      return pcs.current[remoteSocketId];
    }

    const pc = new RTCPeerConnection(peerConfiguration);
    pcs.current[remoteSocketId] = pc;
    iceQueues.current[remoteSocketId] = [];

    // Add local tracks (Camera/Mic)
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // Add Screen Share track if active
    if (screenStream) {
      screenStream.getTracks().forEach(track => {
        pc.addTrack(track, screenStream);
      });
    }

    // ICE Candidate Handling with Queueing
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-signal', {
          to: remoteSocketId,
          signal: { type: 'ice-candidate', candidate: event.candidate }
        });
      }
    };

    // Track Handling: Use event.streams[0] and prioritize audio
    pc.ontrack = (event) => {
      console.log(`[WEBRTC] Track received from ${remoteSocketId}`);
      const remoteStream = event.streams[0];
      
      setRemoteStreams(prev => {
        if (prev[remoteSocketId]?.stream?.id === remoteStream.id) return prev;
        
        // Mesh Optimization: If not teacher and it's a student-to-student connection, 
        // we could potentially downscale or disable video here.
        // For now, we ensure we have the stream.
        return {
          ...prev,
          [remoteSocketId]: { 
            stream: remoteStream, 
            name: remoteName 
          }
        };
      });
    };

    // Bitrate Constraints for Mesh Stability (High Priority)
    pc.onnegotiationneeded = async () => {
      try {
        await pc.setLocalDescription();
        socket.emit('webrtc-signal', {
          to: remoteSocketId,
          signal: { type: 'offer', sdp: pc.localDescription }
        });

        // Set bitrate limits on video senders
        pc.getSenders().forEach(sender => {
          if (sender.track?.kind === 'video') {
            const parameters = sender.getParameters();
            if (!parameters.encodings) parameters.encodings = [{}];
            
            // Limit to 300kbps for students to save bandwidth in mesh
            // Teachers get 1.5mbps for better quality
            parameters.encodings[0].maxBitrate = isTeacher ? 1500000 : 300000;
            sender.setParameters(parameters).catch(e => console.warn('[WEBRTC] Bitrate set error:', e));
          }
        });
      } catch (err) {
        console.error('[WEBRTC] Negotiation error:', err);
      }
    };

    // Reconnection & Stability Handling
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[WEBRTC] ICE state for ${remoteSocketId}: ${state}`);
      if (state === 'failed' || state === 'disconnected') {
        console.log(`[WEBRTC] Connection failed, cleaning up ${remoteSocketId}`);
        removePeer(remoteSocketId);
      }
    };

    // Negotiation Logic
    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('webrtc-signal', {
            to: remoteSocketId,
            signal: { type: 'offer', sdp: pc.localDescription }
          });
        })
        .catch(err => console.error('[WEBRTC] Offer error:', err));
    }

    return pc;
  }, [localStream, screenStream]);

  const removePeer = (socketId) => {
    if (pcs.current[socketId]) {
      pcs.current[socketId].close();
      delete pcs.current[socketId];
    }
    delete iceQueues.current[socketId];
    setRemoteStreams(prev => {
      const newState = { ...prev };
      delete newState[socketId];
      return newState;
    });
  };

  // 3. Signaling Listeners & Reconnection Logic
  useEffect(() => {
    if (!localStream) return;

    // Handle Socket Reconnection
    const handleReconnect = () => {
      console.log('[WEBRTC] Socket reconnected, restarting peer connections...');
      // Clear existing peers and re-sync
      Object.values(pcs.current).forEach(pc => pc.close());
      pcs.current = {};
      setRemoteStreams({});
      syncExistingPeers();
    };

    socket.on('connect', handleReconnect);

    // Tie-breaker for peer initiation to prevent race conditions
    const shouldInitiate = (remoteId) => socket.id > remoteId;

    const handleStudentJoined = ({ student }) => {
      if (student.id !== socket.id) {
        const initiator = shouldInitiate(student.id);
        createPeerConnection(student.id, student.name, initiator);
      }
    };

    const syncExistingPeers = () => {
      students.forEach(participant => {
        if (participant.id !== socket.id) {
          const initiator = shouldInitiate(participant.id);
          createPeerConnection(participant.id, participant.name, initiator);
        }
      });
    };

    syncExistingPeers();

    const handleWebRTCSignal = async ({ from, fromName, signal }) => {
      let pc = pcs.current[from];

      if (signal.type === 'offer') {
        if (!pc) pc = createPeerConnection(from, fromName || 'Remote User', false);
        
        try {
          // If we receive an offer while we are in stable state, it's likely a renegotiation
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          socket.emit('webrtc-signal', {
            to: from,
            signal: { type: 'answer', sdp: pc.localDescription }
          });

          // Process queued ICE candidates
          if (iceQueues.current[from]) {
            while (iceQueues.current[from].length > 0) {
              await pc.addIceCandidate(new RTCIceCandidate(iceQueues.current[from].shift()));
            }
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

    const handlePeerLeft = ({ id }) => {
      console.log(`[WEBRTC] Cleaning up peer ${id}`);
      removePeer(id);
    };

    socket.on('student-joined', handleStudentJoined);
    socket.on('webrtc-signal', handleWebRTCSignal);
    socket.on('peer-left', handlePeerLeft);

    const handleTeacherCommand = (e) => {
      if (e.detail.type === 'MUTE_ALL' && !isTeacher) {
        if (localStream) {
          localStream.getAudioTracks().forEach(track => {
            track.enabled = false;
          });
          setIsMuted(true);
        }
      }
    };
    window.addEventListener('teacher-command', handleTeacherCommand);

    return () => {
      socket.off('connect', handleReconnect);
      socket.off('student-joined', handleStudentJoined);
      socket.off('webrtc-signal', handleWebRTCSignal);
      socket.off('peer-left', handlePeerLeft);
      window.removeEventListener('teacher-command', handleTeacherCommand);
      
      // Full cleanup to prevent memory leaks
      Object.values(pcs.current).forEach(pc => {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.oniceconnectionstatechange = null;
        pc.onconnectionstatechange = null;
        pc.onnegotiationneeded = null;
        pc.close();
      });
      pcs.current = {};
      iceQueues.current = {};
    };
  }, [localStream, createPeerConnection, students, isTeacher]);

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

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(stream);
        setIsScreenSharing(true);
        
        // Update all peer connections with the screen track
        Object.values(pcs.current).forEach(pc => {
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
          // Trigger re-negotiation
          pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
              const remoteId = Object.keys(pcs.current).find(id => pcs.current[id] === pc);
              socket.emit('webrtc-signal', {
                to: remoteId,
                signal: { type: 'offer', sdp: pc.localDescription }
              });
            });
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
          <Text color="white" fontWeight="bold">Setting up your classroom...</Text>
        </VStack>
      </Center>
    );
  }

  const allParticipants = [
    { id: 'local', stream: localStream, name: `${userName} (You)`, isLocal: true },
    ...(screenStream ? [{ id: 'screen', stream: screenStream, name: 'Your Screen', isLocal: true, isScreen: true }] : []),
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
          md: allParticipants.length <= 1 ? "1fr" : allParticipants.length <= 2 ? "1fr 1fr" : "repeat(auto-fit, minmax(300px, 1fr))" 
        }}
        gap={2}
        p={2}
        h="full"
        alignContent="center"
      >
        {allParticipants.map((participant) => (
          <VideoTile 
            key={participant.id} 
            participant={participant} 
            isLocal={participant.isLocal} 
          />
        ))}
      </Grid>

      {/* Modern Control Bar */}
      <Flex 
        position="absolute" 
        bottom={6} 
        left="50%" 
        transform="translateX(-50%)" 
        bg="rgba(15, 15, 20, 0.85)" 
        px={6} 
        py={3} 
        borderRadius="2xl"
        backdropFilter="blur(15px)"
        border="1px solid"
        borderColor="whiteAlpha.200"
        gap={6}
        boxShadow="2xl"
        zIndex={100}
      >
        <Tooltip label={isMuted ? "Unmute Mic" : "Mute Mic"}>
          <IconButton
            icon={isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
            onClick={toggleMute}
            colorScheme={isMuted ? "red" : "whiteAlpha"}
            variant={isMuted ? "solid" : "ghost"}
            rounded="full"
            aria-label="Toggle Mute"
          />
        </Tooltip>

        <Tooltip label={isVideoOff ? "Turn Camera On" : "Turn Camera Off"}>
          <IconButton
            icon={isVideoOff ? <FaVideoSlash /> : <FaVideo />}
            onClick={toggleVideo}
            colorScheme={isVideoOff ? "red" : "whiteAlpha"}
            variant={isVideoOff ? "solid" : "ghost"}
            rounded="full"
            aria-label="Toggle Video"
          />
        </Tooltip>

        <Tooltip label={isScreenSharing ? "Stop Sharing" : "Share Screen"}>
          <IconButton
            icon={isScreenSharing ? <FaStopCircle /> : <FaDesktop />}
            onClick={toggleScreenShare}
            colorScheme={isScreenSharing ? "green" : "whiteAlpha"}
            variant={isScreenSharing ? "solid" : "ghost"}
            rounded="full"
            aria-label="Toggle Screen Share"
          />
        </Tooltip>

        <Box borderLeft="1px solid" borderColor="whiteAlpha.300" mx={1} h="40px" />

        <HStack spacing={2} px={2}>
          <FaUserFriends color="white" />
          <Badge colorScheme="purple" borderRadius="full" px={2}>
            {students.length + 1}
          </Badge>
        </HStack>
      </Flex>
    </Box>
  );
});

const VideoTile = ({ participant, isLocal }) => {
  const videoRef = useRef(null);
  const [playError, setPlayError] = useState(false);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
      
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn("[WEBRTC] Autoplay prevented:", error);
          setPlayError(true);
        });
      }
    }
  }, [participant.stream]);

  const handleManualPlay = () => {
    if (videoRef.current) {
      videoRef.current.play().then(() => setPlayError(false));
    }
  };

  return (
    <Box 
      position="relative" 
      bg="gray.800" 
      borderRadius="2xl" 
      overflow="hidden"
      boxShadow="xl"
      border="1px solid"
      borderColor="whiteAlpha.100"
      transition="transform 0.2s"
      _hover={{ transform: "scale(1.01)" }}
      maxH="400px"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      
      {playError && !isLocal && (
        <Center position="absolute" top={0} left={0} right={0} bottom={0} bg="blackAlpha.800" zIndex={10}>
          <Button size="md" colorScheme="purple" onClick={handleManualPlay} leftIcon={<FaVideo />}>
            Resume Stream
          </Button>
        </Center>
      )}

      <Box 
        position="absolute" 
        bottom={4} 
        left={4} 
        bg="rgba(0,0,0,0.6)" 
        px={3} 
        py={1.5} 
        borderRadius="xl"
        backdropFilter="blur(5px)"
      >
        <Text color="white" fontSize="sm" fontWeight="bold">
          {participant.name}
        </Text>
      </Box>
    </Box>
  );
};

export default WebRTCVideoRoom;
