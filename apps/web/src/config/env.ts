/** The socket URL follows the page, so previews and the car both just work. */
export function wsUrl(hub: string): string {
  const override = import.meta.env['VITE_WS_URL'];
  if (typeof override === 'string' && override.length > 0) return `${override}?hub=${hub}`;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws?hub=${hub}`;
}

export const isE2E = (): boolean =>
  import.meta.env.DEV || new URLSearchParams(location.search).has('e2e');
