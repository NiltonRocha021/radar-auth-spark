import { create } from "zustand";
import { persist } from "zustand/middleware";

type State = {
  compactPill: boolean;
  onboardingDone: boolean;
  setCompactPill: (v: boolean) => void;
  setOnboardingDone: (v: boolean) => void;
};

export const useBot4xPrefs = create<State>()(
  persist(
    (set) => ({
      compactPill: false,
      onboardingDone: false,
      setCompactPill: (compactPill) => set({ compactPill }),
      setOnboardingDone: (onboardingDone) => set({ onboardingDone }),
    }),
    { name: "bot4x-prefs" },
  ),
);
