import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

export type BackgroundVariant = 'default' | 'auth';

const palettes = {
  default: ['#fff8ed', '#f6f0ff', '#eafcff'] as const,
  auth: ['#fff8ed', '#fbeefe', '#ebfbff'] as const,
};

/** A quiet, layered backdrop that gives white operational surfaces visual depth. */
export const AppBackground = ({ variant = 'default' }: { variant?: BackgroundVariant }) => (
  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <LinearGradient
      colors={palettes[variant]}
      locations={[0, 0.52, 1]}
      start={{ x: 0.08, y: 0 }}
      end={{ x: 0.92, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
    <View style={[styles.orb, styles.topOrb, variant === 'auth' && styles.authTopOrb]} />
    <View style={[styles.orb, styles.middleOrb]} />
    <View style={[styles.orb, styles.bottomOrb]} />
  </View>
);

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  topOrb: {
    width: 280,
    height: 280,
    right: -110,
    top: -125,
    backgroundColor: 'rgba(251, 146, 60, 0.22)',
  },
  authTopOrb: {
    width: 340,
    height: 340,
    right: -130,
    top: -150,
    backgroundColor: 'rgba(244, 114, 182, 0.2)',
  },
  middleOrb: {
    width: 190,
    height: 190,
    left: -115,
    top: '40%',
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
  },
  bottomOrb: {
    width: 250,
    height: 250,
    right: -145,
    bottom: -120,
    backgroundColor: 'rgba(6, 182, 212, 0.16)',
  },
});
