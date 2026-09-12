import type {
  HomeHeroDTO,
  HomeTileDTO,
  HomeTileSlot,
  StoreLocationDTO,
} from '@tools-jamaica/shared';
import type { HomeHeroRow, HomeTileRow, StoreLocationRow } from '../../types/db.js';
import { DEFAULT_LOCALE, pick, pickNullable, type Locale } from '../../lib/locale.js';

/**
 * Homepage content mappers. Same rule as catalog/mappers.ts: `locale` is a
 * TRAILING, DEFAULTED parameter, so the admin variants (which must show the raw
 * English + `_es` fields for editing) get English by simply not passing one.
 */

export function toHomeHeroDTO(row: HomeHeroRow, locale: Locale = DEFAULT_LOCALE): HomeHeroDTO {
  return {
    imageUrl: row.image_url,
    eyebrow: pickNullable(locale, row.eyebrow, row.eyebrow_es),
    headline: pick(locale, row.headline, row.headline_es),
    subcopy: pickNullable(locale, row.subcopy, row.subcopy_es),
    ctaLabel: pickNullable(locale, row.cta_label, row.cta_label_es),
    ctaHref: row.cta_href,
  };
}

export function toHomeTileDTO(row: HomeTileRow, locale: Locale = DEFAULT_LOCALE): HomeTileDTO {
  return {
    id: row.id,
    slot: row.slot as HomeTileSlot,
    title: pick(locale, row.title, row.title_es),
    body: pickNullable(locale, row.body, row.body_es),
    icon: row.icon,
    imageUrl: row.image_url,
    href: row.href,
    sortOrder: row.sort_order,
  };
}

export function toStoreLocationDTO(
  row: StoreLocationRow,
  locale: Locale = DEFAULT_LOCALE,
): StoreLocationDTO {
  return {
    id: row.id,
    name: pick(locale, row.name, row.name_es),
    address: row.address,
    phone: row.phone,
    hours: pickNullable(locale, row.hours, row.hours_es),
    mapUrl: row.map_url,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
  };
}
