import { extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
  colors: {
    brand: {
      50: '#f0eaff',
      100: '#cabaff',
      200: '#a48bff',
      300: '#7e5cff',
      400: '#582dff',
      500: '#3e14e6',
      600: '#300fb4',
      700: '#220a82',
      800: '#140650',
      900: '#06011f',
    },
  },
  styles: {
    global: {
      body: {
        bg: 'gray.900',
        color: 'white',
      },
    },
  },
  components: {
    Card: {
      baseStyle: {
        container: {
          bg: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          borderRadius: 'xl',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        },
      },
    },
    Button: {
      baseStyle: {
        borderRadius: 'lg',
      },
    },
  },
});

export default theme;
