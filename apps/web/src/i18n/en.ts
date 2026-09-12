/**
 * Canonical UI dictionary. `es.ts` is typed as `Dictionary`, so a missing key
 * is a compile error and an extra key is an excess-property error — the
 * compile-time key safety a library would need module augmentation to give us.
 *
 * FLAT dotted keys, not nested objects, so `keyof typeof en` is the exhaustive
 * key union in one step.
 *
 * Convention: `<area>.<component>.<slot>`. `common.*` is ONLY for strings
 * genuinely reused across two or more areas — never share a key across contexts
 * just because the English happens to match, since Spanish frequently diverges.
 * Plurals are `_one` / `_other` pairs, chosen by the caller.
 *
 * NOT translated here: product/category/brand copy (resolved server-side from
 * the `_es` columns) and prices (`formatPrice` stays en-JM — a Jamaican price
 * is J$ in either language).
 */
export const en = {
  // --- Shared across two or more areas -------------------------------------
  'common.loading': 'Loading…',
  'common.home': 'Home',
  'common.shop': 'Shop',
  'common.cart': 'Cart',
  'common.close': 'Close',
  'common.shopNow': 'Shop now',
  'common.shopProducts': 'Shop products',
  'common.viewAll': 'View all →',
  'common.scrollLeft': 'Scroll left',
  'common.scrollRight': 'Scroll right',
  'common.inStock': 'In stock',
  'common.outOfStock': 'Out of stock',
  'common.addToCart': 'Add to cart',
  'common.soldBy': 'Sold by {brand}',
  'common.sku': 'SKU: {sku}',
  'common.subtotal': 'Subtotal',
  'common.orderSummary': 'Order summary',
  'common.deliveryQuoted': 'Delivery quoted separately.',
  'common.decreaseQuantity': 'Decrease quantity',
  'common.increaseQuantity': 'Increase quantity',
  'common.whatsappUs': 'WhatsApp us',
  'common.starsAria': 'Rated {rating} out of 5',
  'common.removeItem': 'Remove {name}',

  // --- Pagination primitive labels -----------------------------------------
  'pagination.nav': 'Pagination',
  'pagination.first': 'First page',
  'pagination.previous': 'Previous page',
  'pagination.next': 'Next page',
  'pagination.last': 'Last page',

  // --- Header ---------------------------------------------------------------
  'nav.homeAria': 'Tools Jamaica — home',
  'nav.tagline': 'Tools, Hardware & Supplies — Jamaica',
  'nav.allDepartments': 'All departments',
  'nav.searchPlaceholder': 'What are you looking for?',
  'nav.searchAria': 'Search products',
  'nav.searchSubmit': 'Search',
  'nav.whatsapp': 'WhatsApp',
  'nav.admin': 'Admin',
  'nav.cartAria_one': 'Cart, {count} item',
  'nav.cartAria_other': 'Cart, {count} items',
  'nav.location': 'Kingston, Jamaica — islandwide delivery',
  'nav.featured': 'Featured',
  'nav.inStock': 'In stock',
  'nav.topBrands': 'Top brands',
  'nav.shopAll': 'Shop all',
  'nav.language': 'Language',
  'nav.english': 'English',
  'nav.spanish': 'Español',

  // --- Department drawer ----------------------------------------------------
  'departments.title': 'All departments',
  'departments.shopAll': 'Shop all products',

  // --- Footer ---------------------------------------------------------------
  'footer.questions': 'Questions? We reply on WhatsApp.',
  'footer.shop': 'Shop',
  'footer.allProducts': 'All products',
  'footer.featured': 'Featured',
  'footer.inStock': 'In stock',
  'footer.departments': 'Departments',
  'footer.browseAll': 'Browse all',
  'footer.company': 'Company',
  'footer.companyBlurb':
    'Tools Jamaica supplies quality hardware and home-improvement products to contractors and DIY builders across the island.',
  'footer.help': 'Help',
  'footer.locations': 'Locations',
  'footer.admin': 'Admin',
  'footer.backOffice': 'Back office',
  'footer.rights': '© {year} Tools Jamaica. All rights reserved.',

  // --- Home -----------------------------------------------------------------
  // The hero, trust tiles, ticker, brand rail and locations are ADMIN-EDITABLE
  // content (0010_homepage_content.sql) and carry their own `_es` columns — so
  // they are not keys here. Only the page's own chrome is.
  'home.featuredRail': 'Featured this week',
  'home.noFeatured': 'No featured products yet.',
  'home.catalogRail': 'More from the catalog',
  'home.noProducts': 'No products yet.',
  'home.needItToday': 'Need it today?',
  'home.needItTodaySub': 'Message us on WhatsApp for fast quotes.',
  'home.shopByDepartment': 'Shop by department',
  'home.ctaHeading': 'Ready to start your next project?',
  'home.ctaSub': 'Browse the full catalog and build with confidence.',
  'home.visitUs': 'Visit us',
  'home.visitUsSub': 'Find the branch nearest you.',
  'home.getDirections': 'Get directions',
  'home.topBrands': 'Top brands',

  // --- Shop -----------------------------------------------------------------
  'shop.title': 'Shop',
  'shop.count_one': '{count} product',
  'shop.count_other': '{count} products',
  'shop.sortBy': 'Sort by',
  'shop.sortAria': 'Sort products',
  'shop.sort.featured': 'Featured',
  'shop.sort.priceAsc': 'Price: Low to High',
  'shop.sort.priceDesc': 'Price: High to Low',
  'shop.sort.name': 'Name A–Z',
  'shop.sort.relevance': 'Relevance',
  'shop.filters': 'Filters',
  'shop.clearAll': 'Clear all',
  'shop.apply': 'Apply',
  'shop.noResults': 'No products match your filters.',
  'shop.filter.category': 'Category',
  'shop.filter.brand': 'Brand',
  'shop.filter.noBrands': 'No brands',
  'shop.filter.price': 'Price (J$)',
  'shop.filter.min': 'Min',
  'shop.filter.max': 'Max',
  'shop.filter.inStockOnly': 'In stock only',

  // --- Product card ---------------------------------------------------------
  'card.featured': 'Featured',
  'card.lowStock': 'Low stock',
  'card.add': 'Add',

  // --- Product detail -------------------------------------------------------
  'product.notFound': 'Product not found',
  'product.notFoundBody': 'This product may have been removed.',
  'product.backToShop': '← Back to shop',
  'product.viewImage': 'View image {n}',
  'product.previousImage': 'Previous image',
  'product.nextImage': 'Next image',
  'product.getThisProduct': 'Get this product',
  'product.quantity': 'Quantity',
  'product.enquireWhatsapp': 'Enquire on WhatsApp',
  'product.enquiryMessage': "Hi, I'm interested in {name} ({ref}).",
  'product.description': 'Description',
  'product.specifications': 'Specifications',
  'product.recommended': 'Recommended products',
  'product.trust.delivery': 'Islandwide delivery',
  'product.trust.genuine': 'Genuine brands only',
  'product.trust.advice': 'Expert advice by phone',

  // --- Cart -----------------------------------------------------------------
  'cart.title': 'Your cart',
  'cart.empty': 'Your cart is empty',
  'cart.clear': 'Clear cart',
  'cart.clearConfirmTitle': 'Clear cart?',
  'cart.clearConfirmBody': "This removes every item from your cart. This can't be undone.",
  'cart.checkout': 'Checkout',
  'cart.proceedToCheckout': 'Proceed to checkout',
  'cart.viewCart': 'View cart',
  'cart.cancel': 'Cancel',
  'cart.working': 'Working…',

  // --- Checkout -------------------------------------------------------------
  'checkout.title': 'Checkout',
  'checkout.fullName': 'Full name*',
  'checkout.fullNamePlaceholder': 'Jane Shopper',
  'checkout.phone': 'Phone*',
  'checkout.phonePlaceholder': '+1 (876) 555-1234',
  'checkout.email': 'Email',
  'checkout.emailPlaceholder': 'you@example.com',
  'checkout.fulfillment': 'Fulfillment',
  'checkout.pickup': 'Pickup',
  'checkout.delivery': 'Delivery',
  'checkout.address': 'Delivery address*',
  'checkout.addressPlaceholder': 'Street, town, parish',
  'checkout.notes': 'Notes',
  'checkout.notesPlaceholder': 'Anything we should know?',
  'checkout.placeOrder': 'Place order',
  'checkout.placingOrder': 'Placing order…',
  'checkout.backToCart': 'Back to cart',
  'checkout.noPayment': 'No payment is collected online.',
  'checkout.error.name': 'Enter your full name',
  'checkout.error.phone': 'Enter a valid phone number',
  'checkout.error.email': 'Enter a valid email address',
  'checkout.error.address': 'Delivery address is required',
  'checkout.error.generic': 'Something went wrong. Please try again.',

  // --- Order confirmation ---------------------------------------------------
  'order.received': 'Order {number} received',
  'order.willContact': "We'll call or WhatsApp you to confirm availability and arrange payment.",
  'order.onFile':
    "We have your order on file. Message us on WhatsApp with your order number and we'll confirm availability and arrange payment.",
  'order.sendWhatsapp': 'Send us this order on WhatsApp',
  'order.followUpMessage': "Hi Tools Jamaica! I'd like to follow up on order {number}.",
  'order.continueShopping': 'Continue shopping',

  // --- Misc -----------------------------------------------------------------
  'whatsapp.fabAria': 'Chat with us on WhatsApp',
  'whatsapp.fabLabel': 'Chat with us',
  'whatsapp.defaultMessage': "Hi Tools Jamaica! I'd like to ask about a product.",
  'notFound.title': 'Page not found',
  'notFound.body': 'The page you were looking for does not exist.',
  'notFound.goHome': 'Go home',
} as const;

export type TranslationKey = keyof typeof en;
export type Dictionary = Record<TranslationKey, string>;
