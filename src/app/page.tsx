"use client";
import dynamic from "next/dynamic";
const GridMap = dynamic(() => import("@/components/GridMap"), { ssr: false });
export default function Page(){ return <GridMap/>; }
