import React from 'react';
import { View, Text, Dimensions } from 'react-native';
import Animated, {
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { PanGestureHandler } from 'react-native-gesture-handler';
import Mapbox from '@rnmapbox/maps';
import { StatCard } from 'components/user/StatCard';
import { EXPO_PUBLIC_MAPBOX_TOKEN } from '@env';

// 确保在组件外初始化 Mapbox
Mapbox.setAccessToken(EXPO_PUBLIC_MAPBOX_TOKEN);

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAX_TRANSLATE_Y = -SCREEN_HEIGHT + 50;

// const StatCard = ({ title, value }: { title: string; value: string }) => (
//   <View className="m-2 flex-1 rounded-xl bg-white p-4 shadow-sm">
//     <Text className="mb-2 text-3xl font-bold">{value}</Text>
//     <Text className="text-gray-600">{title}</Text>
//   </View>
// );

const SeasonCard = () => (
  <View className="m-2 flex-1 rounded-xl bg-blue-50 p-4">
    <Text className="mb-2 text-gray-600">出行最多的季节</Text>
    <Text className="text-3xl">冬</Text>
  </View>
);

export default function User() {
  const [mapError, setMapError] = React.useState<string | null>(null);
  const [isMapReady, setIsMapReady] = React.useState(false);
  const translateY = useSharedValue(0);

  console.log(EXPO_PUBLIC_MAPBOX_TOKEN);
  const panGestureEvent = useAnimatedGestureHandler({
    onStart: (_, context: any) => {
      context.startY = translateY.value;
    },
    onActive: (event, context) => {
      const newTranslateY = context.startY + event.translationY;
      translateY.value = Math.max(MAX_TRANSLATE_Y, Math.min(0, newTranslateY));
    },
    onEnd: () => {
      if (translateY.value > -SCREEN_HEIGHT / 3) {
        translateY.value = withSpring(0);
      } else {
        translateY.value = withSpring(MAX_TRANSLATE_Y);
      }
    },
  });

  const rBottomSheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  return (
    <View className="flex-1">
      <View className="flex-1">
        <Mapbox.MapView
          className="h-full w-full"
          styleURL={Mapbox.StyleURL.Street}
          rotateEnabled={false}
          scrollEnabled={true}
          zoomEnabled={true}
          onDidFinishLoadingMap={() => setIsMapReady(true)}
          onMapLoadingError={() => setMapError('地图加载失败')}>
          <Mapbox.Camera
            zoomLevel={14}
            centerCoordinate={[121.4737, 31.2304]}
            animationMode="flyTo"
            animationDuration={0}
          />
        </Mapbox.MapView>

        {/* 显示加载状态或错误信息 */}
        {!isMapReady && (
          <View className="absolute inset-0 items-center justify-center bg-white">
            <Text>加载地图中...</Text>
          </View>
        )}
        {mapError && (
          <View className="absolute inset-0 items-center justify-center bg-white">
            <Text className="text-red-500">地图加载失败: {mapError}</Text>
          </View>
        )}
      </View>

      {/* 可拖拽窗口 */}
      <PanGestureHandler onGestureEvent={panGestureEvent}>
        <Animated.View
          style={[rBottomSheetStyle]}
          className="absolute left-0 right-0 top-[100%] rounded-t-3xl bg-gray-50 p-4">
          {/* 拖动条 */}
          <View className="mb-4 h-1 w-16 self-center rounded-full bg-gray-300" />

          <Text className="mb-4 text-2xl font-bold">概览</Text>

          <View className="flex-row flex-wrap">
            <StatCard title="国家" value="1" />
            <StatCard title="城市" value="1" />
          </View>
          <View className="flex-row flex-wrap">
            <StatCard title="地点" value="1" />
            <SeasonCard />
          </View>
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}
