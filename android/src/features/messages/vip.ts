// VIP matching (docs/aster-messages-alerts-plan.md §5 The rules on the phone), the same rules as the
// native engine's AlertRules.vipFor and MessageText.normalize, so 4.1's VIP section, the badges and
// the 3.1 / 3.2 cards agree with what Aster speaks.
import type { MessageSource, VipContact } from '@/services/api';

import type { CapturedThread } from '../../../modules/aster-system';

/** Unicode NFKC, lower case, spaces collapsed, trimmed. */
export function normalizeName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The enabled VIP a message is from: its sender (or a one-to-one chat's title) on its app. */
export function vipFor(
  vips: VipContact[],
  source: MessageSource,
  sender: string,
  title: string,
  isGroup: boolean,
): VipContact | null {
  const names = new Set((isGroup ? [sender] : [sender, title]).map(normalizeName));
  return (
    vips.find(
      (vip) =>
        vip.enabled && vip.sources.includes(source) && names.has(normalizeName(vip.match_key)),
    ) ?? null
  );
}

/** The VIP behind a thread: a one-to-one chat's contact, or the last VIP who wrote in a group. */
export function threadVip(thread: CapturedThread, vips: VipContact[]): VipContact | null {
  if (!thread.isGroup) return vipFor(vips, thread.source, thread.title, thread.title, false);
  for (const sender of [...thread.unreadSenders].reverse()) {
    const vip = vipFor(vips, thread.source, sender, thread.title, true);
    if (vip) return vip;
  }
  return vipFor(vips, thread.source, thread.last.sender, thread.title, true);
}

/** Unread received messages from VIPs in a thread. */
export function unreadVipCount(thread: CapturedThread, vips: VipContact[]): number {
  return thread.unreadSenders.filter(
    (sender) => vipFor(vips, thread.source, sender, thread.title, thread.isGroup) != null,
  ).length;
}

/** The VIP contact (enabled or not) whose match key is this one-to-one chat's name on its app. */
export function vipForTitle(
  vips: VipContact[],
  source: MessageSource,
  title: string,
): VipContact | null {
  const name = normalizeName(title);
  return (
    vips.find((vip) => vip.sources.includes(source) && normalizeName(vip.match_key) === name) ??
    null
  );
}
