import { Routes, Route } from 'react-router-dom';
import { PublicLayout } from './components/PublicLayout.js';
import { AdminLayout } from './components/admin/AdminLayout.js';
import HomePage from './pages/HomePage.js';
import ShopPage from './pages/ShopPage.js';
import ProductDetailPage from './pages/ProductDetailPage.js';
import NotFoundPage from './pages/NotFoundPage.js';
import AdminLoginPage from './pages/admin/AdminLoginPage.js';
import AdminProductsPage from './pages/admin/AdminProductsPage.js';
import ProductEditorPage from './pages/admin/ProductEditorPage.js';
import AdminCategoriesPage from './pages/admin/AdminCategoriesPage.js';
import AdminBrandsPage from './pages/admin/AdminBrandsPage.js';

/** Route table: public storefront (Stitch design) + admin back-office (gated). */
export default function App() {
  return (
    <Routes>
      {/* Public storefront */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/product/:slug" element={<ProductDetailPage />} />
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
      </Route>
    </Routes>
  );
}
