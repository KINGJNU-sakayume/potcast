import { createContext, useContext } from 'react';
import type { EpisodeRunner } from './runner';

export const EpisodeContext = createContext<EpisodeRunner | null>(null);

export function useEpisodeRunner(): EpisodeRunner {
  const runner = useContext(EpisodeContext);
  if (!runner) throw new Error('useEpisodeRunner must be used inside an EpisodeProvider');
  return runner;
}
