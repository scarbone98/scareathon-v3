import { forwardRef, useEffect, useRef, type HTMLAttributes } from 'react';
import './Modal.css';

// The backdrop always covers the shell's visual viewport; panel sizing belongs
// to the inner card so feature styles cannot shrink the backdrop.
export const Modal = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Modal({ children, className = '', ...props }, ref) {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = layer.current;
    if (!panel) return;
    const siblings = Array.from(panel.parentElement?.children ?? []).filter(node => node !== panel && node instanceof HTMLElement) as HTMLElement[];
    const saved = siblings.map(node => ({ node, inert: node.inert }));
    saved.forEach(({ node }) => { node.inert = true; });
    const controls = () => Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, textarea, [tabindex="0"]')).filter(node => node.getClientRects().length > 0);
    (controls()[0] ?? panel.querySelector<HTMLElement>('.wf-overlay'))?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const list = controls();
      if (!list.length) { event.preventDefault(); return; }
      const index = list.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0 || !event.shiftKey && (index < 0 || index === list.length - 1)) {
        event.preventDefault(); list[event.shiftKey ? list.length - 1 : 0].focus();
      }
    };
    panel.addEventListener('keydown', trap);
    return () => { panel.removeEventListener('keydown', trap); saved.forEach(({ node, inert }) => { node.inert = inert; }); if (previous?.isConnected && !previous.closest('[inert]')) previous.focus(); };
  }, []);
  return <div ref={layer} className="wf-modal-layer"><div ref={ref} role="dialog" aria-modal="true" tabIndex={-1} {...props} className={`wf-overlay ${className}`}>{children}</div></div>;
});
