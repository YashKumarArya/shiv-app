import { Ionicons } from '@expo/vector-icons';
import { Pressable, TextInput, View } from 'react-native';
import { depth } from './depth';

interface Props {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}

export const SearchBar = ({ value, onChange, placeholder = 'Search…' }: Props) => (
  <View style={depth.subtle} className="mx-4 mt-3 min-h-[50px] flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
    <Ionicons name="search" size={19} color="#7b8ba1" />
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      returnKeyType="search"
      accessibilityLabel={placeholder}
      className="ml-2 flex-1 py-3 text-[15px] text-slate-800"
    />
    {value ? (
      <Pressable
        onPress={() => onChange('')}
        accessibilityRole="button"
        accessibilityLabel="Clear search"
        hitSlop={10}
        className="ml-2 p-1"
      >
        <Ionicons name="close-circle" size={19} color="#94a3b8" />
      </Pressable>
    ) : null}
  </View>
);
