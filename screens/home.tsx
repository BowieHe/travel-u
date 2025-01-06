import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SearchBar } from '../components/home/SearchBar';
import { TagList } from '../components/home/TagList';
import { TripCard } from '../components/home/TripCard';

export default function Home() {
  return (
    <ScrollView className="flex-1 bg-white">
      <View className="p-4">
        <Text className="mb-6 text-2xl font-bold">行程计划</Text>

        {/* 精选行程部分 */}
        <View className="mb-6">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-gray-600">精选行程</Text>
            <TouchableOpacity>
              <Text className="text-gray-600">更多</Text>
            </TouchableOpacity>
          </View>

          <View className="mb-4 flex-row space-x-2">
            <SearchBar />
            <TagList />
          </View>
        </View>

        {/* 我的行程部分 */}
        <View>
          <Text className="mb-4 text-lg font-semibold text-gray-600">我的行程</Text>
          <TripCard
            title="时隔20年！LV✕村上隆 上海快闪"
            days="1天0晚"
            spots="3个地点"
            imageUrl="https://example.com/image.jpg"
          />
        </View>
      </View>
    </ScrollView>
  );
}
