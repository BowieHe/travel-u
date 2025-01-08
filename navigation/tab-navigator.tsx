import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StackScreenProps } from '@react-navigation/stack';

import { RootStackParamList } from '.';
import { HeaderButton } from '../components/HeaderButton';
import { Entypo, FontAwesome5, MaterialIcons } from '@expo/vector-icons';

import Home from '../screens/home';
import User from '../screens/user';
import Add from '../screens/add';

const Tab = createBottomTabNavigator();

type Props = StackScreenProps<RootStackParamList, 'TabNavigator'>;

export default function TabLayout({ navigation }: Props) {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: 'black',
      }}>
      <Tab.Screen
        name="Home"
        component={Home}
        options={{
          title: '计划',
          headerShown: false,
          tabBarIcon: ({ color }) => <Entypo name="pin" size={24} color={color} />,
          // headerRight: () => <HeaderButton onPress={() => navigation.navigate('Modal')} />,
        }}
      />
      <Tab.Screen
        name="Add"
        component={Add}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <MaterialIcons name="add-box" size={24} color={color} />,
        }}
      />
      <Tab.Screen
        name="User"
        component={User}
        options={{
          title: '我',
          headerShown: false,
          tabBarIcon: ({ color }) => <FontAwesome5 name="user-ninja" size={24} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
