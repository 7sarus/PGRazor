import { useId, useRef, useState } from 'react';
import { settingGroups } from '../content.js';

// An ARIA tablist for browsing real setting names. Manual activation with
// roving tabindex and arrow / Home / End support per the WAI-ARIA tabs pattern.
export default function SettingsGuide() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef([]);
  const baseId = useId();
  const last = settingGroups.length - 1;

  const onKeyDown = (event) => {
    let next = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = active === last ? 0 : active + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = active === 0 ? last : active - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="guide">
      <div className="guide__tabs" role="tablist" aria-label="Settings categories">
        {settingGroups.map((group, index) => {
          const selected = index === active;
          return (
            <button
              key={group.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${group.id}`}
              className="guide__tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${group.id}`}
              tabIndex={selected ? 0 : -1}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              onClick={() => setActive(index)}
              onKeyDown={onKeyDown}
            >
              {group.label}
            </button>
          );
        })}
      </div>

      {settingGroups.map((group, index) => (
        <div
          key={group.id}
          role="tabpanel"
          id={`${baseId}-panel-${group.id}`}
          aria-labelledby={`${baseId}-tab-${group.id}`}
          className="guide__panel"
          hidden={index !== active}
          tabIndex={0}
        >
          <p className="guide__intro">{group.intro}</p>
          <dl className="guide__list">
            {group.items.map((item) => (
              <div className="guide__row" key={item.name}>
                <dt>{item.name}</dt>
                <dd>{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
