import MapWrapper from '@/components/MapWrapper';
import streetNetworkData from '../../public/1808_street_network.geojson';
import landRegisterData from '../../public/venice_1808_landregister_geometries.geojson';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-black dark:text-white mb-2">
            Venice Street Network (1808)
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Explore the historical street network and land register of Venice from 1808
          </p>
        </div>
        
        <div className="mb-8">
          <MapWrapper 
            streetNetworkData={streetNetworkData} 
            landRegisterData={landRegisterData}
          />
        </div>

        <div className="mt-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          <p>Interactive map powered by Leaflet and OpenStreetMap</p>
        </div>
      </main>
    </div>
  );
}
