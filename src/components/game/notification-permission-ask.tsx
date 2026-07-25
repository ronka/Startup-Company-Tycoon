import { useEffect } from 'react';

import { requestNotificationPermissionOnce, type PermissionTrigger } from '@/state/notification-permission';

/**
 * Mount-to-ask: rendering this *is* the permission request, so callers express
 * "ask here" by putting it in the tree under whatever condition means "here"
 * rather than restating that condition inside an effect. Renders nothing.
 *
 * `requestNotificationPermissionOnce` is a no-op after the first call, so
 * remounting is harmless.
 */
export function NotificationPermissionAsk({ trigger }: { trigger: PermissionTrigger }) {
  useEffect(() => {
    requestNotificationPermissionOnce(trigger).catch(() => {});
  }, [trigger]);

  return null;
}
