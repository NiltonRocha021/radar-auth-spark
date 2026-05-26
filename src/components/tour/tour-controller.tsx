import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useTourStore } from "@/lib/tour-store";
import { tourForRoute } from "@/lib/tour-content";
import { TourOverlay } from "./tour-overlay";
import { TourHelpButton } from "./help-button";
import { WelcomeModal } from "./welcome-modal";

export function TourController() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const skipAll = useTourStore((s) => s.skipAll);
  const completedTours = useTourStore((s) => s.completedTours);
  const activeTour = useTourStore((s) => s.activeTour);
  const welcomeSeen = useTourStore((s) => s.welcomeSeen);
  const startTour = useTourStore((s) => s.startTour);
  const lastPath = useRef<string>("");

  useEffect(() => {
    if (lastPath.current === path) return;
    lastPath.current = path;
    if (skipAll || activeTour) return;
    const tour = tourForRoute(path);
    if (!tour || tour.manualOnly) return;
    if (completedTours.includes(tour.id)) return;
    // The dashboard tour starts only after Welcome modal is dismissed
    if (tour.id === "dashboard" && !welcomeSeen) return;
    const t = setTimeout(() => startTour(tour.id), 800);
    return () => clearTimeout(t);
  }, [path, skipAll, activeTour, completedTours, welcomeSeen, startTour]);

  // Welcome modal only on /dashboard
  const showWelcome = path === "/dashboard" || path.startsWith("/dashboard/");

  return (
    <>
      {showWelcome && <WelcomeModal />}
      <TourOverlay />
      <TourHelpButton />
    </>
  );
}
