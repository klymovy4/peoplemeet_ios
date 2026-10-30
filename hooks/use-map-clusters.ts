import { useMemo, useState } from 'react';
import { Dimensions } from 'react-native';
import type { Region } from 'react-native-maps';
import Supercluster from 'supercluster';

// Same settings the app used with react-native-map-clustering: only markers that nearly
// overlap are grouped, and a group needs at least 3 markers
const MIN_ZOOM = 5;
const MAX_ZOOM = 22;
const CLUSTER_OPTIONS = { radius: 10, extent: 512, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, minPoints: 3 };

export type MapPoint<T> = { key: string; latitude: number; longitude: number; data: T };

type PointProps<T> = { key: string; data: T };
type ClusterFeature<T> =
  | Supercluster.PointFeature<PointProps<T>>
  | Supercluster.ClusterFeature<Supercluster.AnyProps>;

// Clusters are computed for an area twice the visible region, so markers just off-screen
// are already there when the user pans
const regionToBBox = (region: Region): GeoJSON.BBox => [
  region.longitude - region.longitudeDelta,
  region.latitude - region.latitudeDelta,
  region.longitude + region.longitudeDelta,
  region.latitude + region.latitudeDelta,
];

// Web-mercator zoom at which that area fits the screen width
const regionToZoom = (region: Region) => {
  if (region.longitudeDelta >= 40) return MIN_ZOOM;
  const { width } = Dimensions.get('window');
  const zoom = Math.floor(Math.log2((width * 360) / (256 * 2 * region.longitudeDelta)));
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
};

/**
 * Groups nearby map points into clusters for the current region. The map renders the result
 * as one flat list of markers with stable keys ("cluster-<id>" / the point's own key), so
 * react-native-maps never has to re-order its children unexpectedly.
 */
export function useMapClusters<T>(points: MapPoint<T>[]) {
  // Unknown until the map reports its region; until then points are shown unclustered
  const [region, setRegion] = useState<Region | null>(null);

  const index = useMemo(() => {
    const cluster = new Supercluster<PointProps<T>>(CLUSTER_OPTIONS);
    cluster.load(
      points.map((point) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
        properties: { key: point.key, data: point.data },
      })),
    );
    return cluster;
  }, [points]);

  const items: ClusterFeature<T>[] = useMemo(() => {
    if (!region) {
      return points.map((point) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
        properties: { key: point.key, data: point.data },
      }));
    }
    return index.getClusters(regionToBBox(region), regionToZoom(region));
  }, [index, points, region]);

  /** Coordinates of all points inside a cluster, to zoom the map onto them */
  const getClusterCoordinates = (clusterId: number) =>
    index.getLeaves(clusterId, Infinity).map((leaf) => ({
      latitude: leaf.geometry.coordinates[1],
      longitude: leaf.geometry.coordinates[0],
    }));

  return { items, onRegionChangeComplete: setRegion, getClusterCoordinates };
}
