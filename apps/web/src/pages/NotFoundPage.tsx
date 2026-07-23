import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main style={{ padding: 40, fontFamily: 'system-ui, sans-serif' }}>
      <h1>404</h1>
      <p>
        Page not found. <Link to="/">Go home</Link>
      </p>
    </main>
  );
}
