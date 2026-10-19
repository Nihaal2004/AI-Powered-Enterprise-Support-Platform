import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate } from './routes';

export function RouteLink({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target || props.download) return;
    event.preventDefault();
    navigate(href);
  }
  return <a {...props} href={href} onClick={follow} />;
}
