import React, { useState, useRef, useEffect, memo } from 'react';
import { 
  Box, 
  VStack, 
  HStack, 
  Input, 
  IconButton, 
  Text, 
  Flex,
  Avatar
} from '@chakra-ui/react';
import { IoSend } from 'react-icons/io5';
import { useAppContext } from '../../context/AppContext';
import { socket } from '../../socket';

const Chat = memo(({ roomId }) => {
  const { user, messages } = useAppContext();
  const [input, setInput] = useState('');
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    
    socket.emit('send-message', {
      roomCode: roomId, // roomId here is actually the roomCode passed as prop
      message: input,
    });
    
    setInput('');
  };

  return (
    <Box 
      h="full" 
      bg="whiteAlpha.50" 
      borderRadius="xl" 
      p={4} 
      border="1px solid" 
      borderColor="whiteAlpha.100"
      display="flex"
      flexDirection="column"
    >
      <Text fontWeight="bold" mb={4} fontSize="sm" color="gray.400">CLASS CHAT</Text>
      
      <VStack flex={1} overflowY="auto" spacing={4} align="stretch" mb={4} sx={{
        '&::-webkit-scrollbar': { width: '4px' },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': { background: 'whiteAlpha.200', borderRadius: 'full' },
      }}>
        {messages.map((msg) => (
          <Flex 
            key={msg.id} 
            flexDirection="column" 
            align={msg.sender === user.name ? "flex-end" : "flex-start"}
          >
            <HStack spacing={2} mb={1}>
              {msg.sender !== user.name && <Avatar size="xs" name={msg.sender} />}
              <Text fontSize="xs" color="gray.500">{msg.sender}</Text>
            </HStack>
            <Box 
              bg={msg.sender === user.name ? "purple.600" : "whiteAlpha.200"}
              color="white"
              px={3}
              py={2}
              borderRadius="lg"
              maxW="80%"
            >
              <Text fontSize="sm">{msg.text}</Text>
            </Box>
            <Text fontSize="10px" color="gray.600" mt={1}>{msg.timestamp}</Text>
          </Flex>
        ))}
        <div ref={chatEndRef} />
      </VStack>

      <HStack>
        <Input 
          size="sm"
          placeholder="Type a message..." 
          bg="whiteAlpha.100" 
          border="none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
        />
        <IconButton 
          aria-label="Send" 
          icon={<IoSend />} 
          size="sm" 
          colorScheme="purple"
          onClick={sendMessage}
        />
      </HStack>
    </Box>
  );
});

export default Chat;
