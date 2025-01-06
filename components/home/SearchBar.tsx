import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const SearchBar = () => {
  return (
    <TouchableOpacity className="flex-row items-center rounded-full border border-gray-200 px-4 py-2">
      <Ionicons name="search" size={20} color="#666" />
    </TouchableOpacity>
  );
};
