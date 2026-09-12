import { Routes, Route } from 'react-router-dom';
import { useLocale } from './i18n/LocaleContext.js';
import { PublicLayout } from './components/PublicLayout.js';
import { AdminLayout } from './components/admin/AdminLayout.js';
import HomePage from './pages/HomePage.js';
import ShopPage from './pages/ShopPage.js';
import ProductDetailPage from './pages/ProductDetailPage.js';
import CartPage from './pages/CartPage.js';
import CheckoutPage from './pages/CheckoutPage.js';
import OrderConfirmationPage from './pages/OrderConfirmationPage.js';
import NotFoundPage from './pages/NotFoundPage.js';
import SignupPage from './pages/SignupPage.js';
import LoginPage from './pages/LoginPage.js';
import ConfirmEmailPage from './pages/ConfirmEmailPage.js';
import AccountPage from './pages/AccountPage.js';
import AdminLoginPage from './pages/admin/AdminLoginPage.js';
import AdminProductsPage from './pages/admin/AdminProductsPage.js';
import ProductEditorPage from './pages/admin/ProductEditorPage.js';
import AdminCategoriesPage from './pages/admin/AdminCategoriesPage.js';
import AdminBrandsPage from './pages/admin/AdminBrandsPage.js';
import AdminHomePage from './pages/admin/AdminHomePage.js';
import AdminLocationsPage from './pages/admin/AdminLocationsPage.js';
import AdminOrdersPage from './pages/admin/AdminOrdersPage.js';
import AdminOrderDetailPage from './pages/admin/AdminOrderDetailPage.js';
import AdminUsersPage from './pages/admin/AdminUsersPage.js';

/** Route table: public storefront (Stitch design) + admin back-office (gated). */
export default function App() {
  const { locale } = useLocale();

  // `key={locale}` remounts the routed tree on a language switch, which refires
  // every catalog fetch. There are 12+ such call sites; adding `locale` to each
  // useAsync dep array and missing one yields a half-translated page nobody
  // notices until a customer does. Audited casualties: ShopPage filters are
  // URL-synced (safe), the cart lives above <Routes> (safe), scroll position is
  // lost (acceptable), and CheckoutPage form state is lost — which is why the
  // LocaleSwitcher hides itself on /checkout.
  return (
    <Routes key={locale}>
      {/* Public storefront */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/product/:slug" element={<ProductDetailPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/order/:orderNumber" element={<OrderConfirmationPage />} />
        {/* Customer accounts — siblings of the routes above so the `*`
            catch-all below stays last. */}
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/confirm" element={<ConfirmEmailPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Admin back-office */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminProductsPage />} />
        <Route path="products/new" element={<ProductEditorPage />} />
        <Route path="products/:id" element={<ProductEditorPage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="brands" element={<AdminBrandsPage />} />
        <Route path="homepage" element={<AdminHomePage />} />
        <Route path="locations" element={<AdminLocationsPage />} />
        <Route path="orders" element={<AdminOrdersPage />} />
        <Route path="orders/:id" element={<AdminOrderDetailPage />} />
        <Route path="users" element={<AdminUsersPage />} />
      </Route>
    </Routes>
  );
}
