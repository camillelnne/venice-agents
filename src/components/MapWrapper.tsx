'use client';

import dynamic from 'next/dynamic';
import type { GeoJsonObject } from 'geojson';

// Dynamically import the map component with no SSR
const VeniceMap = dynamic(() => import('./VeniceMap'), {
  ssr: false,
  loading: () => <div className="h-[600px] w-full bg-gray-100 animate-pulse rounded-lg" />,
});

interface MapWrapperProps {
  streetNetworkData: GeoJsonObject;
  landRegisterData: GeoJsonObject;
}

export default function MapWrapper({ streetNetworkData, landRegisterData }: MapWrapperProps) {
  return <VeniceMap streetNetworkData={streetNetworkData} landRegisterData={landRegisterData} />;
}
