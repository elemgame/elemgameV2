import { useEffect, useCallback, useRef } from 'react';

/**
 * Spatial keyboard navigation hook.
 * Tab enters navigation mode, arrow keys move focus between [data-nav] elements.
 * Enter/Space activates the focused element.
 */

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

function getRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return {
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
  };
}

function getNavigableElements(): HTMLElement[] {
  const els = document.querySelectorAll<HTMLElement>(
    '[data-nav]:not([data-nav-disabled="true"]):not([disabled])'
  );
  return Array.from(els).filter((el) => {
    // Must be visible
    const style = window.getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      el.offsetParent !== null
    );
  });
}

type Direction = 'up' | 'down' | 'left' | 'right';

function findNextElement(
  current: HTMLElement,
  direction: Direction,
  elements: HTMLElement[]
): HTMLElement | null {
  const currentRect = getRect(current);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of elements) {
    if (el === current) continue;
    const rect = getRect(el);

    // Check direction constraint
    let isInDirection = false;
    let distance = 0;

    switch (direction) {
      case 'up':
        isInDirection = rect.cy < currentRect.cy - 5;
        distance = currentRect.cy - rect.cy + Math.abs(rect.cx - currentRect.cx) * 0.4;
        break;
      case 'down':
        isInDirection = rect.cy > currentRect.cy + 5;
        distance = rect.cy - currentRect.cy + Math.abs(rect.cx - currentRect.cx) * 0.4;
        break;
      case 'left':
        isInDirection = rect.cx < currentRect.cx - 5;
        distance = currentRect.cx - rect.cx + Math.abs(rect.cy - currentRect.cy) * 0.4;
        break;
      case 'right':
        isInDirection = rect.cx > currentRect.cx + 5;
        distance = rect.cx - currentRect.cx + Math.abs(rect.cy - currentRect.cy) * 0.4;
        break;
    }

    if (isInDirection && distance < bestScore) {
      bestScore = distance;
      best = el;
    }
  }

  return best;
}

export function useSpatialNavigation() {
  const activeRef = useRef<HTMLElement | null>(null);

  const focusElement = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    // Remove focus from previous
    if (activeRef.current) {
      activeRef.current.classList.remove('nav-focused');
      activeRef.current.removeAttribute('data-nav-active');
    }
    // Focus new
    el.classList.add('nav-focused');
    el.setAttribute('data-nav-active', 'true');
    el.focus({ preventScroll: false });
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    activeRef.current = el;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const elements = getNavigableElements();
      if (elements.length === 0) return;

      // Tab: enter nav mode or move to next
      if (e.key === 'Tab') {
        e.preventDefault();
        if (!activeRef.current || !elements.includes(activeRef.current)) {
          focusElement(elements[0]);
        } else {
          const idx = elements.indexOf(activeRef.current);
          const next = e.shiftKey
            ? elements[(idx - 1 + elements.length) % elements.length]
            : elements[(idx + 1) % elements.length];
          focusElement(next);
        }
        return;
      }

      // Arrow keys: spatial navigation
      const dirMap: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };

      if (dirMap[e.key]) {
        e.preventDefault();
        const current = activeRef.current;
        if (!current || !elements.includes(current)) {
          focusElement(elements[0]);
          return;
        }
        const next = findNextElement(current, dirMap[e.key], elements);
        if (next) {
          focusElement(next);
        }
        return;
      }

      // Enter/Space: activate
      if (e.key === 'Enter' || e.key === ' ') {
        if (activeRef.current) {
          e.preventDefault();
          activeRef.current.click();
        }
        return;
      }

      // Escape: exit nav mode
      if (e.key === 'Escape') {
        if (activeRef.current) {
          activeRef.current.classList.remove('nav-focused');
          activeRef.current.removeAttribute('data-nav-active');
          activeRef.current.blur();
          activeRef.current = null;
        }
        return;
      }
    };

    // Also track mouse clicks to update active element
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]');
      if (target) {
        focusElement(target);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClick, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClick, true);
    };
  }, [focusElement]);

  // Reset on screen change — observe DOM mutations
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (activeRef.current && !document.contains(activeRef.current)) {
        activeRef.current = null;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}
