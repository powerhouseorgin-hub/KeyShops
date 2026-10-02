import { FirestoreService } from '../firestore.service';
import { computeSubscriptionState, type SubscriptionState } from '../../common/subscription-status';

// Looks up a shop's latest subscription (shops/{shopId}/subscriptions) and feeds it to
// computeSubscriptionState, a pure function with no DB dependency.
export async function getShopSubscriptionStateFirestore(
  firestore: FirestoreService,
  shopId: string,
): Promise<{ state: SubscriptionState; daysRemaining: number | null; endDate: number | null }> {
  const snap = await firestore.db
    .collection('shops')
    .doc(shopId)
    .collection('subscriptions')
    .where('status', '==', 'ACTIVE')
    .orderBy('endDate', 'desc')
    .limit(1)
    .get();

  if (snap.empty) {
    return { state: 'GRACE_PERIOD_EXPIRED', daysRemaining: 0, endDate: null };
  }

  const sub = snap.docs[0].data();
  const { state, daysRemaining } = computeSubscriptionState(new Date(sub.endDate));
  return { state, daysRemaining, endDate: sub.endDate };
}
