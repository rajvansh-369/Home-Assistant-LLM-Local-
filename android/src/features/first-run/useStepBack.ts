// Back rules (plan §5): the header back button and Android back both go to the screen §4 names.
// If that screen is in the stack we pop to it; after a resume it isn't, so it replaces the current
// screen (the first-run stack animates replace as a pop).
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

export function useStepBack(target: Href): () => void {
  const goBack = useCallback(() => router.dismissTo(target), [target]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        goBack();
        return true;
      });
      return () => subscription.remove();
    }, [goBack]),
  );

  return goBack;
}
