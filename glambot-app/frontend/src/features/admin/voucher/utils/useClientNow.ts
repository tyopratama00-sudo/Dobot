'use client';

import * as React from 'react';

let cachedNow: number | undefined;

const subscribe = () => () => {};

const getClientSnapshot = (): number | undefined => {
  if (cachedNow === undefined) {
    cachedNow = Date.now();
  }
  return cachedNow;
};

const getServerSnapshot = (): number | undefined => undefined;

export const useClientNow = (): number | undefined =>
  React.useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
