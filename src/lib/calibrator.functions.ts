// Server functions do calibrador (BCE).
// Wrapper fino: toda a lógica vive em `calibrator.server.ts`.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeCalibratorState } from "./calibrator.server";
import type { CalibratorStateUI } from "./calibrator";

export const getCalibratorState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CalibratorStateUI> => {
    return computeCalibratorState(context.supabase as never, context.userId);
  });
