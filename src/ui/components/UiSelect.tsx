import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { APP_ICONS, UiIcon, type UiIconComponent } from '../icons';

export interface UiSelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: UiIconComponent;
  disabled?: boolean;
}

export interface UiSelectProps {
  value: string;
  options: UiSelectOption[];
  onChange(value: string): void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
  ariaLabel?: string;
}

function eventPathIncludes(event: Event, node: Node | null): boolean {
  return Boolean(node && event.composedPath().includes(node));
}

export function UiSelect({
  value,
  options,
  onChange,
  placeholder = '请选择',
  disabled = false,
  searchable = false,
  searchPlaceholder = '搜索选项',
  className = '',
  ariaLabel,
}: UiSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();
  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) return options;
    return options.filter((option) => (
      option.label.toLocaleLowerCase().includes(keyword)
      || option.value.toLocaleLowerCase().includes(keyword)
      || option.description?.toLocaleLowerCase().includes(keyword)
    ));
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const openMenu = () => {
    if (disabled || !options.length) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = Math.min(
      320,
      Math.max(92, options.length * 47 + (searchable ? 52 : 10)),
    );
    const availableBelow = window.innerHeight - rect.bottom - 12;
    const availableAbove = rect.top - 12;
    const openAbove = availableBelow < Math.min(menuHeight, 180) && availableAbove > availableBelow;
    const maxHeight = Math.max(92, Math.min(menuHeight, openAbove ? availableAbove : availableBelow));
    const hasDescriptions = options.some((option) => Boolean(option.description));
    const preferredWidth = searchable || hasDescriptions ? Math.max(rect.width, 260) : rect.width;
    const menuWidth = Math.min(preferredWidth, window.innerWidth - 24);
    setMenuStyle({
      left: `${Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12))}px`,
      top: `${openAbove ? Math.max(12, rect.top - maxHeight - 6) : rect.bottom + 6}px`,
      width: `${menuWidth}px`,
      maxHeight: `${maxHeight}px`,
    });
    setOpen(true);
    if (searchable) window.setTimeout(() => searchRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (!eventPathIncludes(event, rootRef.current)) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };
    const handleViewportChange = (event: Event) => {
      if (eventPathIncludes(event, menuRef.current)) return;
      close();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`bvs-ui-select${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        className="bvs-ui-select-trigger"
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled || !options.length}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!open) openMenu();
          }
        }}
      >
        <span className="bvs-ui-select-value">
          {selected?.icon ? <UiIcon icon={selected.icon} size={16} /> : null}
          <span>
            <strong>{selected?.label || placeholder}</strong>
            {selected?.description ? <small>{selected.description}</small> : null}
          </span>
        </span>
        <UiIcon className="bvs-ui-select-chevron" icon={APP_ICONS.expand} size={16} />
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={listboxId}
          className="bvs-ui-select-menu"
          role="listbox"
          aria-label={ariaLabel}
          style={menuStyle}
        >
          {searchable ? (
            <label className="bvs-ui-select-search">
              <UiIcon icon={APP_ICONS.search} size={15} />
              <input
                ref={searchRef}
                value={query}
                placeholder={searchPlaceholder}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </label>
          ) : null}
          <div className="bvs-ui-select-options">
            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={option.value === value ? 'is-selected' : undefined}
                disabled={option.disabled}
                onClick={() => {
                  onChange(option.value);
                  close();
                  buttonRef.current?.focus();
                }}
              >
                {option.icon ? (
                  <span className="bvs-ui-select-option-icon">
                    <UiIcon icon={option.icon} size={16} />
                  </span>
                ) : null}
                <span className="bvs-ui-select-option-copy">
                  <strong>{option.label}</strong>
                  {option.description ? <small>{option.description}</small> : null}
                </span>
                {option.value === value ? <UiIcon icon={APP_ICONS.check} size={16} /> : null}
              </button>
            ))}
            {!filteredOptions.length ? (
              <p className="bvs-ui-select-empty">没有匹配的选项</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
