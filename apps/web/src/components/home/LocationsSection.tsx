import type { StoreLocationDTO } from '@tools-jamaica/shared';
import { Icon } from '../ui/Icon.js';
import { ImageWithFallback } from '../ui/ImageWithFallback.js';

interface Labels {
  heading: string;
  sub: string;
  directions: string;
}

/** The branch list. Addresses are never translated; name and hours are. */
export function LocationsSection({
  locations,
  labels,
}: {
  locations: StoreLocationDTO[];
  labels: Labels;
}) {
  if (locations.length === 0) return null;

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-headline-lg text-primary">{labels.heading}</h2>
        <p className="mt-1 text-body-md text-ink-muted">{labels.sub}</p>
      </div>
      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((loc) => (
          <div
            key={loc.id}
            className="flex flex-col overflow-hidden rounded-card border border-border bg-surface"
          >
            {loc.imageUrl && (
              <ImageWithFallback
                src={loc.imageUrl}
                alt=""
                className="aspect-[16/9] w-full"
                imgClassName="object-cover"
              />
            )}
            <div className="flex flex-1 flex-col gap-1.5 p-4">
              <h3 className="font-display text-headline-sm text-ink">{loc.name}</h3>
              <p className="flex items-start gap-1.5 text-body-sm text-ink-muted">
                <Icon name="pin" className="mt-0.5 shrink-0" />
                {loc.address}
              </p>
              {loc.phone && (
                <a
                  href={`tel:${loc.phone.replace(/[^\d+]/g, '')}`}
                  className="flex items-center gap-1.5 text-body-sm text-ink-muted hover:text-primary"
                >
                  <Icon name="phone" className="shrink-0" />
                  {loc.phone}
                </a>
              )}
              {loc.hours && <p className="text-label-sm text-ink-muted">{loc.hours}</p>}
              {loc.mapUrl && (
                <a
                  href={loc.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto pt-2 text-label-sm font-semibold text-accent hover:underline"
                >
                  {labels.directions}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
