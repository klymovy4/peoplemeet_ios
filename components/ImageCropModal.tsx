import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, Pressable, Text, Dimensions, Image } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MIN_CROP_SIZE = 80;
// Share of the shorter image side taken by the crop frame when it opens
const INITIAL_CROP_RATIO = 0.9;

interface ImageCropModalProps {
  visible: boolean;
  imageUri: string;
  // Pixel size of the picked image. The crop is computed in these pixels, so it must
  // describe the same (EXIF-rotated) image that ImageManipulator crops
  imageWidth?: number;
  imageHeight?: number;
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
  imageWidth,
  imageHeight,
  onSave,
  onDiscard,
}: ImageCropModalProps) {
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [imageLayout, setImageLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const cropSize = useSharedValue(0);
  const cropX = useSharedValue(0);
  const cropY = useSharedValue(0);
  const cropStartX = useSharedValue(0);
  const cropStartY = useSharedValue(0);
  const cropStartSize = useSharedValue(0);
  // The visible image rectangle (container coordinates): the crop frame never leaves it,
  // so what is inside the frame is exactly what gets saved
  const boundsLeft = useSharedValue(0);
  const boundsTop = useSharedValue(0);
  const boundsRight = useSharedValue(0);
  const boundsBottom = useSharedValue(0);

  useEffect(() => {
    if (!visible || !imageUri) return;

    if (imageWidth && imageHeight) {
      setImageSize({ width: imageWidth, height: imageHeight });
      return;
    }
    // Fallback when the caller doesn't know the size
    Image.getSize(
      imageUri,
      (width, height) => setImageSize({ width, height }),
      (error) => console.error('Error getting image size:', error)
    );
  }, [visible, imageUri, imageWidth, imageHeight]);

  // Where the image is actually drawn inside its view (contentFit="contain" letterboxes it)
  const getDisplayRect = () => {
    if (!imageSize.width || !imageSize.height || !imageLayout.width || !imageLayout.height) return null;

    const imageAspectRatio = imageSize.width / imageSize.height;
    let displayWidth = imageLayout.width;
    let displayHeight = imageLayout.width / imageAspectRatio;
    if (displayHeight > imageLayout.height) {
      displayHeight = imageLayout.height;
      displayWidth = displayHeight * imageAspectRatio;
    }

    return {
      left: imageLayout.x + (imageLayout.width - displayWidth) / 2,
      top: imageLayout.y + (imageLayout.height - displayHeight) / 2,
      width: displayWidth,
      height: displayHeight,
    };
  };

  // Once the image is measured, limit the frame to it and center the frame
  useEffect(() => {
    const rect = getDisplayRect();
    if (!visible || !rect) return;

    boundsLeft.value = rect.left;
    boundsTop.value = rect.top;
    boundsRight.value = rect.left + rect.width;
    boundsBottom.value = rect.top + rect.height;

    const size = Math.min(rect.width, rect.height) * INITIAL_CROP_RATIO;
    cropSize.value = size;
    cropX.value = rect.left + (rect.width - size) / 2;
    cropY.value = rect.top + (rect.height - size) / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, imageSize, imageLayout]);

  // Gesture for moving the crop
  const cropPanGesture = Gesture.Pan()
    .onStart(() => {
      cropStartX.value = cropX.value;
      cropStartY.value = cropY.value;
    })
    .onUpdate((e) => {
      const size = cropSize.value;
      cropX.value = Math.max(boundsLeft.value, Math.min(boundsRight.value - size, cropStartX.value + e.translationX));
      cropY.value = Math.max(boundsTop.value, Math.min(boundsBottom.value - size, cropStartY.value + e.translationY));
    });

  // Gesture for resizing the crop by dragging a corner: the opposite corner stays in place
  const createResizeGesture = (corner: 'topRight' | 'bottomRight' | 'topLeft' | 'bottomLeft') => {
    return Gesture.Pan()
      .onStart(() => {
        cropStartSize.value = cropSize.value;
        cropStartX.value = cropX.value;
        cropStartY.value = cropY.value;
      })
      .onUpdate((e) => {
        const startSize = cropStartSize.value;
        const left = cropStartX.value;
        const top = cropStartY.value;
        const right = left + startSize;
        const bottom = top + startSize;
        const growsLeft = corner === 'topLeft' || corner === 'bottomLeft';
        const growsUp = corner === 'topLeft' || corner === 'topRight';

        // Dragging away from the opposite corner grows the frame
        const deltaX = growsLeft ? -e.translationX : e.translationX;
        const deltaY = growsUp ? -e.translationY : e.translationY;

        // The frame can't grow past the image edges on the moving sides
        const maxWidth = growsLeft ? right - boundsLeft.value : boundsRight.value - left;
        const maxHeight = growsUp ? bottom - boundsTop.value : boundsBottom.value - top;
        const maxSize = Math.min(maxWidth, maxHeight);
        const minSize = Math.min(MIN_CROP_SIZE, maxSize);

        const newSize = Math.max(minSize, Math.min(maxSize, startSize + Math.max(deltaX, deltaY)));
        cropSize.value = newSize;
        cropX.value = growsLeft ? right - newSize : left;
        cropY.value = growsUp ? bottom - newSize : top;
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

  // Avatars are shown as circles on the map: the guide shows what stays visible
  const cropCircleStyle = useAnimatedStyle(() => {
    return {
      width: cropSize.value,
      height: cropSize.value,
      borderRadius: cropSize.value / 2,
    };
  });

  const handleSave = () => {
    const rect = getDisplayRect();
    if (!rect) return;

    // Screen points -> source image pixels
    const scale = imageSize.width / rect.width;
    const shortSide = Math.min(imageSize.width, imageSize.height);

    const size = Math.min(cropSize.value * scale, shortSide);
    const x = Math.max(0, Math.min(imageSize.width - size, (cropX.value - rect.left) * scale));
    const y = Math.max(0, Math.min(imageSize.height - size, (cropY.value - rect.top) * scale));

    onSave({
      x,
      y,
      width: size,
      height: size,
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
    });
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
            <Text style={styles.buttonText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleSave} style={styles.button}>
            <Text style={styles.buttonText}>Save</Text>
          </Pressable>
        </View>

        <View style={styles.imageContainer}>
          <ExpoImage
            source={{ uri: imageUri }}
            style={styles.image}
            contentFit="contain"
            onLayout={(e) => {
              const { x, y, width, height } = e.nativeEvent.layout;
              setImageLayout({ x, y, width, height });
            }}
          />

          {/* Crop frame with handles */}
          <Animated.View style={[styles.cropOverlay, cropAnimatedStyle]}>
            <Animated.View style={[styles.cropBorder, cropBorderStyle]} />
            <Animated.View style={[styles.cropCircle, cropCircleStyle]} pointerEvents="none" />
            
            {/* Resize handles */}
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
            
            {/* Area for moving the crop */}
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
  cropCircle: {
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    borderStyle: 'dashed',
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
