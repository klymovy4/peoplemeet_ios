// Вспомогательные функции для работы с картой

/**
 * Получает URL изображения пользователя
 */
export const getImageUrl = (imageName: string | null | undefined): string | null => {
  if (!imageName) return null;
  if (imageName.startsWith('http://') || imageName.startsWith('https://')) {
    return imageName;
  }
  return `https://peoplemeet.com.ua/uploads/${imageName}`;
};

/**
 * Безопасное преобразование координат в число
 */
export const parseCoordinate = (coord: string | number | null | undefined): number | null => {
  if (coord === null || coord === undefined) return null;
  if (typeof coord === 'number') return coord;
  const parsed = parseFloat(String(coord));
  return isNaN(parsed) ? null : parsed;
};

/**
 * Генерирует уникальный цвет для маркера пользователя на основе его данных
 */
export const getUserMarkerColor = (user: any): string => {
  // Собираем данные для генерации цвета
  const name = user?.name || '';
  const age = user?.age || 0;
  const sex = user?.sex || '';
  
  // Создаем строку из всех данных
  const dataString = `${name}-${age}-${sex}`;
  
  // Простая hash-функция для преобразования строки в число
  let hash = 0;
  for (let i = 0; i < dataString.length; i++) {
    const char = dataString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Используем hash для генерации RGB компонентов
  // Используем разные диапазоны для более ярких и насыщенных цветов
  const r = Math.abs(hash) % 156 + 100; // 100-255 (яркие красные)
  const g = Math.abs(hash * 7) % 156 + 100; // 100-255 (яркие зеленые)
  const b = Math.abs(hash * 13) % 156 + 100; // 100-255 (яркие синие)
  
  // Возвращаем цвет в формате hex
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

/**
 * Вычисляет расстояние между двумя точками на карте
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): string => {
  const EARTH_RADIUS = 6378137; // Radius of the Earth in meters

  const latitude1 = (lat1 * Math.PI) / 180;
  const latitude2 = (lat2 * Math.PI) / 180;
  const deltaLatitude = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLongitude = ((lon2 - lon1) * Math.PI) / 180;

  const a =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(deltaLongitude / 2) ** 2;

  const angularDistance = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = EARTH_RADIUS * angularDistance;

  return d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
};

/**
 * Форматирует время из created_at в формат HH:mm
 */
export const formatMessageTime = (createdAt: string | null | undefined): string => {
  if (!createdAt) return '';
  
  try {
    // Парсим строку времени (формат "2025-12-10 20:03:11")
    // Если строка не содержит информации о часовом поясе, 
    // интерпретируем её как UTC и конвертируем в локальное время
    let date: Date;
    
    // Проверяем, есть ли информация о часовом поясе
    if (createdAt.includes('T') || createdAt.includes('Z') || createdAt.includes('+') || createdAt.includes('-', 10)) {
      // Уже есть информация о часовом поясе
      date = new Date(createdAt);
    } else {
      // Нет информации о часовом поясе, предполагаем UTC и добавляем 'Z'
      date = new Date(createdAt.replace(' ', 'T') + 'Z');
    }
    
    // Используем локальное время устройства
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Формат 24 часа (локальное время устройства)
    const hoursStr = hours.toString().padStart(2, '0');
    const minutesStr = minutes.toString().padStart(2, '0');
    
    return `${hoursStr}:${minutesStr}`;
  } catch (error) {
    return '';
  }
};
