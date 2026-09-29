'use client';

import { useEffect, useState } from 'react';
import { DevicePreview } from '../DevicePreview';

/**
 * Desktop / Tablet / Mobile switcher: in development, for signed-in staff (hint cookie set at login),
 * or for everyone with NEXT_PUBLIC_DEVICE_PREVIEW=on. Decided in the browser so pages stay cacheable.
 */
export function DevicePreviewGate() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const v = process.env.NEXT_PUBLIC_DEVICE_PREVIEW;
    if (v === 'off') return;
    setShow(v === 'on' || process.env.NODE_ENV !== 'production' || document.cookie.split('; ').some((c) => c === 'ww_staff=1'));
  }, []);
  return show ? <DevicePreview /> : null;
}
