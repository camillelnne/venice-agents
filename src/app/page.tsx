"use client";
import dynamic from "next/dynamic";
const VeniceMap = dynamic(() => import("@/components/VeniceMap"), { ssr: false });
export default function Page(){ return <VeniceMap/>; }
