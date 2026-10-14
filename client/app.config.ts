import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    "name": "知行工作台",
    "slug": "zhixing-workbench",
    "version": "2.0.0",
    "orientation": "default",
    "icon": "./assets/images/icon.png",
    "scheme": "zhixing-workbench",
    "userInterfaceStyle": "dark",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#020617"
      },
      "package": "com.zhixing.workbench"
    },
    "web": {
      "bundler": "metro",
      "output": "single",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      process.env.EXPO_PUBLIC_BACKEND_BASE_URL ? [
        "expo-router",
        {
          "origin": process.env.EXPO_PUBLIC_BACKEND_BASE_URL
        }
      ] : 'expo-router',
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#020617"
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": `允许知行工作台访问您的相册，以便您上传或保存图片。`,
          "cameraPermission": `允许知行工作台使用您的相机，以便您直接拍摄照片上传。`,
          "microphonePermission": `允许知行工作台访问您的麦克风，以便您拍摄带有声音的视频。`
        }
      ],
      [
        "expo-location",
        {
          "locationWhenInUsePermission": `知行工作台需要访问您的位置以提供周边服务及导航功能。`
        }
      ],
      [
        "expo-camera",
        {
          "cameraPermission": `知行工作台需要访问相机以拍摄照片和视频。`,
          "microphonePermission": `知行工作台需要访问麦克风以录制视频声音。`,
          "recordAudioAndroid": true
        }
      ],
      [
        "expo-media-library",
        {
          "photosPermission": `允许知行工作台访问您的相册，以便查看和保存图片。`,
          "savePhotosPermission": `允许知行工作台将图片保存到您的相册。`,
          "isAccessMediaLocationEnabled": false
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
