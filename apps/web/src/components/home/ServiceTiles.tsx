import type { HomeTileDTO } from '@tools-jamaica/shared';
import { Icon, type IconName } from '../ui/Icon.js';

/**
 * The trust row. `icon` is plain text in the DB (IconName is a web type
 * Postgres can't see) and is validated against a mirrored literal union in the
 * admin zod schema — so an unknown value here means the two drifted: fall back
 * to a neutral icon rather than crashing the homepage.
 */
const FALLBACK_ICON: IconName = 'check';

export function ServiceTiles({ tiles }: { tiles: HomeTileDTO[] }) {
  if (tiles.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.id} className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent text-accent-fg">
            <Icon name={(tile.icon as IconName) || FALLBACK_ICON} className="text-xl" />
          </span>
          <div>
            <h3 className="text-body-sm font-bold text-ink">{tile.title}</h3>
            {tile.body && <p className="mt-0.5 text-label-sm text-ink-muted">{tile.body}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
