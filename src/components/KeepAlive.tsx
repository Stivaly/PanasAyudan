"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function KeepAlive() {
  useEffect(() => {
    const ping = () => {
      supabase
        .from("categories")
        .select("id")
        .limit(1)
        .then(() => {});
    };

    ping();
    const id = setInterval(ping, 9 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return null;
}
