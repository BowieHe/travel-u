import { View, Text } from 'react-native';

export const StatCard = ({ title, value }: { title: string; value: string }) => (
  <View className="m-2 flex-1 rounded-xl bg-white p-4 shadow-sm">
    <Text className="mb-2 text-3xl font-bold">{value}</Text>
    <Text className="text-gray-600">{title}</Text>
  </View>
);
