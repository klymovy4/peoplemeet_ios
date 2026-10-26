import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, Pressable, Text, Dimensions , Image} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';

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
      // Reset values on open
      cropSize.value = INITIAL_CROP_SIZE;
      cropX.value = SCREEN_WIDTH / 2 - INITIAL_CROP_SIZE / 2;
      cropY.value = SCREEN_HEIGHT / 2 - INITIAL_CROP_SIZE / 2;
      cropStartX.value = 0;
      cropStartY.value = 0;
      cropStartSize.value = INITIAL_CROP_SIZE;

      // Load the image size
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

  // Gesture for moving the crop
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

  // Gesture for resizing the crop (dragging a corner)
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
        
        // Compute the size change depending on the corner
        let sizeDelta = 0;
        if (corner === 'bottomRight') {
          // Bottom-right corner: moving right/down increases the size
          sizeDelta = Math.max(deltaX, deltaY);
        } else if (corner === 'topLeft') {
          // Top-left corner: moving left/up increases the size
          sizeDelta = -Math.min(deltaX, deltaY);
        } else if (corner === 'topRight') {
          // Top-right corner: moving right/up increases the size
          sizeDelta = deltaX - deltaY;
        } else if (corner === 'bottomLeft') {
          // Bottom-left corner: moving left/down increases the size
          sizeDelta = deltaY - deltaX;
        }
        
        const newSize = Math.max(
          MIN_CROP_SIZE,
          Math.min(MAX_CROP_SIZE, cropStartSize.value + sizeDelta)
        );
        
        cropSize.value = newSize;
        
        // Adjust the crop position depending on the corner
        const sizeChange = newSize - cropStartSize.value;
        if (corner === 'bottomRight') {
          // Bottom-right corner: position does not change
          cropX.value = Math.max(0, Math.min(SCREEN_WIDTH - newSize, cropStartX.value));
          cropY.value = Math.max(0, Math.min(SCREEN_HEIGHT - newSize, cropStartY.value));
        } else if (corner === 'topLeft') {
          // Top-left corner: move left/up
          cropX.value = Math.max(0, Math.min(SCREEN_WIDTH - newSize, cropStartX.value - sizeChange));
          cropY.value = Math.max(0, Math.min(SCREEN_HEIGHT - newSize, cropStartY.value - sizeChange));
        } else if (corner === 'topRight') {
          // Top-right corner: move up only
          cropX.value = Math.max(0, Math.min(SCREEN_WIDTH - newSize, cropStartX.value));
          cropY.value = Math.max(0, Math.min(SCREEN_HEIGHT - newSize, cropStartY.value - sizeChange));
        } else if (corner === 'bottomLeft') {
          // Bottom-left corner: move left only
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

    // Compute the actual size of the displayed image, accounting for aspect ratio
    const imageAspectRatio = imageSize.width / imageSize.height;
    const containerWidth = imageLayout.width;
    const containerHeight = imageLayout.height;
    
    let displayWidth = containerWidth;
    let displayHeight = containerHeight;

    // Compute the actual image size, preserving proportions
    if (containerWidth / containerHeight > imageAspectRatio) {
      displayHeight = containerHeight;
      displayWidth = displayHeight * imageAspectRatio;
    } else {
      displayWidth = containerWidth;
      displayHeight = displayWidth / imageAspectRatio;
    }

    // Compute the image offset relative to the container (centering)
    const imageOffsetX = (containerWidth - displayWidth) / 2;
    const imageOffsetY = (containerHeight - displayHeight) / 2;

    // Compute the image position on screen
    const imageScreenX = imageLayout.x + imageOffsetX;
    const imageScreenY = imageLayout.y + imageOffsetY;

    // Scale for converting screen coordinates to source image coordinates
    const scaleX = imageSize.width / displayWidth;
    const scaleY = imageSize.height / displayHeight;

    // Compute the crop coordinates on screen
    const cropScreenX = cropX.value;
    const cropScreenY = cropY.value;
    const currentCropSize = cropSize.value;

    // Compute the intersection of the crop and the image
    const cropLeft = cropScreenX;
    const cropTop = cropScreenY;
    const cropRight = cropScreenX + currentCropSize;
    const cropBottom = cropScreenY + currentCropSize;

    const imageLeft = imageScreenX;
    const imageTop = imageScreenY;
    const imageRight = imageScreenX + displayWidth;
    const imageBottom = imageScreenY + displayHeight;

    // Find the intersection of the crop and the image
    const intersectLeft = Math.max(cropLeft, imageLeft);
    const intersectTop = Math.max(cropTop, imageTop);
    const intersectRight = Math.min(cropRight, imageRight);
    const intersectBottom = Math.min(cropBottom, imageBottom);

    // If there is no intersection, use the image center
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

    // Convert the intersection from screen coordinates to source image coordinates
    const cropData = {
      x: Math.max(0, (intersectLeft - imageScreenX) * scaleX),
      y: Math.max(0, (intersectTop - imageScreenY) * scaleY),
      width: Math.min((intersectRight - intersectLeft) * scaleX, imageSize.width),
      height: Math.min((intersectBottom - intersectTop) * scaleY, imageSize.height),
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
    };

    // Clamp coordinates to the image bounds
    cropData.x = Math.max(0, Math.min(imageSize.width - cropData.width, cropData.x));
    cropData.y = Math.max(0, Math.min(imageSize.height - cropData.height, cropData.y));
    cropData.width = Math.min(cropData.width, imageSize.width - cropData.x);
    cropData.height = Math.min(cropData.height, imageSize.height - cropData.y);

    // Make sure the crop is square (use the smaller side)
    const minSize = Math.min(cropData.width, cropData.height);
    cropData.width = minSize;
    cropData.height = minSize;

    // Recalculate the position for centering
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

          {/* Crop frame with handles */}
          <Animated.View style={[styles.cropOverlay, cropAnimatedStyle]}>
            <Animated.View style={[styles.cropBorder, cropBorderStyle]} />
            
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
