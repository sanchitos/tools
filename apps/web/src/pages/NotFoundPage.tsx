import { Link } from 'react-router-dom';
import { Container } from '../components/ui/Container.js';
import { useT } from '../i18n/LocaleContext.js';

export default function NotFoundPage() {
  const t = useT();

  return (
    <Container className="py-24 text-center">
      <p className="font-display text-display-md font-bold text-accent">404</p>
      <h1 className="mt-2 font-display text-headline-lg text-primary">{t('notFound.title')}</h1>
      <p className="mt-3 text-body-md text-ink-muted">{t('notFound.body')}</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded bg-primary px-6 py-3 text-label-lg font-semibold text-primary-fg hover:bg-primary-dark"
      >
        {t('notFound.goHome')}
      </Link>
    </Container>
  );
}
