import { ScrollView, TouchableOpacity, Text } from 'react-native';
import { useState } from 'react';

const tags = [
  { id: 1, text: 'Citywalk 🚶' },
  { id: 2, text: '冬天也好玩⛄️' },
  { id: 3, text: '到县城去🏃' },
];

export const TagList = () => {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
      {tags.map((tag) => (
        <TouchableOpacity
          key={tag.id}
          className={`mr-2 rounded-full border border-gray-200 px-4 py-2 ${
            selectedTag === tag.text ? 'border-2 border-black' : ''
          }`}
          onPress={() => setSelectedTag(tag.text)}>
          <Text
            className={`text-gray-700 ${selectedTag === tag.text ? 'font-bold text-black' : ''}`}>
            {tag.text}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};
