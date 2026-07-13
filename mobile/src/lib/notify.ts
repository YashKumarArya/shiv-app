import { Alert, Platform } from 'react-native';

/** Simple cross-platform message for native and the supported Expo web build. */
export const notify = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    globalThis.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
};
