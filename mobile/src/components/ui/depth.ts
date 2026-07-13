import { StyleSheet } from 'react-native';

/** Cross-platform elevation scale. Keep dense rows subtle and reserve floating for primary actions. */
export const depth = StyleSheet.create({
  subtle: {
    shadowColor: '#102a43',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: '#102a43',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 5,
  },
  hero: {
    shadowColor: '#102a43',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  floating: {
    shadowColor: '#153e75',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 10,
  },
  chrome: {
    shadowColor: '#102a43',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 10,
  },
});
