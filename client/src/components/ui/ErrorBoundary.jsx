import React from 'react';
import { Box, Heading, Text, Button, VStack } from '@chakra-ui/react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box h="100vh" display="flex" alignItems="center" justifyContent="center" bg="gray.900">
          <VStack spacing={6}>
            <Heading color="white">Something went wrong.</Heading>
            <Text color="gray.400">Please try refreshing the page or joining the room again.</Text>
            <Button colorScheme="purple" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </VStack>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
