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

// Optimization Mode
const CLASSROOM_MODE = "teacher-focused";

const WebRTCVideoRoom = memo(({ roomCode, userId, userName, isTeacher }) => {
  const { students, teacher, pinnedParticipant, spotlightParticipant, raisedHands } = useAppContext();
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [remoteParticipants, setRemoteParticipants] = useState({}); // { socketId: { stream, name, isTeacher, streams, renderVideo } }
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(isTeacher ? false : true); // Students start with video OFF
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [networkQuality, setNetworkQuality] = useState('good'); // 'good', 'fair', 'poor'
  const [stats, setStats] = useState({});

  const pcs = useRef({}); // Map of socketId -> RTCPeerConnection
  const iceQueues = useRef({}); // Map of socketId -> [RTCIceCandidate]
  const streamInitializedRef = useRef(false);
  const statsIntervalRef = useRef(null);
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
          video: { 
            width: isTeacher ? 1280 : 320, 
            height: isTeacher ? 720 : 180,
            frameRate: isTeacher ? 30 : 15
          },
          audio: true,
        });
        
        // If student, disable video track initially
        if (!isTeacher) {
          stream.getVideoTracks().forEach(track => {
            track.enabled = false;
          });
        }

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
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, [isTeacher]);

  // Active Speaker Detection / Condition-based Video Publishing
  useEffect(() => {
    if (!localStream || isTeacher) return;

    const shouldEnableVideo = 
      raisedHands.some(h => h.studentId === socket.id) || 
      pinnedParticipant === socket.id || 
      spotlightParticipant === socket.id;

    if (shouldEnableVideo && isVideoOff) {
      console.log('[WEBRTC] Conditions met: Auto-enabling student video');
      toggleVideo(true); // Force enable
    }
  }, [raisedHands, pinnedParticipant, spotlightParticipant, localStream, isTeacher]);

  // WebRTC Stats Monitoring & Adaptation
  useEffect(() => {
    if (Object.keys(pcs.current).length === 0) return;

    statsIntervalRef.current = setInterval(async () => {
      const newStats = {};
      let totalPacketLoss = 0;
      let totalRTT = 0;
      let peerCount = 0;

      for (const [id, pc] of Object.entries(pcs.current)) {
        try {
          const statsReport = await pc.getStats();
          let peerLoss = 0;
          let peerRTT = 0;

          statsReport.forEach(report => {
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
              peerLoss = report.packetsLost || 0;
            }
            if (report.type === 'remote-candidate' && report.currentRoundTripTime) {
              peerRTT = report.currentRoundTripTime * 1000; // ms
            }
          });

          newStats[id] = { loss: peerLoss, rtt: peerRTT };
          totalPacketLoss += peerLoss;
          totalRTT += peerRTT;
          peerCount++;
        } catch (e) {
          console.warn('[WEBRTC] Stats error:', e);
        }
      }

      const avgRTT = peerCount > 0 ? totalRTT / peerCount : 0;
      
      // Adaptation Logic
      if (avgRTT > 400 || totalPacketLoss > 50) {
        if (networkQuality !== 'poor') {
          setNetworkQuality('poor');
          toast({
            title: "Network weak",
            description: "Reducing video quality to maintain connection",
            status: "warning",
            duration: 3000,
          });
          adaptBandwidth('poor');
        }
      } else if (avgRTT > 200) {
        if (networkQuality !== 'fair') {
          setNetworkQuality('fair');
          adaptBandwidth('fair');
        }
      } else {
        if (networkQuality !== 'good') {
          setNetworkQuality('good');
          adaptBandwidth('good');
        }
      }

      setStats(newStats);
    }, 5000);

    return () => clearInterval(statsIntervalRef.current);
  }, [networkQuality]);

  const adaptBandwidth = (quality) => {
    Object.values(pcs.current).forEach(pc => {
      const senders = pc.getSenders();
      senders.forEach(sender => {
        if (sender.track?.kind === 'video') {
          const params = sender.getParameters();
          if (!params.encodings) params.encodings = [{}];
          
          let bitrate;
          if (quality === 'poor') {
            bitrate = isTeacher ? 500000 : 50000; // Reduce to 500k/50k
          } else if (quality === 'fair') {
            bitrate = isTeacher ? 1000000 : 100000;
          } else {
            bitrate = isTeacher ? 1500000 : 150000;
          }
          
          params.encodings[0].maxBitrate = bitrate;
          sender.setParameters(params).catch(e => console.warn('[WEBRTC] Adaptation error:', e));
        }
      });
    });

    // If poor, disable student-to-student videos even if not teacher-focused
    if (quality === 'poor' && !isTeacher) {
      setRemoteParticipants(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(id => {
          if (!newState[id].isTeacher) {
            newState[id].renderVideo = false;
            if (newState[id].stream) {
              newState[id].stream.getVideoTracks().forEach(t => t.enabled = false);
            }
          }
        });
        return newState;
      });
    }
  };

  // 2. Peer Connection Logic
  const createPeerConnection = useCallback((remoteSocketId, remoteName, isInitiator, remoteIsTeacher = false) => {
    if (pcs.current[remoteSocketId]) {
      return pcs.current[remoteSocketId];
    }

    console.log(`[WEBRTC] Peer created for ${remoteName} (${remoteSocketId}). Initiator: ${isInitiator}`);
    const pc = new RTCPeerConnection(peerConfiguration);
    pcs.current[remoteSocketId] = pc;
    iceQueues.current[remoteSocketId] = [];

    // Add local tracks
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

    pc.ontrack = (event) => {
      console.log(`[WEBRTC] Track received from ${remoteSocketId} (${remoteName}):`, event.track.kind);
      
      setRemoteParticipants(prev => {
        const participant = prev[remoteSocketId] || { 
          name: remoteName, 
          isTeacher: remoteIsTeacher, 
          streams: [] 
        };
        
        const stream = event.streams[0];
        const streams = participant.streams || [];
        
        if (!streams.find(s => s.id === stream.id)) {
          console.log(`[WEBRTC] New remote stream attached for ${remoteName}: ${stream.id}`);
          
          // TEACHER-FOCUSED OPTIMIZATION:
          const shouldRenderVideo = isTeacher || remoteIsTeacher;
          if (!shouldRenderVideo) {
            console.log(`[WEBRTC] Optimization: Disabling video tracks for student ${remoteName}`);
            stream.getVideoTracks().forEach(t => t.enabled = false);
          }
          
          return {
            ...prev,
            [remoteSocketId]: { 
              ...participant,
              stream: stream, // Primary stream
              streams: [...streams, stream],
              renderVideo: shouldRenderVideo
            }
          };
        }
        return prev;
      });
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        removePeer(remoteSocketId);
      }
    };

    pc.onnegotiationneeded = async () => {
      if (!isInitiator) return;
      try {
        console.log(`[WEBRTC] Creating offer for ${remoteSocketId}`);
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

        // Set bitrate constraints
        const senders = pc.getSenders();
        senders.forEach(sender => {
          if (sender.track?.kind === 'video') {
            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];
            
            // Teacher: 1.5Mbps, Students: 150Kbps
            const bitrate = isTeacher ? 1500000 : 150000;
            params.encodings[0].maxBitrate = bitrate;
            
            sender.setParameters(params)
              .then(() => console.log(`[WEBRTC] Bitrate set to ${bitrate}bps for ${remoteSocketId}`))
              .catch(e => console.warn('[WEBRTC] Bitrate error:', e));
          }
        });
      } catch (err) {
        console.error('[WEBRTC] Negotiation error:', err);
      }
    };

    return pc;
  }, [localStream, screenStream, userName, isTeacher]);

  const removePeer = (socketId) => {
    console.log(`[WEBRTC] Stream removed for ${socketId}`);
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
      // 1. Connect to Teacher if they exist and are not local
      if (teacher && teacher.id !== socket.id) {
        console.log(`[WEBRTC] Syncing with teacher: ${teacher.name}`);
        createPeerConnection(teacher.id, teacher.name, shouldInitiate(teacher.id), true);
      }

      // 2. Connect to all other students
      students.forEach(p => {
        if (p.id !== socket.id) {
          console.log(`[WEBRTC] Syncing with student: ${p.name}`);
          createPeerConnection(p.id, p.name, shouldInitiate(p.id), false);
        }
      });
    };

    syncExistingPeers();

    const handleWebRTCSignal = async ({ from, fromName, signal }) => {
      let pc = pcs.current[from];
      const remoteIsTeacher = signal.fromIsTeacher;
      const remoteName = signal.fromName || fromName;

      if (signal.type === 'offer') {
        console.log(`[WEBRTC] Received offer from ${remoteName} (${from}). IsTeacher: ${remoteIsTeacher}`);
        if (!pc) pc = createPeerConnection(from, remoteName || 'Remote User', false, remoteIsTeacher);
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-signal', { to: from, signal: { type: 'answer', sdp: pc.localDescription } });

        const queue = iceQueues.current[from] || [];
        while (queue.length > 0) {
          await pc.addIceCandidate(new RTCIceCandidate(queue.shift()));
        }
      } 
      else if (signal.type === 'answer') {
        console.log(`[WEBRTC] Received answer from ${from}`);
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
  }, [localStream, createPeerConnection, students, teacher]);

  // 4. Media Controls
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = (forceState = null) => {
    if (localStream) {
      const newState = forceState !== null ? !forceState : !isVideoOff;
      localStream.getVideoTracks().forEach(track => track.enabled = !newState);
      setIsVideoOff(newState);
    }
  };

  // Active Speaker Detection using Web Audio API
  useEffect(() => {
    if (!localStream || isMuted) return;

    let audioContext;
    let analyser;
    let microphone;
    let javascriptNode;
    let animationId;

    const setupAudioAnalysis = () => {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      microphone = audioContext.createMediaStreamSource(localStream);
      javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 1024;

      microphone.connect(analyser);
      analyser.connect(javascriptNode);
      javascriptNode.connect(audioContext.destination);

      javascriptNode.onaudioprocess = () => {
        const array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        let values = 0;

        for (let i = 0; i < array.length; i++) {
          values += array[i];
        }

        const average = values / array.length;
        if (average > 30) { // Volume threshold for "speaking"
          if (isVideoOff && !isTeacher) {
            console.log('[WEBRTC] Active speaker detected: auto-enabling video');
            toggleVideo(true);
          }
        }
      };
    };

    setupAudioAnalysis();

    return () => {
      if (javascriptNode) javascriptNode.disconnect();
      if (microphone) microphone.disconnect();
      if (analyser) analyser.disconnect();
      if (audioContext) audioContext.close();
    };
  }, [localStream, isMuted, isTeacher]);

  useEffect(() => {
    const handleCameraRequest = () => {
      toast({
        title: "Camera Requested",
        description: "The teacher has requested you to turn on your camera.",
        status: "info",
        duration: null,
        isClosable: true,
        render: ({ onClose }) => (
          <Box p={4} bg="blue.600" color="white" borderRadius="lg" boxShadow="lg">
            <VStack spacing={3} align="stretch">
              <Text fontWeight="bold">The teacher requested your camera</Text>
              <HStack justify="flex-end">
                <Button size="sm" variant="ghost" color="white" onClick={onClose}>Ignore</Button>
                <Button size="sm" colorScheme="whiteAlpha" onClick={() => { toggleVideo(true); onClose(); }}>Turn On</Button>
              </HStack>
            </VStack>
          </Box>
        )
      });
    };

    window.addEventListener('camera-request', handleCameraRequest);
    return () => window.removeEventListener('camera-request', handleCameraRequest);
  }, [toast]);

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        console.log('[WEBRTC] Starting screen share...');
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(stream);
        setIsScreenSharing(true);

        // Add screen tracks to all existing peer connections
        Object.entries(pcs.current).forEach(([id, pc]) => {
          console.log(`[WEBRTC] Adding screen tracks to peer: ${id}`);
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
        });

        stream.getVideoTracks()[0].onended = () => {
          console.log('[WEBRTC] Screen share track ended');
          stopScreenShare();
        };
      } catch (err) {
        console.error('[WEBRTC] Screen share error:', err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (screenStream) {
      console.log('[WEBRTC] Stopping screen share...');
      screenStream.getTracks().forEach(track => track.stop());
      
      // Remove screen tracks from all peer connections
      Object.values(pcs.current).forEach(pc => {
        const senders = pc.getSenders();
        senders.forEach(sender => {
          if (sender.track && screenStream.getTracks().includes(sender.track)) {
            pc.removeTrack(sender);
          }
        });
      });

      setScreenStream(null);
      setIsScreenSharing(false);
    }
  };

  if (isLoading) {
    return (
      <Center h="full" bg="gray.900" borderRadius="xl">
        <VStack spacing={4}>
          <Spinner size="xl" color="purple.500" thickness="4px" />
          <Text color="white" fontWeight="bold">Optimizing Classroom Mode...</Text>
        </VStack>
      </Center>
    );
  }

  // Identify Teacher and Students for Grid
  const participants = Object.entries(remoteParticipants).map(([id, data]) => ({ id, ...data, isLocal: false }));
  const localParticipant = { id: socket.id, stream: localStream, name: `${userName} (You)`, isTeacher, isLocal: true, renderVideo: true };
  const allPeers = [localParticipant, ...participants];
  
  // Spotlight logic: If there's a spotlighted participant, they take the main stage
  const spotlightPeer = allPeers.find(p => p.id === spotlightParticipant);
  // Pinned logic: If user pinned someone locally
  const pinnedPeer = allPeers.find(p => p.id === pinnedParticipant);

  const mainStagePeer = spotlightPeer || pinnedPeer || allPeers.find(p => p.isTeacher);
  const studentPeers = allPeers.filter(p => p.id !== mainStagePeer?.id);

  return (
    <Box h="full" w="full" bg="gray.900" borderRadius="xl" overflow="hidden" position="relative">
      {networkQuality === 'poor' && (
        <Box position="absolute" top={4} right={4} zIndex={1000} bg="orange.500" px={3} py={1} borderRadius="md" boxShadow="lg">
          <Text color="white" fontSize="xs" fontWeight="bold">Weak Connection — Optimizing</Text>
        </Box>
      )}

      <Flex h="full" direction="column" p={2} gap={2}>
        {mainStagePeer && (
          <Box flex={2} position="relative" borderRadius="2xl" overflow="hidden" boxShadow="2xl" border="1px solid" borderColor="purple.500">
            <VideoTile 
              participant={mainStagePeer} 
              isLocal={mainStagePeer.isLocal} 
              isLarge 
              isTeacherView={isTeacher}
              roomCode={roomCode}
            />
          </Box>
        )}

        <Box flex={1} overflowY="auto" css={{ '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.1)', borderRadius: '10px' } }}>
          <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} spacing={2}>
            {studentPeers.map(p => (
              <Box key={p.id} h="160px" borderRadius="xl" overflow="hidden" border="1px solid" borderColor="whiteAlpha.100">
                <VideoTile 
                  participant={p} 
                  isLocal={p.isLocal} 
                  isTeacherView={isTeacher}
                  roomCode={roomCode}
                />
              </Box>
            ))}
          </SimpleGrid>
        </Box>
      </Flex>

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

const VideoTile = ({ participant, isLocal, isLarge, isTeacherView, roomCode }) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [playError, setPlayError] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const pinParticipant = () => {
    socket.emit('pin-participant', { roomCode, participantId: participant.id });
  };

  const spotlightParticipant = () => {
    socket.emit('spotlight-participant', { roomCode, participantId: participant.id });
  };

  const requestCamera = () => {
    socket.emit('request-camera', { roomCode, studentId: participant.id });
  };

  // Intersection Observer to detect offscreen videos
  useEffect(() => {
    if (isLocal || !containerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        
        // Optimize: If student video is offscreen, disable its video tracks
        if (participant.stream && !participant.isTeacher) {
          const videoTracks = participant.stream.getVideoTracks();
          videoTracks.forEach(track => {
            // Only enable if both the tile is visible AND the participant logic allows rendering
            track.enabled = entry.isIntersecting && (participant.renderVideo !== false);
          });
          if (!entry.isIntersecting) {
            console.log(`[WEBRTC] Optimization: Disabling offscreen video for ${participant.name}`);
          }
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [participant.stream, participant.isTeacher, participant.name, participant.renderVideo, isLocal]);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      console.log(`[WEBRTC] Video element mounted for ${participant.name}. Stream ID: ${participant.stream.id}`);
      videoRef.current.srcObject = participant.stream;
      videoRef.current.play().catch(e => {
        console.warn("[WEBRTC] Autoplay blocked for", participant.name, e);
        setPlayError(true);
      });
    }
  }, [participant.stream, participant.name]);

  const showVideo = participant.renderVideo !== false;

  return (
    <Box ref={containerRef} position="relative" h="full" w="full" bg="gray.800" group="true">
      {showVideo ? (
        <video
          ref={videoRef} autoPlay playsInline muted={isLocal}
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover',
            display: isVisible ? 'block' : 'none' 
          }}
        />
      ) : (
        <Center h="full" w="full" bg="gray.800" flexDir="column">
          <Avatar size="lg" name={participant.name} />
          <Text mt={2} color="whiteAlpha.600" fontSize="xs">Audio Only Mode</Text>
          {/* Play audio from all streams */}
          {(participant.streams || [participant.stream]).map(s => (
            <audio key={s.id} ref={el => { if (el && s) el.srcObject = s; el?.play(); }} autoPlay />
          ))}
        </Center>
      )}
      
      {!isVisible && showVideo && (
        <Center h="full" w="full" bg="gray.800">
          <VStack spacing={2}>
            <Avatar size="md" name={participant.name} />
            <Text color="whiteAlpha.500" fontSize="2xs">Offscreen (Paused)</Text>
          </VStack>
        </Center>
      )}

      {/* Teacher Controls Overlay */}
      {isTeacherView && !isLocal && (
        <Flex 
          position="absolute" top={2} right={2} gap={2} 
          opacity={0} _groupHover={{ opacity: 1 }} transition="opacity 0.2s"
        >
          <Tooltip label="Pin for everyone">
            <IconButton size="xs" icon={<FaUserFriends />} onClick={pinParticipant} colorScheme="blue" />
          </Tooltip>
          <Tooltip label="Spotlight">
            <IconButton size="xs" icon={<FaDesktop />} onClick={spotlightParticipant} colorScheme="purple" />
          </Tooltip>
          {!showVideo && (
            <Tooltip label="Request Camera">
              <IconButton size="xs" icon={<FaVideo />} onClick={requestCamera} colorScheme="green" />
            </Tooltip>
          )}
        </Flex>
      )}

      {playError && !isLocal && showVideo && (
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
