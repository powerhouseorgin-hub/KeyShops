import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

// App-wide replacement for the native <select> popup. Visually it matches
// the old `select.sel` field (see index.css) exactly, but the open menu is
// a fully custom-rendered, app-styled panel instead of the browser/OS's own
// dropdown - so it looks and animates identically across every browser and
// platform (including the Android WebView build), and can live happily
// inside scrollable dialogs since it's portaled to <body> and positioned
// with `position: fixed` off the trigger's own bounding box.
//
// `options` is a plain array of either strings or { value, label, disabled }
// objects - both forms are accepted so call sites that used to just
// `.map()` a string array into <option> tags need minimal changes.
export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  disabled = false,
  className = '',
  triggerStyle,
  emptyLabel = 'No options available',
  id,
  icon: Icon,
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const normalized = options.map((o) =>
    typeof o === 'string' || typeof o === 'number' ? { value: o, label: String(o) } : o
  );

  const selected = normalized.find((o) => String(o.value) === String(value));

  const close = useCallback(() => setOpen(false), []);

  const openMenu = () => {
    if (disabled) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuMaxHeight = 280;
    const openUpward = spaceBelow < menuMaxHeight && rect.top > spaceBelow;
    setMenuStyle({
      left: rect.left,
      width: rect.width,
      maxHeight: menuMaxHeight,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    // Scrolling the PAGE behind the menu can invalidate the trigger's
    // snapshotted bounding box, so close rather than risk the menu floating
    // in the wrong spot - matches how the header's "search by" dropdown
    // behaves. But the capture-phase listener also sees scroll events
    // bubbling up from the menu's own option list (it has its own
    // overflow-y scroll for long lists like Shop Management's shop
    // picker) - without excluding those, the menu closed itself the
    // instant a user tried to scroll through options to find one.
    const handleScroll = (e) => {
      // e.target is the window object (not a Node) when the scroll event
      // fires on the document/viewport itself rather than a scrollable
      // element - contains() throws a TypeError given a non-Node argument,
      // which would otherwise abort this handler and leave the menu stuck
      // open exactly when scrolling the page behind it.
      if (e.target instanceof Node && menuRef.current && menuRef.current.contains(e.target)) return;
      close();
    };
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', close);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <div className={`custom-select ${className}`}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        disabled={disabled}
        className={`custom-select-trigger ${open ? 'open' : ''} ${!selected ? 'placeholder' : ''}`}
        style={triggerStyle}
        onClick={() => (open ? close() : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {Icon && <Icon className="custom-select-icon" />}
        <span className="custom-select-value">{selected ? selected.label : placeholder}</span>
        <ChevronDown className="custom-select-arrow" />
      </button>

      {open && menuStyle && createPortal(
        <>
          <div className="custom-select-backdrop" onClick={close} />
          <div ref={menuRef} className="custom-select-menu animate-fade-in" style={menuStyle} role="listbox">
            {normalized.length === 0 ? (
              <div className="custom-select-empty">{emptyLabel}</div>
            ) : normalized.map((opt) => (
              <button
                type="button"
                key={String(opt.value)}
                role="option"
                aria-selected={String(opt.value) === String(value)}
                disabled={!!opt.disabled}
                className={`custom-select-item ${String(opt.value) === String(value) ? 'active' : ''} ${opt.disabled ? 'disabled' : ''}`}
                onClick={() => {
                  if (opt.disabled) return;
                  onChange(opt.value);
                  close();
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
