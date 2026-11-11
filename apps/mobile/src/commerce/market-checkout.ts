import { Capacitor } from '@capacitor/core';
import { CAMPAIGN_SERVICES_BUILD } from '../app-profile';
import { commerceKeyForOffer } from './adventure-products';
import { useCommerce } from './commerce-context';

export function useMarketCheckout() {
  const { flow, snapshot } = useCommerce();
  const busy = ['loading', 'purchasing', 'recovering'].includes(snapshot.phase);
  const product = (key: string) => snapshot.products.find((p) => p.key === key);
  const key = (offer: string) => commerceKeyForOffer(offer) ?? offer;
  return {
    live: CAMPAIGN_SERVICES_BUILD,
    snapshot,
    flow,
    price: (offer: string, reference: string) =>
      !CAMPAIGN_SERVICES_BUILD
        ? reference
        : (product(key(offer))?.displayPrice ??
          (snapshot.wallet ? 'Price unavailable' : 'Sign in to see price')),
    disabled: (offer: string) =>
      CAMPAIGN_SERVICES_BUILD &&
      (!Capacitor.isNativePlatform() ||
        busy ||
        (!!snapshot.wallet && (snapshot.phase !== 'ready' || !product(key(offer))))),
    label: (offer: string) =>
      !Capacitor.isNativePlatform()
        ? 'Available in the app'
        : busy
          ? 'Please wait…'
          : !snapshot.wallet
            ? 'Sign in to buy'
            : product(key(offer))
              ? 'Buy for ' + product(key(offer))!.displayPrice
              : 'Not available yet',
  };
}
