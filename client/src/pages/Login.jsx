import React, { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  VStack,
  Heading,
  Text,
  useToast,
  Container,
  InputGroup,
  InputRightElement,
  IconButton,
  Badge,
  Flex
} from '@chakra-ui/react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { loginUser } from '../config/authUsers';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const { setUser } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const handleLogin = (e) => {
    e.preventDefault();
    setIsLoading(true);

    const user = loginUser(email, password);

    if (user) {
      setUser(user);
      toast({
        title: "Login Successful",
        description: `Welcome back, ${user.name}!`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      // Redirect to intended page or dashboard based on role
      const from = location.state?.from?.pathname;
      if (from) {
        navigate(from, { replace: true });
      } else {
        navigate(user.role === 'coach' ? '/coach/dashboard' : '/student/dashboard', { replace: true });
      }
    } else {
      toast({
        title: "Login Failed",
        description: "Invalid email or password.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
    setIsLoading(false);
  };

  return (
    <Box 
      minH="100vh" 
      display="flex" 
      alignItems="center" 
      justifyContent="center" 
      bg="gray.900"
      bgGradient="radial(circle at center, purple.900, gray.900)"
    >
      <Container maxW="md">
        <VStack spacing={8}>
          <VStack spacing={2} textAlign="center">
            <Heading size="xl" bgGradient="linear(to-r, purple.400, blue.400)" bgClip="text">
              Classroom Login
            </Heading>
            <Text color="gray.400">Enter your credentials to continue</Text>
          </VStack>

          <Box 
            w="full" 
            p={8} 
            borderRadius="2xl" 
            bg="whiteAlpha.50" 
            backdropFilter="blur(10px)"
            border="1px solid"
            borderColor="whiteAlpha.100"
            boxShadow="xl"
          >
            <form onSubmit={handleLogin}>
              <VStack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Email Address</FormLabel>
                  <Input 
                    type="email" 
                    placeholder="coach@classroom.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    bg="whiteAlpha.100"
                    border="none"
                    _focus={{ ring: 2, ringColor: "purple.500" }}
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Password</FormLabel>
                  <InputGroup>
                    <Input 
                      type={showPassword ? "text" : "password"} 
                      placeholder="••••••••" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      bg="whiteAlpha.100"
                      border="none"
                      _focus={{ ring: 2, ringColor: "purple.500" }}
                    />
                    <InputRightElement>
                      <IconButton
                        variant="ghost"
                        icon={showPassword ? <FaEyeSlash /> : <FaEye />}
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label="Toggle password visibility"
                        _hover={{ bg: "transparent" }}
                      />
                    </InputRightElement>
                  </InputGroup>
                </FormControl>

                <Button 
                  type="submit" 
                  colorScheme="brand" 
                  w="full" 
                  size="lg" 
                  isLoading={isLoading}
                  mt={4}
                >
                  Sign In
                </Button>
              </VStack>
            </form>
          </Box>

          <Flex direction="column" align="center" gap={2}>
            <Text fontSize="sm" color="gray.500">Test Credentials:</Text>
            <Badge colorScheme="purple" variant="outline">coach@classroom.com / coach123</Badge>
            <Badge colorScheme="blue" variant="outline">student1@classroom.com / student123</Badge>
          </Flex>
        </VStack>
      </Container>
    </Box>
  );
};

export default Login;
