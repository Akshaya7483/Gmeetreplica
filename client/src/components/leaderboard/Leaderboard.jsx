import React, { memo } from 'react';
import { 
  Box, 
  VStack, 
  Text, 
  HStack, 
  Avatar, 
  Badge,
  Divider,
  Heading,
  Skeleton,
  Stack
} from '@chakra-ui/react';
import { useAppContext } from '../../context/AppContext';

const Leaderboard = memo(() => {
  const { leaderboard, students, loading } = useAppContext();
  
  // Use leaderboard if available, otherwise just show students list
  const displayList = leaderboard.length > 0 ? leaderboard : students;

  if (loading) {
    return (
      <Box h="full" bg="whiteAlpha.50" borderRadius="xl" p={4} border="1px solid" borderColor="whiteAlpha.100">
        <Heading size="xs" mb={4} color="gray.400">Leaderboard</Heading>
        <Stack spacing={4}>
          <Skeleton h="40px" borderRadius="md" startColor="whiteAlpha.100" endColor="whiteAlpha.300" />
          <Skeleton h="40px" borderRadius="md" startColor="whiteAlpha.100" endColor="whiteAlpha.300" />
          <Skeleton h="40px" borderRadius="md" startColor="whiteAlpha.100" endColor="whiteAlpha.300" />
        </Stack>
      </Box>
    );
  }

  return (
    <Box 
      h="full" 
      bg="whiteAlpha.50" 
      borderRadius="xl" 
      p={4} 
      border="1px solid" 
      borderColor="whiteAlpha.100"
      transition="all 0.3s"
      _hover={{ bg: "whiteAlpha.100" }}
    >
      <Heading size="xs" mb={4} color="gray.400" textTransform="uppercase">Leaderboard</Heading>
      
      <VStack align="stretch" spacing={3} overflowY="auto" maxH="100%">
        {displayList.length === 0 ? (
          <Text color="gray.500" fontSize="sm" textAlign="center">No students joined yet</Text>
        ) : (
          displayList.map((student, index) => (
            <Box key={student.id}>
              <HStack justify="space-between" p={2} borderRadius="md" bg={index < 3 ? "whiteAlpha.100" : "transparent"}>
                <HStack spacing={3}>
                  <Text fontWeight="bold" color={index === 0 ? "yellow.400" : index === 1 ? "gray.300" : index === 2 ? "orange.400" : "gray.500"}>
                    #{index + 1}
                  </Text>
                  <Avatar size="sm" name={student.name} />
                  <Text fontWeight="medium" fontSize="sm">{student.name}</Text>
                </HStack>
                <Badge colorScheme="purple" fontSize="sm" px={2} borderRadius="full">
                  {student.score} pts
                </Badge>
              </HStack>
              {index < displayList.length - 1 && <Divider mt={2} borderColor="whiteAlpha.50" />}
            </Box>
          ))
        )}
      </VStack>
    </Box>
  );
});

export default Leaderboard;
