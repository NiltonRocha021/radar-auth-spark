import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TraderProfileData {
  name?: string;
  planTier?: 'starter' | 'pro' | 'institutional';
  style?: 'conservative' | 'moderate' | 'aggressive';
  operationsToday?: number;
  drawdownToday?: number;
  bestSession?: string;
  worstSession?: string;
  avgWinRate?: number;
  overtradingRisk?: boolean;
  dnaConsistency?: number;
  dnaDiscipline?: number;
  dnaRiskControl?: number;
  dnaTiming?: number;
  dnaEmotionalControl?: number;
}

export function useTraderProfile(userId: string | undefined): {
  profile: TraderProfileData;
  loading: boolean;
} {
  const [profile, setProfile] = useState<TraderProfileData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    async function fetchProfile() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', userId!)
          .single();

        if (data) {
          setProfile({
            name: data.full_name ?? undefined,
          });
        }
      } catch (err) {
        console.warn('[useTraderProfile] erro ao buscar perfil:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [userId]);

  return { profile, loading };
}
