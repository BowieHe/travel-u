import { View, Text, Image, TouchableOpacity } from 'react-native';

type TripCardProps = {
  title: string;
  days: string;
  spots: string;
  imageUrl: string;
};

export const TripCard = ({ title, days, spots, imageUrl }: TripCardProps) => {
  return (
    <TouchableOpacity className="mb-4 rounded-xl bg-white p-4 shadow-sm">
      <Text className="mb-2 text-lg font-bold">{title}</Text>
      <View className="mb-2 flex-row">
        <Text className="mr-4 text-gray-600">{days}</Text>
        <Text className="text-gray-600">{spots}</Text>
      </View>
      <Image source={{ uri: imageUrl }} className="h-40 w-full rounded-lg" />
    </TouchableOpacity>
  );
};
