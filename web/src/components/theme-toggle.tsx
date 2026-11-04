"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { Segmented } from "@/components/segmented";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The stored theme is only known in the browser, so render it after hydration.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  return (
    <Segmented
      label="Theme"
      value={mounted ? theme : undefined}
      onChange={setTheme}
      options={[
        { value: "light", label: "Light", icon: <SunIcon />, iconOnly: true },
        { value: "dark", label: "Dark", icon: <MoonIcon />, iconOnly: true },
        {
          value: "system",
          label: "System",
          icon: <MonitorIcon />,
          iconOnly: true,
        },
      ]}
    />
  );
}
