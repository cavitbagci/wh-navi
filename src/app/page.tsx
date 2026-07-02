"use client";
import { APIProvider } from "@vis.gl/react-google-maps";
import NavigationApp from "@/components/NavigationApp";

export default function Home() {
  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!} language="tr" region="TR">
      <NavigationApp />
    </APIProvider>
  );
}
