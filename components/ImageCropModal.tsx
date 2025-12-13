import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, Pressable, Text, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { Image } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const INITIAL_CROP_SIZE = Math.min(SCREEN_WIDTH * 0.8, SCREEN_HEIGHT * 0.6);
const MIN_CROP_SIZE = 150;
const MAX_CROP_SIZE = Math.min(SCREEN_WIDTH * 0.95, SCREEN_HEIGHT * 0.8);

interface ImageCropModalProps {
  visible: boolean;
  imageUri: string;
  onSave: (cropData: {
    x: number;
    y: number;
    width: number;
    height: number;
    imageWidth: number;
    imageHeight: number;
  }) => void;
  onDiscard: () => void;
}

export default function ImageCropModal({
  visible,
  imageUri,
  onSave,
  onDiscard,
}: ImageCropModalProps) {
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [imageLayout, setImageLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const cropSize = useSharedValue(INITIAL_CROP_SIZE);
  const cropX = useSharedValue(SCREEN_WIDTH / 2 - INITIAL_CROP_SIZE / 2);
  const cropY = useSharedValue(SCREEN_HEIGHT / 2 - INITIAL_CROP_SIZE / 2);
  const cropStartX = useSharedValue(0);
  const cropStartY = useSharedValue(0);
  const cropStartSize = useSharedValue(INITIAL_CROP_SIZE);

  useEffect(() => {
    if (visible && imageUri) {
      // Сброс значений при открытии
      cropSize.value = INITIAL_CROP_SIZE;
      cropX.value = SCREEN_WIDTH / 2 - INITIAL_CROP_SIZE / 2;
      cropY.value = SCREEN_HEIGHT / 2 - INITIAL_CROP_SIZE / 2;
      cropStartX.value = 0;
      cropStartY.value = 0;
      cropStartSize.value = INITIAL_CROP_SIZE;

      // Загружаем размер изображения
      Image.getSize(
        imageUri,
        (width, height) => {
          setImageSize({ width, height });
        },
        (error) => {
          console.error('Error getting image size:', error);
        }
      );
    }
  }, [visible, imageUri]);

  // Жест для перемещения кропа
  const cropPanGesture = Gesture.Pan()
    .onStart(() => {
      cropStartX.value = cropX.value;
      cropStartY.value = cropY.value;
    })
    .onUpdate((e) => {
      const currentSize = cropSize.value;
      const newX = cropStartX.value + e.translationX;
      const newY = cropStartY.value + e.translationY;
      
      cropX.value = Math.max(
        0,
        Math.min(SCREEN_WIDTH - currentSize, newX)
      );
      cropY.value = Math.max(
        0,
        Math.min(SCREEN_HEIGHT - currentSize, newY)
      );
    });

  // Жест для изменения размера кропа (перетаскивание угла)
  const createResizeGesture = (corner: 'topRight' | 'bottomRight' | 'topLeft' | 'bottomLeft') => {
    return Gesture.Pan()
      .onStart(() => {
        cropStartSize.value = cropSize.value;
        cropStartX.value = cropX.value;
        cropStartY.value = cropY.value;
      })
      .onUpdate((e) => {
        const deltaX = e.translationX;
        const deltaY = e.translationY;
        
        // Вычисляем изменение размера в зависимости от угла
        let sizeDelta = 0;
        if (corner === 'bottomRight') {
          // Правый нижний угол: движение вправо-вниз увеличивает размер
          sizeDelta = Math.max(deltaX, deltaY);
        } else if (corner === 'topLeft') {
          // Левый верхний угол: движение влево-вверх увеличивает размер
          sizeDelta = -Math.min(deltaX, deltaY);
        } else if (corner === 'topRight') {
          // Правый верхний угол: движение вправо-вверх увеличивает размер
          sizeDelta = deltaX - deltaY;
        } else if (corner === 'bottomLeft') {
          // Левый нижний угол: движение влево-вниз увеличивает размер
          sizeDelta = deltaY - deltaX;
        }
        
        const newSize = Math.max(
          MIN_CROP_SIZE,
          Math.min(MAX_CROP_SIZE, cropStartSize.value + sizeDelta)
        );
        
        cropSize.value = newSize;
        
        // Корректируем позицию кропа в зависимости от угла
        const sizeChange = newSize - cropStartSize.value;
        if (corner === 'bottomRight') {
          // Правый нижний угол: позиция не меняется
          cropX.value = Math.max(0, Math.min(SCREEN_WIDTH - newSize, cropStartX.value));
          cropY.value = Math.max(0, Math.min(SCREEN_HEIGHT - newSize, cropStartY.value));
        } else if (corner === 'topLeft') {
          // Левый верхний угол: двигаем влево-вверх
          cropX.value = Math.max(0, Math.min(SCREEN_WIDTH - newSize, cropStartX.value - sizeChange));
          cropY.value = Math.max(0, Math.min(SCREEN_HEIGHT - newSize, cropStartY.value - sizeChange));
        } else if (corner === 'topRight') {
          // Правый верхний угол: двигаем только вверх
          cropX.value = Math.max(0, Math.min(SCREEN_WIDTH - newSize, cropStartX.value));
          cropY.value = Math.max(0, Math.min(SCREEN_HEIGHT - newSize, cropStartY.value - sizeChange));
        } else if (corner === 'bottomLeft') {
          // Левый нижний угол: двигаем только влево
          cropX.value = Math.max(0, Math.min(SCREEN_WIDTH - newSize, cropStartX.value - sizeChange));
          cropY.value = Math.max(0, Math.min(SCREEN_HEIGHT - newSize, cropStartY.value));
        }
      });
  };

  const resizeTopRightGesture = createResizeGesture('topRight');
  const resizeBottomRightGesture = createResizeGesture('bottomRight');
  const resizeTopLeftGesture = createResizeGesture('topLeft');
  const resizeBottomLeftGesture = createResizeGesture('bottomLeft');

  const cropAnimatedStyle = useAnimatedStyle(() => {
    return {
      left: cropX.value,
      top: cropY.value,
      width: cropSize.value,
      height: cropSize.value,
    };
  });

  const cropBorderStyle = useAnimatedStyle(() => {
    return {
      width: cropSize.value,
      height: cropSize.value,
    };
  });


  const handleSave = () => {
    if (!imageSize.width || !imageSize.height || !imageLayout.width || !imageLayout.height) return;

    // Вычисляем реальные размеры отображаемого изображения с учетом aspect ratio
    const imageAspectRatio = imageSize.width / imageSize.height;
    const containerWidth = imageLayout.width;
    const containerHeight = imageLayout.height;
    
    let displayWidth = containerWidth;
    let displayHeight = containerHeight;

    // Вычисляем реальные размеры изображения с сохранением пропорций
    if (containerWidth / containerHeight > imageAspectRatio) {
      displayHeight = containerHeight;
      displayWidth = displayHeight * imageAspectRatio;
    } else {
      displayWidth = containerWidth;
      displayHeight = displayWidth / imageAspectRatio;
    }

    // Вычисляем смещение изображения относительно контейнера (центрирование)
    const imageOffsetX = (containerWidth - displayWidth) / 2;
    const imageOffsetY = (containerHeight - displayHeight) / 2;

    // Вычисляем позицию изображения на экране
    const imageScreenX = imageLayout.x + imageOffsetX;
    const imageScreenY = imageLayout.y + imageOffsetY;

    // Масштаб для преобразования координат экрана в координаты исходного изображения
    const scaleX = imageSize.width / displayWidth;
    const scaleY = imageSize.height / displayHeight;

    // Вычисляем координаты кропа на экране
    const cropScreenX = cropX.value;
    const cropScreenY = cropY.value;
    const currentCropSize = cropSize.value;

    // Вычисляем пересечение кропа с изображением
    const cropLeft = cropScreenX;
    const cropTop = cropScreenY;
    const cropRight = cropScreenX + currentCropSize;
    const cropBottom = cropScreenY + currentCropSize;

    const imageLeft = imageScreenX;
    const imageTop = imageScreenY;
    const imageRight = imageScreenX + displayWidth;
    const imageBottom = imageScreenY + displayHeight;

    // Находим пересечение кропа с изображением
    const intersectLeft = Math.max(cropLeft, imageLeft);
    const intersectTop = Math.max(cropTop, imageTop);
    const intersectRight = Math.min(cropRight, imageRight);
    const intersectBottom = Math.min(cropBottom, imageBottom);

    // Если нет пересечения, используем центр изображения
    if (intersectLeft >= intersectRight || intersectTop >= intersectBottom) {
      const centerX = imageScreenX + displayWidth / 2;
      const centerY = imageScreenY + displayHeight / 2;
      const halfCropSize = currentCropSize / 2;
      
      const cropData = {
        x: Math.max(0, (centerX - halfCropSize - imageScreenX) * scaleX),
        y: Math.max(0, (centerY - halfCropSize - imageScreenY) * scaleY),
        width: Math.min(currentCropSize * scaleX, imageSize.width),
        height: Math.min(currentCropSize * scaleY, imageSize.height),
        imageWidth: imageSize.width,
        imageHeight: imageSize.height,
      };

      cropData.x = Math.max(0, Math.min(imageSize.width - cropData.width, cropData.x));
      cropData.y = Math.max(0, Math.min(imageSize.height - cropData.height, cropData.y));
      cropData.width = Math.min(cropData.width, imageSize.width - cropData.x);
      cropData.height = Math.min(cropData.height, imageSize.height - cropData.y);

      onSave(cropData);
      return;
    }

    // Преобразуем координаты пересечения из экранных в координаты исходного изображения
    const cropData = {
      x: Math.max(0, (intersectLeft - imageScreenX) * scaleX),
      y: Math.max(0, (intersectTop - imageScreenY) * scaleY),
      width: Math.min((intersectRight - intersectLeft) * scaleX, imageSize.width),
      height: Math.min((intersectBottom - intersectTop) * scaleY, imageSize.height),
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
    };

    // Ограничиваем координаты границами изображения
    cropData.x = Math.max(0, Math.min(imageSize.width - cropData.width, cropData.x));
    cropData.y = Math.max(0, Math.min(imageSize.height - cropData.height, cropData.y));
    cropData.width = Math.min(cropData.width, imageSize.width - cropData.x);
    cropData.height = Math.min(cropData.height, imageSize.height - cropData.y);

    // Убеждаемся, что кроп квадратный (используем минимальный размер)
    const minSize = Math.min(cropData.width, cropData.height);
    cropData.width = minSize;
    cropData.height = minSize;

    // Пересчитываем позицию для центрирования
    cropData.x = Math.max(0, Math.min(imageSize.width - cropData.width, cropData.x));
    cropData.y = Math.max(0, Math.min(imageSize.height - cropData.height, cropData.y));

    onSave(cropData);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onDiscard}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onDiscard} style={styles.button}>
            <Text style={styles.buttonText}>Отмена</Text>
          </Pressable>
          <Pressable onPress={handleSave} style={styles.button}>
            <Text style={styles.buttonText}>Сохранить</Text>
          </Pressable>
        </View>

        <View style={styles.imageContainer}>
          <ExpoImage
            source={{ uri: imageUri }}
            style={styles.image}
            contentFit="contain"
            onLoad={(e) => {
              const { width, height } = e.source;
              if (width && height) {
                setImageSize({ width, height });
              }
            }}
            onLayout={(e) => {
              const { x, y, width, height } = e.nativeEvent.layout;
              setImageLayout({ x, y, width, height });
            }}
          />

          {/* Кроп рамка с ручками */}
          <Animated.View style={[styles.cropOverlay, cropAnimatedStyle]}>
            <Animated.View style={[styles.cropBorder, cropBorderStyle]} />
            
            {/* Ручки для изменения размера */}
            <GestureDetector gesture={resizeTopLeftGesture}>
              <View style={[styles.resizeHandle, styles.resizeHandleTopLeft]} />
            </GestureDetector>
            <GestureDetector gesture={resizeTopRightGesture}>
              <View style={[styles.resizeHandle, styles.resizeHandleTopRight]} />
            </GestureDetector>
            <GestureDetector gesture={resizeBottomLeftGesture}>
              <View style={[styles.resizeHandle, styles.resizeHandleBottomLeft]} />
            </GestureDetector>
            <GestureDetector gesture={resizeBottomRightGesture}>
              <View style={[styles.resizeHandle, styles.resizeHandleBottomRight]} />
            </GestureDetector>
            
            {/* Область для перемещения кропа */}
            <GestureDetector gesture={cropPanGesture}>
              <View style={StyleSheet.absoluteFill} />
            </GestureDetector>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgb(7, 7, 7)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  button: {
    padding: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  cropOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cropBorder: {
    borderWidth: 3,
    borderColor: '#fff',
    position: 'absolute',
  },
  resizeHandle: {
    position: 'absolute',
    width: 40,
    height: 40,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#4ECDC4',
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 10,
  },
  resizeHandleTopLeft: {
    top: -20,
    left: -20,
  },
  resizeHandleTopRight: {
    top: -20,
    right: -20,
  },
  resizeHandleBottomLeft: {
    bottom: -20,
    left: -20,
  },
  resizeHandleBottomRight: {
    bottom: -20,
    right: -20,
  },
});
