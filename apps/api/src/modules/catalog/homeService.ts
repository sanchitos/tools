import type {
  BrandDTO,
  HomeContentDTO,
  HomeTileDTO,
  StoreLocationDTO,
} from '@tools-jamaica/shared';
import { db } from '../../lib/supabase.js';
import { AppError } from '../../lib/errors.js';
import type { BrandRow, HomeHeroRow, HomeTileRow, StoreLocationRow } from '../../types/db.js';
import { DEFAULT_LOCALE, type Locale } from '../../lib/locale.js';
import { toBrandDTO } from './mappers.js';
import { toHomeHeroDTO, toHomeTileDTO, toStoreLocationDTO } from './homeMappers.js';

function fail(message: string, details?: unknown): never {
  throw AppError.Internal(message, details);
}

export async function listLocations(
  locale: Locale = DEFAULT_LOCALE,
): Promise<StoreLocationDTO[]> {
  const { data, error } = await db
    .from('store_locations')
    .select('*')
    .eq('is_published', true)
    .order('sort_order', { ascending: true });
  if (error) fail('Failed to load locations', error.message);
  return (data as StoreLocationRow[]).map((r) => toStoreLocationDTO(r, locale));
}

export async function listFeaturedBrands(): Promise<BrandDTO[]> {
  const { data, error } = await db
    .from('brands')
    .select('*')
    .eq('is_featured', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) fail('Failed to load featured brands', error.message);
  return (data as BrandRow[]).map(toBrandDTO);
}

/**
 * ONE payload for the whole homepage. The page already fired three requests
 * when it was hardcoded; splitting these per block would take it to eight.
 * `/locations` stays separate and small because the Footer renders on every
 * page and must not pull the whole homepage to show three addresses.
 */
export async function getHomeContent(
  locale: Locale = DEFAULT_LOCALE,
): Promise<HomeContentDTO> {
  const [heroRes, tilesRes, featuredBrands, locations] = await Promise.all([
    db.from('home_hero').select('*').maybeSingle(),
    db
      .from('home_tiles')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true }),
    listFeaturedBrands(),
    listLocations(locale),
  ]);

  if (heroRes.error) fail('Failed to load hero', heroRes.error.message);
  if (tilesRes.error) fail('Failed to load home tiles', tilesRes.error.message);

  const tiles = (tilesRes.data as HomeTileRow[]).map((r) => toHomeTileDTO(r, locale));
  const inSlot = (slot: HomeTileDTO['slot']) => tiles.filter((t) => t.slot === slot);

  return {
    // Null rather than a fabricated default: the page renders its static
    // fallback markup if the client has not seeded a hero yet.
    hero: heroRes.data ? toHomeHeroDTO(heroRes.data as HomeHeroRow, locale) : null,
    promos: inSlot('promo'),
    services: inSlot('service'),
    ticker: inSlot('ticker'),
    featuredBrands,
    locations,
  };
}
