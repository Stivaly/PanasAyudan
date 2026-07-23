"use client";

import dynamic from "next/dynamic";

// Aislado en su propio archivo: un dynamic(ssr:false) inline en page.tsx
// junto a otro import de cliente nuevo rompe el Client Manifest de Next
// al prerenderizar (bug del bundler webpack+RSC, no del código en sí).
export default dynamic(() => import("./MapaClusters"), { ssr: false });
