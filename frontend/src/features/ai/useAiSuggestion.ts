import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ApiClient } from '../../api/client';
import { aiApi } from '../../api/ai';
import { AiSuggestionController } from './AiSuggestionController';

export function useAiSuggestion(client: ApiClient, ticketId: string) {
  const controller = useMemo(() => new AiSuggestionController(aiApi(client), ticketId), [client, ticketId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => () => controller.stop(), [controller]);
  return { ...state, generate: controller.generate, submit: controller.submit };
}
