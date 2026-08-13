import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

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
  // When true, a text input appears at the top of the open menu to filter
  // a long options list client-side (case-insensitive substring match on
  // label) - meant for lists too long to scan by scrolling alone, e.g. the
  // ~300-entry Tamil Nadu district+town location list.
  searchable = false,
  searchPlaceholder = 'Search…',
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [filterText, setFilterText] = useState('');
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchInputRef = useRef(null);

  const normalized = options.map((o) =>
    typeof o === 'string' || typeof o === 'number' ? { value: o, label: String(o) } : o
  );

  const visible = useMemo(() => {
    if (!searchable || !filterText.trim()) return normalized;
    const needle = filterText.trim().toLowerCase();
    return normalized.filter((o) => o.label.toLowerCase().includes(needle));
  }, [normalized, searchable, filterText]);

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
    setFilterText('');
    setOpen(true);
  };

  // Autofocus the filter input the moment the menu opens, so a keyboard/
  // Bluetooth-keyboard user (or desktop browser) can start typing straight
  // away instead of needing an extra tap first.
  useEffect(() => {
    if (open && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open, searchable]);

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
    // A `searchable` menu autofocuses its input (see effect above), which
    // pops the on-screen keyboard on mobile/native - and the keyboard's
    // slide-in animation can itself fire a 'scroll' (auto-scrolling the
    // focused input into view) and/or 'resize' (shrinking the visual
    // viewport height) event, either of which used to close the menu the
    // instant it opened, before the user could type or tap anything. A
    // short grace period after opening absorbs that transient animation
    // without meaningfully weakening the "scrolling the real page behind
    // the menu closes it" behavior the two listeners exist for.
    const openedAt = Date.now();
    const GRACE_MS = 400;
    const handleScroll = (e) => {
      if (Date.now() - openedAt < GRACE_MS) return;
      // e.target is the window object (not a Node) when the scroll event
      // fires on the document/viewport itself rather than a scrollable
      // element - contains() throws a TypeError given a non-Node argument,
      // which would otherwise abort this handler and leave the menu stuck
      // open exactly when scrolling the page behind it.
      if (e.target instanceof Node && menuRef.current && menuRef.current.contains(e.target)) return;
      close();
    };
    // Real layout changes that should still close the menu (rotation,
    // split-screen, resizing the window) always change the WIDTH too, so
    // that's checked in addition to the grace period - a height-only change
    // right after opening is assumed to be the keyboard and is ignored.
    const openWidth = window.innerWidth;
    const handleResize = () => {
      if (Date.now() - openedAt < GRACE_MS) return;
      if (window.innerWidth !== openWidth) close();
    };
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
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
            {searchable && (
              <div className="custom-select-search">
                <Search className="custom-select-search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="custom-select-search-input"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
            {visible.length === 0 ? (
              <div className="custom-select-empty">{filterText.trim() ? 'No matches' : emptyLabel}</div>
            ) : visible.map((opt) => (
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
