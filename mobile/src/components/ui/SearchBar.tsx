import { TextInput } from 'react-native';

interface Props {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}

export const SearchBar = ({ value, onChange, placeholder = 'Search…' }: Props) => (
  <TextInput
    value={value}
    onChangeText={onChange}
    placeholder={placeholder}
    placeholderTextColor="#94a3b8"
    returnKeyType="search"
    className="mx-4 mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
  />
);
