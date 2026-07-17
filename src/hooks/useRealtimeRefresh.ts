"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export interface RealtimeTable {
  table: string;
  filter?: string;
}

export function useRealtimeRefresh(
  channelName: string,
  tables: RealtimeTable[],
  onRefresh: () => void,
  enabled = true
): void {
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    const scheduleRefresh = () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        onRefreshRef.current();
      }, 400);
    };

    let canal = supabase.channel(channelName);
    for (const table of tables) {
      canal = canal.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: table.table,
          ...(table.filter ? { filter: table.filter } : {}),
        },
        scheduleRefresh
      );
    }

    canal.subscribe();

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      void supabase.removeChannel(canal);
    };
  }, [channelName, enabled, tables]);
}
