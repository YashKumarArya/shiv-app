import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { Pressable } from 'react-native';

export const FAB = ({ href }: { href: string }) => (
  <Link href={href as Href} asChild>
    <Pressable className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-blue-600 shadow-lg active:opacity-80">
      <Ionicons name="add" size={28} color="white" />
    </Pressable>
  </Link>
);
